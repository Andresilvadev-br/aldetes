import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createServerSchema, updateServerSchema, ServerEvents, Permissions, DEFAULT_EVERYONE_PERMISSIONS, hasPermission, studioThemeSchema, studioLevel } from '@aldetes/shared';
import { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import * as S from '../services/serialize';
import { requireServer, assertCanActOn } from '../services/permissions';
import { setMemberRoles } from './roles';
import { buildServerPayload } from '../services/ready';
import { audit } from '../services/audit';
import { addMember, removeMember } from '../services/members';
import { rooms } from '../gateway';

export function serverRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  app.post('/servers', { ...auth, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = createServerSchema.parse(req.body);
    const me = req.auth.userId;
    const count = await db.member.count({ where: { userId: me } });
    if (count >= 100) throw badRequest('Limite de 100 servidores atingido');
    const serverId = snowflake();
    const textCat = snowflake();
    const voiceCat = snowflake();
    const general = snowflake();
    await db.$transaction([
      db.server.create({ data: { id: serverId, name: body.name.trim(), ownerId: me, isPublic: body.isPublic ?? false } }),
      db.role.create({
        data: { id: snowflake(), serverId, name: '@everyone', isEveryone: true, position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS.toString() },
      }),
      db.member.create({ data: { serverId, userId: me } }),
      db.channel.createMany({
        data: [
          { id: textCat, serverId, type: 'category', name: 'Canais de texto', position: 0 },
          { id: general, serverId, type: 'text', name: 'geral', position: 0, parentId: textCat },
          { id: voiceCat, serverId, type: 'category', name: 'Canais de voz', position: 1 },
          { id: snowflake(), serverId, type: 'voice', name: 'Geral', position: 0, parentId: voiceCat },
        ],
      }),
      db.server.update({ where: { id: serverId }, data: { welcomeChannelId: general } }),
    ]);
    await audit(ctx, serverId, me, 'server_create', serverId);
    await ctx.gw.syncServerSubscriptions(serverId, me);
    const payload = await buildServerPayload(ctx, serverId, me);
    ctx.gw.toUser(me, ServerEvents.SERVER_JOIN, payload);
    return reply.status(201).send(payload);
  });

  app.get('/servers/discover', auth, async (req) => {
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    const servers = await db.server.findMany({
      where: { isPublic: true, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
      include: { _count: { select: { members: true } } },
      orderBy: { members: { _count: 'desc' } },
      take: 50,
    });
    return servers.map((s) => ({ ...S.server(s), memberCount: s._count.members }));
  });

  app.post('/servers/:id/join', auth, async (req) => {
    const { id } = req.params as { id: string };
    const server = await db.server.findUnique({ where: { id } });
    if (!server || !server.isPublic) throw notFound('Servidor não encontrado');
    await addMember(ctx, id, req.auth.userId);
    return buildServerPayload(ctx, id, req.auth.userId);
  });

  app.get('/servers/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const p = await buildServerPayload(ctx, id, req.auth.userId);
    if (!p) throw notFound('Servidor não encontrado');
    return p;
  });

  app.patch('/servers/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateServerSchema.parse(req.body);
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    for (const cid of [body.rulesChannelId, body.welcomeChannelId]) {
      if (cid && !(await db.channel.findFirst({ where: { id: cid, serverId: id, type: { in: ['text', 'announcement'] } } })))
        throw badRequest('Canal inválido');
    }
    const s = await db.server.update({ where: { id }, data: body });
    await audit(ctx, id, req.auth.userId, 'server_update', id, body);
    ctx.gw.toServer(id, ServerEvents.SERVER_UPDATE, S.server(s));
    return S.server(s);
  });

  // ---------- Server Studio: draft → publish → revert (MANAGE_SERVER only) ----------
  const studioLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  app.get('/servers/:id/studio', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    const s = await db.server.findUniqueOrThrow({ where: { id }, select: { studio: true, studioDraft: true, studioPrev: true } });
    const safe = (v: unknown) => (v ? (studioThemeSchema.safeParse(v).data ?? null) : null);
    return { live: safe(s.studio), draft: safe(s.studioDraft), prev: safe(s.studioPrev) };
  });
  app.put('/servers/:id/studio/draft', { ...auth, ...studioLimit }, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    const theme = studioThemeSchema.parse(req.body);
    await db.server.update({ where: { id }, data: { studioDraft: theme } });
    return { draft: theme };
  });
  app.delete('/servers/:id/studio/draft', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    await db.server.update({ where: { id }, data: { studioDraft: Prisma.DbNull } });
    return { ok: true };
  });
  app.post('/servers/:id/studio/publish', { ...auth, ...studioLimit }, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    const theme = studioThemeSchema.parse(req.body);
    const cur = await db.server.findUniqueOrThrow({ where: { id }, select: { studio: true } });
    const s = await db.server.update({ where: { id }, data: { studio: theme, studioPrev: cur.studio ?? Prisma.DbNull, studioDraft: Prisma.DbNull } });
    await audit(ctx, id, req.auth.userId, 'server_studio_publish', id, { level: studioLevel(theme) });
    ctx.gw.toServer(id, ServerEvents.SERVER_UPDATE, S.server(s));
    return S.server(s);
  });
  app.post('/servers/:id/studio/revert', { ...auth, ...studioLimit }, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    const cur = await db.server.findUniqueOrThrow({ where: { id }, select: { studio: true, studioPrev: true } });
    // swap live ↔ previous (revert twice = back to where you were); no previous → back to the default look
    const s = await db.server.update({ where: { id }, data: { studio: cur.studioPrev ?? Prisma.DbNull, studioPrev: cur.studio ?? Prisma.DbNull } });
    await audit(ctx, id, req.auth.userId, 'server_studio_revert', id);
    ctx.gw.toServer(id, ServerEvents.SERVER_UPDATE, S.server(s));
    return S.server(s);
  });

  app.delete('/servers/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const s = await db.server.findUnique({ where: { id } });
    if (!s) throw notFound();
    if (s.ownerId !== req.auth.userId) throw forbidden('Apenas o dono pode excluir o servidor');
    const channels = await db.channel.findMany({ where: { serverId: id }, select: { id: true, type: true } });
    ctx.gw.toServer(id, ServerEvents.SERVER_DELETE, { id });
    ctx.io.in(rooms.server(id)).socketsLeave([rooms.server(id), ...channels.map((c) => rooms.channel(c.id))]);
    for (const c of channels.filter((c) => c.type === 'voice')) await ctx.livekit.deleteRoom(c.id).catch(() => {});
    await db.server.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/servers/:id/transfer', auth, async (req) => {
    const { id } = req.params as { id: string };
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const s = await db.server.findUnique({ where: { id } });
    if (!s || s.ownerId !== req.auth.userId) throw forbidden('Apenas o dono pode transferir a posse');
    if (!(await db.member.findUnique({ where: { serverId_userId: { serverId: id, userId } } }))) throw notFound('Membro não encontrado');
    const upd = await db.server.update({ where: { id }, data: { ownerId: userId } });
    await audit(ctx, id, req.auth.userId, 'owner_transfer', userId);
    ctx.gw.toServer(id, ServerEvents.SERVER_UPDATE, S.server(upd));
    await ctx.gw.syncServerForAll(id);
    return { ok: true };
  });

  app.delete('/servers/:id/members/@me', auth, async (req) => {
    const { id } = req.params as { id: string };
    const s = await db.server.findUnique({ where: { id } });
    if (!s) throw notFound();
    if (s.ownerId === req.auth.userId) throw badRequest('Transfira a posse ou exclua o servidor antes de sair');
    await removeMember(ctx, id, req.auth.userId);
    return { ok: true };
  });

  app.get('/servers/:id/audit-logs', auth, async (req) => {
    const { id } = req.params as { id: string };
    const { before, limit } = z.object({ before: z.string().optional(), limit: z.coerce.number().min(1).max(100).default(50) }).parse(req.query);
    await requireServer(db, id, req.auth.userId, Permissions.VIEW_AUDIT_LOG);
    const logs = await db.auditLog.findMany({
      where: { serverId: id, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: limit,
    });
    const users = await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId))] } } });
    return { entries: logs, users: users.map(S.publicUser) };
  });

  // Nickname
  app.patch('/servers/:id/members/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const body = z.object({ nickname: z.string().max(32).nullable().optional(), roleIds: z.array(z.string()).max(250).optional() }).parse(req.body);
    const me = req.auth.userId;
    const access = await requireServer(db, id, me);
    if (body.nickname !== undefined) {
      const need = userId === me ? Permissions.CHANGE_NICKNAME : Permissions.MANAGE_NICKNAMES;
      if (!hasPermission(access.perms, need)) throw forbidden();
      if (userId !== me) {
        await assertCanActOn(db, access, userId);
      }
      await db.member.update({ where: { serverId_userId: { serverId: id, userId } }, data: { nickname: body.nickname || null } });
      await audit(ctx, id, me, 'member_nickname', userId, { nickname: body.nickname ?? null });
    }
    if (body.roleIds !== undefined) {
      await setMemberRoles(ctx, access, me, id, userId, body.roleIds);
    }
    const m = await db.member.findUniqueOrThrow({ where: { serverId_userId: { serverId: id, userId } }, include: S.memberInclude });
    ctx.gw.toServer(id, ServerEvents.MEMBER_UPDATE, S.member(m));
    return S.member(m);
  });
}
