import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createChannelSchema,
  updateChannelSchema,
  reorderChannelsSchema,
  ServerEvents,
  Permissions,
  hasPermission,
} from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import * as S from '../services/serialize';
import { requireServer, requireChannel, getChannelAccess } from '../services/permissions';
import { audit } from '../services/audit';
import { createMessage } from '../services/messages';
import { rooms } from '../gateway';

/** Emit CHANNEL_UPDATE (or CREATE) to members who can see it and CHANNEL_DELETE to those who no longer can. */
export async function broadcastChannelVisibility(ctx: AppContext, channelId: string, created = false) {
  const c = await ctx.db.channel.findUnique({ where: { id: channelId }, include: S.channelInclude });
  if (!c?.serverId) return;
  const sockets = await ctx.io.in(rooms.server(c.serverId)).fetchSockets();
  const users = [...new Set(sockets.map((s) => s.data.userId as string))];
  const payload = S.channel(c);
  await Promise.all(
    users.map(async (u) => {
      const a = await getChannelAccess(ctx.db, channelId, u);
      if (a && hasPermission(a.perms, Permissions.VIEW_CHANNEL)) {
        ctx.io.in(rooms.user(u)).socketsJoin(rooms.channel(channelId));
        ctx.gw.toUser(u, created ? ServerEvents.CHANNEL_CREATE : ServerEvents.CHANNEL_UPDATE, payload);
      } else {
        ctx.io.in(rooms.user(u)).socketsLeave(rooms.channel(channelId));
        ctx.gw.toUser(u, ServerEvents.CHANNEL_DELETE, { id: channelId, serverId: c.serverId });
      }
    }),
  );
}

