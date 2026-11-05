import type { FastifyInstance } from 'fastify';
import { updateProfileSchema, ServerEvents, spaceSceneSchema } from '@aldetes/shared';
import { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { selfUser, publicUser } from '../services/serialize';
import { rooms } from '../gateway';

export function userRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  app.get('/users/@me', auth, async (req) => selfUser(await db.user.findUniqueOrThrow({ where: { id: req.auth.userId } })));

  app.patch('/users/@me', auth, async (req) => {
    const { profileLinks, ...body } = updateProfileSchema.parse(req.body);
    const user = await db.user.update({ where: { id: req.auth.userId }, data: { ...body, ...(profileLinks ? { profileLinks } : {}) } });
    await broadcastUserUpdate(ctx, user.id);
    if (body.status !== undefined || body.customStatus !== undefined) {
      if (body.status !== undefined && (await ctx.redis.exists(`presence:${user.id}`))) {
        await ctx.redis.set(`presence:${user.id}`, body.status);
      }
      await ctx.gw.broadcastPresence(user.id);
    }
    return selfUser(user);
  });

  // 2.0 Spaces: only the owner of the account changes their corner; every change bumps the revision so the other
  // clients re-render just that corner (the scene is data, the art ships with the app — nothing to download).
  app.put('/users/@me/space', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const scene = spaceSceneSchema.parse(req.body);
    const user = await db.user.update({ where: { id: req.auth.userId }, data: { spaceScene: scene, spaceRev: { increment: 1 } } });
    await broadcastUserUpdate(ctx, user.id);
    return selfUser(user);
  });
  app.delete('/users/@me/space', auth, async (req) => {
    const user = await db.user.update({ where: { id: req.auth.userId }, data: { spaceScene: Prisma.DbNull, spaceRev: { increment: 1 } } });
    await broadcastUserUpdate(ctx, user.id);
    return selfUser(user);
  });

  app.get('/users/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw notFound('Usuário não encontrado');
    const [mine, theirs] = await Promise.all([
      db.member.findMany({ where: { userId: req.auth.userId }, select: { serverId: true } }),
      db.member.findMany({ where: { userId: id }, select: { serverId: true } }),
    ]);
    const mineSet = new Set(mine.map((m) => m.serverId));
    return { ...publicUser(user), mutualServerIds: theirs.map((t) => t.serverId).filter((s) => mineSet.has(s)) };
  });
}

export async function broadcastUserUpdate(ctx: AppContext, userId: string) {
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  ctx.gw.toUser(userId, ServerEvents.USER_UPDATE, { self: true, user: selfUser(user) });
  const audience = await ctx.gw.presenceAudience(userId);
  if (audience.length) ctx.io.to(audience).except(rooms.user(userId)).emit(ServerEvents.USER_UPDATE, { user: publicUser(user) });
}
