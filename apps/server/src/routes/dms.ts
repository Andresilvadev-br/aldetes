import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServerEvents } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import { dmChannelPayload, isBlockedBetween } from '../services/dms';
import { rooms } from '../gateway';

export async function canDm(ctx: AppContext, from: string, to: string): Promise<boolean> {
  if (await isBlockedBetween(ctx, from, to)) return false;
  const target = await ctx.db.user.findUnique({ where: { id: to } });
  if (!target) return false;
  if (target.allowDmsFrom === 'everyone') return true;
  const friend = await ctx.db.relationship.findUnique({ where: { fromId_toId: { fromId: to, toId: from } } });
  if (friend?.type === 'friend') return true;
  if (target.allowDmsFrom === 'server_members') {
    const shared = await ctx.db.member.findFirst({
      where: { userId: from, server: { members: { some: { userId: to } } } },
    });
    return !!shared;
  }
  return false;
}

export function dmRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  async function announce(channelId: string, userIds: string[]) {
    for (const uid of userIds) {
      ctx.io.in(rooms.user(uid)).socketsJoin(rooms.channel(channelId));
      ctx.gw.toUser(uid, ServerEvents.DM_CREATE, await dmChannelPayload(ctx, channelId, uid));
    }
  }

  app.post('/users/@me/channels', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ recipientIds: z.array(z.string()).min(1).max(9) }).parse(req.body);
    const me = req.auth.userId;
    const ids = [...new Set(body.recipientIds.filter((i) => i !== me))];
    if (!ids.length) throw badRequest('Destinatário inválido');
    for (const id of ids) if (!(await canDm(ctx, me, id))) throw forbidden('Este usuário não aceita mensagens diretas de você');

    if (ids.length === 1) {
      const other = ids[0]!;
      const existing = await db.channel.findFirst({
        where: { type: 'dm', AND: [{ recipients: { some: { userId: me } } }, { recipients: { some: { userId: other } } }] },
      });
      if (existing) {
        await db.channelRecipient.updateMany({ where: { channelId: existing.id, userId: me }, data: { closed: false } });
        await announce(existing.id, [me]);
        return dmChannelPayload(ctx, existing.id, me);
      }
      const c = await db.channel.create({
        data: { id: snowflake(), type: 'dm', recipients: { create: [{ userId: me }, { userId: other }] } },
      });
      await announce(c.id, [me, other]);
      return dmChannelPayload(ctx, c.id, me);
    }
    const c = await db.channel.create({
      data: { id: snowflake(), type: 'group_dm', ownerId: me, recipients: { create: [me, ...ids].map((userId) => ({ userId })) } },
    });
    await announce(c.id, [me, ...ids]);
    return dmChannelPayload(ctx, c.id, me);
  });

  app.put('/channels/:id/recipients/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const me = req.auth.userId;
    const c = await db.channel.findUnique({ where: { id }, include: { recipients: true } });
    if (!c || c.type !== 'group_dm' || !c.recipients.some((r) => r.userId === me)) throw notFound();
    if (c.recipients.length >= 10) throw badRequest('Limite de 10 participantes');
    if (!(await canDm(ctx, me, userId))) throw forbidden();
    await db.channelRecipient.upsert({ where: { channelId_userId: { channelId: id, userId } }, create: { channelId: id, userId }, update: { closed: false } });
    await announce(id, c.recipients.map((r) => r.userId).concat(userId));
    return { ok: true };
  });

  app.delete('/channels/:id/recipients/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const me = req.auth.userId;
    const c = await db.channel.findUnique({ where: { id }, include: { recipients: true } });
    if (!c || c.type !== 'group_dm' || !c.recipients.some((r) => r.userId === me)) throw notFound();
    if (userId !== me && c.ownerId !== me) throw forbidden('Apenas o dono do grupo pode remover participantes');
    await db.channelRecipient.delete({ where: { channelId_userId: { channelId: id, userId } } }).catch(() => {});
    ctx.io.in(rooms.user(userId)).socketsLeave(rooms.channel(id));
    ctx.gw.toUser(userId, ServerEvents.CHANNEL_DELETE, { id, serverId: null });
    const remaining = c.recipients.filter((r) => r.userId !== userId);
    if (!remaining.length) await db.channel.delete({ where: { id } });
    else {
      if (c.ownerId === userId) await db.channel.update({ where: { id }, data: { ownerId: remaining[0]!.userId } });
      await announce(id, remaining.map((r) => r.userId));
    }
    return { ok: true };
  });
}