export function channelRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  app.post('/servers/:id/channels', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createChannelSchema.parse(req.body);
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_CHANNELS);
    if (await db.channel.count({ where: { serverId: id, type: { not: 'thread' } } }) >= 500) throw badRequest('Limite de canais atingido');
    let parentId: string | null = null;
    let inherited: { targetType: string; targetId: string; allow: string; deny: string }[] = [];
    if (body.parentId) {
      if (body.type === 'category') throw badRequest('Categorias não podem ser aninhadas');
      const parent = await db.channel.findFirst({ where: { id: body.parentId, serverId: id, type: 'category' }, include: { overwrites: true } });
      if (!parent) throw badRequest('Categoria inválida');
      parentId = parent.id;
      inherited = parent.overwrites.map(({ targetType, targetId, allow, deny }) => ({ targetType, targetId, allow, deny }));
    }
    const name = body.type === 'voice' || body.type === 'category' ? body.name.trim() : body.name.trim().toLowerCase().replace(/\s+/g, '-');
    const max = await db.channel.aggregate({ where: { serverId: id, parentId, type: { not: 'thread' } }, _max: { position: true } });
    const ch = await db.channel.create({
      data: {
        id: snowflake(),
        serverId: id,
        type: body.type,
        name,
        topic: body.topic ?? null,
        parentId,
        position: (max._max.position ?? -1) + 1,
        overwrites: { create: inherited },
      },
      include: S.channelInclude,
    });
    await audit(ctx, id, req.auth.userId, 'channel_create', ch.id, { name: ch.name, type: ch.type });
    await broadcastChannelVisibility(ctx, ch.id, true);
    return reply.status(201).send(S.channel(ch));
  });

  app.patch('/channels/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const me = req.auth.userId;
    const a = await requireChannel(db, id, me);
    if (a.channel.type === 'group_dm') {
      const { name } = z.object({ name: z.string().max(100) }).parse(req.body);
      const c = await db.channel.update({ where: { id }, data: { name }, include: S.channelInclude });
      ctx.gw.toChannel(id, ServerEvents.CHANNEL_UPDATE, S.channel(c));
      return S.channel(c);
    }
    if (!a.channel.serverId) throw badRequest('Canal não editável');
    const body = updateChannelSchema.parse(req.body);
    const isThread = a.channel.type === 'thread';
    const canManage = hasPermission(a.perms, isThread ? Permissions.MANAGE_THREADS : Permissions.MANAGE_CHANNELS);
    if (!canManage && !(isThread && a.channel.ownerId === me)) throw forbidden();
    if (body.parentId) {
      const p = await db.channel.findFirst({ where: { id: body.parentId, serverId: a.channel.serverId, type: 'category' } });
      if (!p || a.channel.type === 'category') throw badRequest('Categoria inválida');
    }
    const c = await db.channel.update({ where: { id }, data: body, include: S.channelInclude });
    await audit(ctx, a.channel.serverId, me, 'channel_update', id, body);
    await broadcastChannelVisibility(ctx, id);
    return S.channel(c);
  });

  app.delete('/channels/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const me = req.auth.userId;
    const a = await requireChannel(db, id, me);
    if (!a.channel.serverId) {
      // close DM (hide) / leave group
      if (a.channel.type === 'group_dm') {
        await db.channelRecipient.delete({ where: { channelId_userId: { channelId: id, userId: me } } });
        ctx.io.in(rooms.user(me)).socketsLeave(rooms.channel(id));
        if ((await db.channelRecipient.count({ where: { channelId: id } })) === 0) await db.channel.delete({ where: { id } });
      } else {
        await db.channelRecipient.update({ where: { channelId_userId: { channelId: id, userId: me } }, data: { closed: true } });
      }
      ctx.gw.toUser(me, ServerEvents.CHANNEL_DELETE, { id, serverId: null });
      return { ok: true };
    }
    const isThread = a.channel.type === 'thread';
    if (!hasPermission(a.perms, isThread ? Permissions.MANAGE_THREADS : Permissions.MANAGE_CHANNELS) && !(isThread && a.channel.ownerId === me))
      throw forbidden();
    const serverId = a.channel.serverId;
    if (a.channel.type === 'category') await db.channel.updateMany({ where: { parentId: id }, data: { parentId: null } });
    ctx.gw.toChannel(id, ServerEvents.CHANNEL_DELETE, { id, serverId });
    if (a.channel.type === 'category') ctx.gw.toServer(serverId, ServerEvents.CHANNEL_DELETE, { id, serverId });
    ctx.io.in(rooms.channel(id)).socketsLeave(rooms.channel(id));
    if (a.channel.type === 'voice') await ctx.livekit.deleteRoom(id).catch(() => {});
    await db.channel.delete({ where: { id } });
    await db.server.updateMany({ where: { id: serverId, welcomeChannelId: id }, data: { welcomeChannelId: null } });
    await db.server.updateMany({ where: { id: serverId, rulesChannelId: id }, data: { rulesChannelId: null } });
    await audit(ctx, serverId, me, 'channel_delete', id, { name: a.channel.name });
    if (a.channel.type === 'category') {
      const kids = await db.channel.findMany({ where: { serverId, parentId: null, type: { not: 'category' } }, select: { id: true } });
      for (const k of kids) await broadcastChannelVisibility(ctx, k.id);
    }
    return { ok: true };
  });

  app.patch('/servers/:id/channels/reorder', auth, async (req) => {
    const { id } = req.params as { id: string };
    const { items } = reorderChannelsSchema.parse(req.body);
    await requireServer(db, id, req.auth.userId, Permissions.MANAGE_CHANNELS);
    const channels = await db.channel.findMany({ where: { serverId: id, id: { in: items.map((i) => i.id) } } });
    if (channels.length !== items.length) throw badRequest('Canal inválido');
    const cats = new Set((await db.channel.findMany({ where: { serverId: id, type: 'category' }, select: { id: true } })).map((c) => c.id));
    const byId = new Map(channels.map((c) => [c.id, c]));
    for (const it of items) {
      const c = byId.get(it.id)!;
      if (it.parentId && (!cats.has(it.parentId) || c.type === 'category')) throw badRequest('Categoria inválida');
    }
    await db.$transaction(items.map((it) => db.channel.update({ where: { id: it.id }, data: { position: it.position, parentId: it.parentId } })));
    await audit(ctx, id, req.auth.userId, 'channels_reorder', null, { count: items.length });
    ctx.gw.toServer(id, ServerEvents.CHANNELS_REORDER, { serverId: id, items });
    return { ok: true };
  });

  // --- Permission overwrites ---
  app.put('/channels/:id/permissions/:targetType/:targetId', auth, async (req) => {
    const { id, targetType, targetId } = req.params as { id: string; targetType: string; targetId: string };
    const body = z.object({ allow: z.string().regex(/^\d+$/), deny: z.string().regex(/^\d+$/) }).parse(req.body);
    if (targetType !== 'role' && targetType !== 'member') throw badRequest('Tipo inválido');
    const a = await requireChannel(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    if (!a.channel.serverId || a.channel.type === 'thread') throw badRequest('Canal não suporta permissões');
    const sa = a.server!;
    if (!sa.isOwner && !hasPermission(sa.perms, Permissions.ADMINISTRATOR)) {
      const requested = BigInt(body.allow) | BigInt(body.deny);
      if ((requested & ~a.perms) !== 0n) throw forbidden('Você não pode alterar permissões que não possui');
    }
    const valid =
      targetType === 'role'
        ? await db.role.findFirst({ where: { id: targetId, serverId: a.channel.serverId } })
        : await db.member.findUnique({ where: { serverId_userId: { serverId: a.channel.serverId, userId: targetId } } });
    if (!valid) throw notFound('Alvo não encontrado');
    await db.permissionOverwrite.upsert({
      where: { channelId_targetType_targetId: { channelId: id, targetType, targetId } },
      create: { channelId: id, targetType, targetId, allow: body.allow, deny: body.deny },
      update: { allow: body.allow, deny: body.deny },
    });
    await audit(ctx, a.channel.serverId, req.auth.userId, 'overwrite_update', id, { targetType, targetId, ...body });
    await refreshAfterOverwrite(ctx, id);
    return { ok: true };
  });

  app.delete('/channels/:id/permissions/:targetType/:targetId', auth, async (req) => {
    const { id, targetType, targetId } = req.params as { id: string; targetType: string; targetId: string };
    const a = await requireChannel(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    if (!a.channel.serverId) throw badRequest('Inválido');
    await db.permissionOverwrite.deleteMany({ where: { channelId: id, targetType, targetId } });
    await audit(ctx, a.channel.serverId, req.auth.userId, 'overwrite_delete', id, { targetType, targetId });
    await refreshAfterOverwrite(ctx, id);
    return { ok: true };
  });

  async function refreshAfterOverwrite(ctx: AppContext, channelId: string) {
    await broadcastChannelVisibility(ctx, channelId);
    const threads = await db.channel.findMany({ where: { parentId: channelId, type: 'thread' }, select: { id: true } });
    for (const t of threads) await broadcastChannelVisibility(ctx, t.id);
  }

  // --- Threads & forum posts ---
  app.post('/channels/:id/threads', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ name: z.string().min(1).max(100), messageId: z.string().optional(), content: z.string().max(4000).optional() })
      .parse(req.body);
    const a = await requireChannel(db, id, req.auth.userId, Permissions.CREATE_THREADS);
    if (!a.channel.serverId || !['text', 'announcement', 'forum'].includes(a.channel.type)) throw badRequest('Canal não suporta threads');
    if (a.channel.type === 'forum' && !body.content?.trim()) throw badRequest('Uma postagem precisa de conteúdo');
    let starter: string | null = null;
    if (body.messageId) {
      const m = await db.message.findFirst({ where: { id: body.messageId, channelId: id, deletedAt: null } });
      if (!m) throw notFound('Mensagem não encontrada');
      const exists = await db.channel.findFirst({ where: { starterMessageId: m.id } });
      if (exists) throw badRequest('Esta mensagem já possui uma thread');
      starter = m.id;
    }
    const t = await db.channel.create({
      data: {
        id: snowflake(),
        serverId: a.channel.serverId,
        type: 'thread',
        name: body.name,
        parentId: id,
        ownerId: req.auth.userId,
        starterMessageId: starter,
      },
      include: S.channelInclude,
    });
    await broadcastChannelVisibility(ctx, t.id, true);
    if (body.content?.trim()) {
      const ta = await requireChannel(db, t.id, req.auth.userId);
      await createMessage(ctx, { ...ta, perms: ta.perms | Permissions.SEND_MESSAGES }, req.auth.userId, { content: body.content });
    }
    return reply.status(201).send(S.channel(t));
  });

  app.get('/channels/:id/threads', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannel(db, id, req.auth.userId);
    const threads = await db.channel.findMany({
      where: { parentId: id, type: 'thread' },
      include: { ...S.channelInclude, _count: { select: { messages: true } } },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return threads.map((t) => ({ ...S.channel(t), messageCount: t._count.messages, starterMessageId: t.starterMessageId, archived: t.archived }));
  });

  // --- Read state ---
  app.post('/channels/:id/ack', auth, async (req) => {
    const { id } = req.params as { id: string };
    const { messageId } = z.object({ messageId: z.string().max(25) }).parse(req.body);
    await requireChannel(db, id, req.auth.userId);
    await db.readState.upsert({
      where: { userId_channelId: { userId: req.auth.userId, channelId: id } },
      create: { userId: req.auth.userId, channelId: id, lastReadMessageId: messageId, mentionCount: 0 },
      update: { lastReadMessageId: messageId, mentionCount: 0 },
    });
    // sync to user's other devices
    ctx.gw.toUser(req.auth.userId, 'ack', { channelId: id, messageId });
    return { ok: true };
  });
}
