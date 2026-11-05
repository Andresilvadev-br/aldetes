import type { FastifyInstance } from 'fastify';
import { createInviteSchema, Permissions, hasPermission } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { inviteCode } from '../lib/crypto';
import * as S from '../services/serialize';
import { requireChannel, requireServer } from '../services/permissions';
import { addMember } from '../services/members';
import { audit } from '../services/audit';
import { buildServerPayload } from '../services/ready';

export function inviteRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  const serializeInvite = (i: { code: string; serverId: string; channelId: string | null; creatorId: string; maxUses: number; uses: number; expiresAt: Date | null; createdAt: Date }) => ({
    code: i.code,
    serverId: i.serverId,
    channelId: i.channelId,
    creatorId: i.creatorId,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  });

  app.post('/channels/:id/invites', { ...auth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createInviteSchema.parse(req.body ?? {});
    const a = await requireChannel(db, id, req.auth.userId, Permissions.CREATE_INVITE);
    if (!a.channel.serverId) throw badRequest('Convites só existem em servidores');
    let code = inviteCode();
    while (await db.invite.findUnique({ where: { code } })) code = inviteCode();
    const inv = await db.invite.create({
      data: {
        code,
        serverId: a.channel.serverId,
        channelId: id,
        creatorId: req.auth.userId,
        maxUses: body.maxUses,
        expiresAt: body.maxAgeSeconds ? new Date(Date.now() + body.maxAgeSeconds * 1000) : null,
      },
    });
    await audit(ctx, a.channel.serverId, req.auth.userId, 'invite_create', code, { maxUses: body.maxUses, maxAgeSeconds: body.maxAgeSeconds });
    return reply.status(201).send(serializeInvite(inv));
  });

  // Public preview (no auth) — used by invite links before login.
  // only a count (no names, no channels): what the invite card may show about activity
  const voiceCount = async (serverId: string) => Object.values(await ctx.redis.hgetall('voice:states')).filter((r) => r.includes(`"serverId":"${serverId}"`)).length;

  app.get('/invites/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { code } = req.params as { code: string };
    const inv = await db.invite.findUnique({ where: { code }, include: { server: { include: { _count: { select: { members: true } } } }, channel: true } });
    if (!inv || (inv.expiresAt && inv.expiresAt < new Date()) || (inv.maxUses && inv.uses >= inv.maxUses)) throw notFound('Convite inválido ou expirado');
    const members = await db.member.findMany({ where: { serverId: inv.serverId }, select: { userId: true }, take: 5000 });
    const online = members.length ? (await ctx.redis.mget(members.map((m) => `presence:${m.userId}`))).filter((s) => s && s !== 'invisible').length : 0;
    return {
      code: inv.code,
      server: { ...S.server(inv.server), memberCount: inv.server._count.members, onlineCount: online, inVoice: await voiceCount(inv.serverId) },
      channel: inv.channel ? { id: inv.channel.id, name: inv.channel.name } : null,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
    };
  });

  app.post('/invites/:code', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { code } = req.params as { code: string };
    const inv = await db.invite.findUnique({ where: { code } });
    if (!inv || (inv.expiresAt && inv.expiresAt < new Date())) throw notFound('Convite inválido ou expirado');
    const already = await db.member.findUnique({ where: { serverId_userId: { serverId: inv.serverId, userId: req.auth.userId } } });
    if (!already) {
      if (await db.ban.findUnique({ where: { serverId_userId: { serverId: inv.serverId, userId: req.auth.userId } } })) throw forbidden('Você está banido deste servidor');
      // atomic use-count check
      const upd = inv.maxUses
        ? await db.invite.updateMany({ where: { code, uses: { lt: inv.maxUses } }, data: { uses: { increment: 1 } } })
        : await db.invite.updateMany({ where: { code }, data: { uses: { increment: 1 } } });
      if (!upd.count) throw notFound('Convite esgotado');
      await addMember(ctx, inv.serverId, req.auth.userId);
      await audit(ctx, inv.serverId, req.auth.userId, 'member_join', req.auth.userId, { invite: code });
    }
    return buildServerPayload(ctx, inv.serverId, req.auth.userId);
  });

  app.get('/servers/:id/invites', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_SERVER);
    const invs = await db.invite.findMany({ where: { serverId: id }, orderBy: { createdAt: 'desc' } });
    return invs.map(serializeInvite);
  });

  app.delete('/invites/:code', auth, async (req) => {
    const { code } = req.params as { code: string };
    const inv = await db.invite.findUnique({ where: { code } });
    if (!inv) throw notFound();
    const a = await requireServer(db, inv.serverId, req.auth.userId);
    if (inv.creatorId !== req.auth.userId && !hasPermission(a.perms, Permissions.MANAGE_SERVER)) throw forbidden();
    await db.invite.delete({ where: { code } });
    await audit(ctx, inv.serverId, req.auth.userId, 'invite_delete', code);
    return { ok: true };
  });
}
