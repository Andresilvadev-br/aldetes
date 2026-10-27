import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { registerSchema, loginSchema, passwordSchema, ServerEvents } from '@aldetes/shared';
import type { AppContext } from '../context';
import { hashPassword, verifyPassword, needsRehash, randomToken, sha256 } from '../lib/crypto';
import { snowflake } from '../lib/snowflake';
import { badRequest, conflict, unauthorized, notFound } from '../lib/errors';
import { selfUser } from '../services/serialize';
import { SESSION_COOKIE, invalidateSessionCache } from '../auth';
import { rooms } from '../gateway';

// Pre-computed hash so login timing doesn't reveal whether a user exists.
let dummyHash: Promise<string> | null = null;

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, cfg } = ctx;
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  async function createSession(req: FastifyRequest, reply: FastifyReply, userId: string, deviceName?: string) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86400_000);
    await db.session.create({
      data: {
        id: snowflake(),
        userId,
        tokenHash: sha256(token),
        deviceName: (deviceName ?? guessDevice(req.headers['user-agent'] ?? '')).slice(0, 64),
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 256),
        ip: req.ip,
        expiresAt,
      },
    });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cfg.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
    return token;
  }

  app.post('/auth/register', strict, async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await db.user.findFirst({ where: { OR: [{ email }, { username: body.username }] } });
    if (existing) throw conflict(existing.email === email ? 'E-mail já cadastrado' : 'Nome de usuário em uso');
    const user = await db.user.create({
      data: {
        id: snowflake(),
        email,
        username: body.username,
        displayName: body.displayName?.trim() || body.username,
        passwordHash: await hashPassword(body.password),
      },
    });
    const token = await createSession(req, reply, user.id);
    return reply.status(201).send({ token, user: selfUser(user) });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const login = body.login.trim();
    const user = await db.user.findFirst({
      where: login.includes('@') ? { email: login.toLowerCase() } : { username: login.toLowerCase() },
    });
    if (!user) {
      dummyHash ??= hashPassword('dummy-password-for-timing');
      await verifyPassword(await dummyHash, body.password);
      throw unauthorized('Credenciais inválidas');
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) throw unauthorized('Credenciais inválidas');
    if (needsRehash(user.passwordHash)) {
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
    }
    const token = await createSession(req, reply, user.id, body.deviceName);
    return { token, user: selfUser(user) };
  });

  app.post('/auth/logout', { preHandler: ctx.authenticate }, async (req, reply) => {
    const s = await db.session.delete({ where: { id: req.auth.sessionId } }).catch(() => null);
    if (s) await invalidateSessionCache(ctx, s.tokenHash);
    ctx.io.in(rooms.session(req.auth.sessionId)).disconnectSockets(true);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/auth/forgot-password', strict, async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = randomToken(32);
      await db.passwordReset.create({
        data: { id: snowflake(), userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) },
      });
      const link = `${cfg.WEB_PUBLIC_URL.replace(/\/$/, '')}/#/reset-password?token=${token}`;
      await ctx.mailer.send(
        user.email,
        'Aldetes — redefinição de senha',
        `Olá ${user.displayName},\n\nPara redefinir sua senha, acesse (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.`,
      );
    }
    // Always same answer (no account enumeration)
    return { ok: true };
  });

  app.post('/auth/reset-password', strict, async (req) => {
    const body = z.object({ token: z.string().min(10).max(200), password: passwordSchema }).parse(req.body);
    const reset = await db.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw badRequest('Link inválido ou expirado');
    await db.$transaction([
      db.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(body.password) } }),
      db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ]);
    await revokeAllSessions(ctx, reset.userId);
    return { ok: true };
  });

  app.post('/auth/change-password', { preHandler: ctx.authenticate, ...strict }, async (req) => {
    const body = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
    const user = await db.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) throw unauthorized('Senha atual incorreta');
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await revokeAllSessions(ctx, user.id, req.auth.sessionId);
    return { ok: true };
  });

  // --- Device / session management ---
  app.get('/auth/sessions', { preHandler: ctx.authenticate }, async (req) => {
    const sessions = await db.session.findMany({ where: { userId: req.auth.userId }, orderBy: { lastUsedAt: 'desc' } });
    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === req.auth.sessionId,
    }));
  });

  app.delete('/auth/sessions/:id', { preHandler: ctx.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const s = await db.session.findFirst({ where: { id, userId: req.auth.userId } });
    if (!s) throw notFound();
    await db.session.delete({ where: { id } });
    await invalidateSessionCache(ctx, s.tokenHash);
    ctx.io.to(rooms.session(id)).emit(ServerEvents.SESSION_REVOKED, {});
    ctx.io.in(rooms.session(id)).disconnectSockets(true);
    return { ok: true };
  });
}

export async function revokeAllSessions(ctx: AppContext, userId: string, exceptSessionId?: string) {
  const sessions = await ctx.db.session.findMany({ where: { userId, id: exceptSessionId ? { not: exceptSessionId } : undefined } });
  await ctx.db.session.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
  for (const s of sessions) {
    await invalidateSessionCache(ctx, s.tokenHash);
    ctx.io.to(rooms.session(s.id)).emit(ServerEvents.SESSION_REVOKED, {});
    ctx.io.in(rooms.session(s.id)).disconnectSockets(true);
  }
}

function guessDevice(ua: string): string {
  const app = ua.includes('Electron') ? 'Aldetes Desktop' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${app} · ${os}` : app;
}
