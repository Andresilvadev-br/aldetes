import type { AppContext } from '../context';
import { tooMany } from './errors';

/** Per-user fixed-window limiter (the IP-based global limiter can't tell users behind one NAT apart). */
export async function userRateLimit(ctx: AppContext, key: string, max: number, windowSeconds: number) {
  if (ctx.cfg.RATE_LIMIT_DISABLED) return;
  const k = `rlu:${key}`;
  const n = await ctx.redis.incr(k);
  if (n === 1) await ctx.redis.expire(k, windowSeconds);
  if (n > max) throw tooMany('Você está enviando mensagens rápido demais');
}
