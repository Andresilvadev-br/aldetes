import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from './context';
import { sha256 } from './lib/crypto';
import { unauthorized, forbidden } from './lib/errors';

export const SESSION_COOKIE = 'aldetes_session';
const CACHE_TTL = 300;

export interface AuthInfo {
  userId: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthInfo;
  }
}

export function extractToken(req: { headers: Record<string, string | string[] | undefined>; cookies?: Record<string, string | undefined> }) {
  const h = req.headers.authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return { token: h.slice(7).trim(), viaCookie: false };
  const c = req.cookies?.[SESSION_COOKIE];
  if (c) return { token: c, viaCookie: true };
  return null;
}

export async function resolveSession(ctx: AppContext, token: string): Promise<AuthInfo | null> {
  if (!token || token.length > 200) return null;
  const hash = sha256(token);
  const cached = await ctx.redis.get(`sess:${hash}`);
  if (cached) return JSON.parse(cached) as AuthInfo;
  const s = await ctx.db.session.findUnique({ where: { tokenHash: hash } });
  if (!s || s.expiresAt < new Date()) return null;
  const info = { userId: s.userId, sessionId: s.id };
  await ctx.redis.set(`sess:${hash}`, JSON.stringify(info), 'EX', CACHE_TTL);
  // throttle lastUsedAt writes
  if (Date.now() - s.lastUsedAt.getTime() > 5 * 60_000) {
    await ctx.db.session.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return info;
}

export async function invalidateSessionCache(ctx: AppContext, tokenHash: string) {
  await ctx.redis.del(`sess:${tokenHash}`);
}

export function makeAuthenticate(ctx: AppContext) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
    const t = extractToken(req as never);
    if (!t) throw unauthorized();
    // CSRF: cookie-authenticated mutations require a custom header (cannot be sent cross-site without CORS approval).
    if (t.viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-aldetes-client'] === undefined) {
      throw forbidden('Cabeçalho X-Aldetes-Client ausente');
    }
    const info = await resolveSession(ctx, t.token);
    if (!info) throw unauthorized('Sessão inválida ou expirada');
    req.auth = info;
  };
}
