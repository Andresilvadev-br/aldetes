import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Permissions, ServerEvents } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, notFound } from '../lib/errors';
import * as S from '../services/serialize';
import { requireServer, assertCanActOn } from '../services/permissions';
import { removeMember, disconnectFromServerVoice } from '../services/members';
import { audit } from '../services/audit';

const reasonSchema = z.object({ reason: z.string().max(512).optional() });

export function moderationRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  app.delete('/servers/:id/members/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const { reason } = reasonSchema.parse(req.body ?? {});
    const access = await requireServer(db, id, req.auth.userId, Permissions.KICK_MEMBERS);
    if (userId === req.auth.userId) throw badRequest('Use "sair do servidor"');
    await assertCanActOn(db, access, userId);
    await removeMember(ctx, id, userId);
    await audit(ctx, id, req.auth.userId, 'member_kick', userId, undefined, reason);
    return { ok: true };
  });

  app.get('/servers/:id/bans', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.BAN_MEMBERS);
    const bans = await db.ban.findMany({ where: { serverId: id } });
    const users = await db.user.findMany({ where: { id: { in: bans.map((b) => b.userId) } } });
    const umap = new Map(users.map((u) => [u.id, u]));
    return bans.map((b) => ({ userId: b.userId, reason: b.reason, createdAt: b.createdAt, user: umap.get(b.userId) ? S.publicUser(umap.get(b.userId)!) : null }));
  });

  app.put('/servers/:id/bans/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const body = reasonSchema.extend({ deleteMessageSeconds: z.number().int().min(0).max(604800).default(0) }).parse(req.body ?? {});
    const access = await requireServer(db, id, req.auth.userId, Permissions.BAN_MEMBERS);
    if (userId === req.auth.userId) throw badRequest('Você não pode banir a si mesmo');
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw notFound('Usuário não encontrado');
    const isMember = await db.member.findUnique({ where: { serverId_userId: { serverId: id, userId } } });
    if (isMember) await assertCanActOn(db, access, userId);
    else if (userId === access.server.ownerId) throw badRequest('Inválido');
    await db.ban.upsert({
      where: { serverId_userId: { serverId: id, userId } },
      create: { serverId: id, userId, reason: body.reason ?? null, moderatorId: req.auth.userId },
      update: { reason: body.reason ?? null, moderatorId: req.auth.userId },
    });
    if (isMember) await removeMember(ctx, id, userId);
    if (body.deleteMessageSeconds) {
      const since = new Date(Date.now() - body.deleteMessageSeconds * 1000);
      const msgs = await db.message.findMany({ where: { authorId: userId, channel: { serverId: id }, createdAt: { gte: since }, deletedAt: null }, select: { id: true, channelId: true } });
      await db.message.updateMany({ where: { id: { in: msgs.map((m) => m.id) } }, data: { deletedAt: new Date(), content: '' } });
      for (const m of msgs) ctx.gw.toChannel(m.channelId, ServerEvents.MESSAGE_DELETE, { id: m.id, channelId: m.channelId });
    }
    await audit(ctx, id, req.auth.userId, 'member_ban', userId, { deleteMessageSeconds: body.deleteMessageSeconds }, body.reason);
    return { ok: true };
  });

  app.delete('/servers/:id/bans/:userId', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    await requireServer(db, id, req.auth.userId, Permissions.BAN_MEMBERS);
    await db.ban.deleteMany({ where: { serverId: id, userId } });
    await audit(ctx, id, req.auth.userId, 'member_unban', userId);
    return { ok: true };
  });

  app.put('/servers/:id/members/:userId/timeout', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const body = reasonSchema.extend({ durationSeconds: z.number().int().min(0).max(28 * 86400) }).parse(req.body);
    const access = await requireServer(db, id, req.auth.userId, Permissions.MODERATE_MEMBERS);
    await assertCanActOn(db, access, userId);
    const until = body.durationSeconds ? new Date(Date.now() + body.durationSeconds * 1000) : null;
    const m = await db.member.update({ where: { serverId_userId: { serverId: id, userId } }, data: { timeoutUntil: until }, include: S.memberInclude });
    if (until) await disconnectFromServerVoice(ctx, id, userId);
    await audit(ctx, id, req.auth.userId, until ? 'member_timeout' : 'member_timeout_remove', userId, { until: until?.toISOString() ?? null }, body.reason);
    ctx.gw.toServer(id, ServerEvents.MEMBER_UPDATE, S.member(m));
    return S.member(m);
  });
}
