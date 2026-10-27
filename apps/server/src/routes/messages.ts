import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendMessageSchema, editMessageSchema, ServerEvents, Permissions, hasPermission } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import * as S from '../services/serialize';
import { requireChannel, visibleChannelIds } from '../services/permissions';
import { createMessage } from '../services/messages';
import { isBlockedBetween } from '../services/dms';
import { audit } from '../services/audit';
import { userRateLimit } from '../lib/rate-limit';

const EMOJI_RE = /^(custom:\d{1,20}|[^\s<>@#:]{1,32})$/u;

export function messageRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  async function assertDmAllowed(channelId: string, userId: string, type: string) {
    if (type !== 'dm') return;
    const other = await db.channelRecipient.findFirst({ where: { channelId, userId: { not: userId } } });
    if (other && (await isBlockedBetween(ctx, userId, other.userId))) throw forbidden('Não é possível enviar mensagens para este usuário');
  }

  async function getMsg(channelId: string, messageId: string) {
    const m = await db.message.findFirst({ where: { id: messageId, channelId, deletedAt: null }, include: S.messageInclude });
    if (!m) throw notFound('Mensagem não encontrada');
    return m;
  }

  app.get('/channels/:id/messages', auth, async (req) => {
    const { id } = req.params as { id: string };
    const q = z
      .object({
        before: z.string().regex(/^\d+$/).optional(),
        after: z.string().regex(/^\d+$/).optional(),
        around: z.string().regex(/^\d+$/).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    await requireChannel(db, id, req.auth.userId, Permissions.READ_MESSAGE_HISTORY);
    const base = { channelId: id, deletedAt: null };
    let rows;
    if (q.around) {
      const half = Math.floor(q.limit / 2);
      const [older, newer] = await Promise.all([
        db.message.findMany({ where: { ...base, id: { lte: q.around } }, orderBy: { id: 'desc' }, take: half + 1, include: S.messageInclude }),
        db.message.findMany({ where: { ...base, id: { gt: q.around } }, orderBy: { id: 'asc' }, take: half, include: S.messageInclude }),
      ]);
      rows = [...newer.reverse(), ...older];
    } else if (q.after) {
      rows = (await db.message.findMany({ where: { ...base, id: { gt: q.after } }, orderBy: { id: 'asc' }, take: q.limit, include: S.messageInclude })).reverse();
    } else {
      rows = await db.message.findMany({
        where: { ...base, ...(q.before ? { id: { lt: q.before } } : {}) },
        orderBy: { id: 'desc' },
        take: q.limit,
        include: S.messageInclude,
      });
    }
    return rows.map((m) => S.message(m, req.auth.userId)); // newest first
  });

  app.post('/channels/:id/messages', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    await userRateLimit(ctx, `msg:${req.auth.userId}`, 10, 5);
    const body = sendMessageSchema.parse(req.body);
    const a = await requireChannel(db, id, req.auth.userId, Permissions.SEND_MESSAGES);
    if (a.channel.type === 'category' || a.channel.type === 'forum') throw badRequest('Não é possível enviar mensagens neste canal');
    if (a.channel.archived) throw badRequest('Thread arquivada');
    await assertDmAllowed(id, req.auth.userId, a.channel.type);
    return reply.status(201).send(await createMessage(ctx, a, req.auth.userId, body));
  });

  app.patch('/channels/:cid/messages/:mid', auth, async (req) => {
    const { cid, mid } = req.params as { cid: string; mid: string };
    const { content } = editMessageSchema.parse(req.body);
    await requireChannel(db, cid, req.auth.userId);
    const m = await getMsg(cid, mid);
    if (m.authorId !== req.auth.userId || m.type !== 'default') throw forbidden('Você só pode editar suas mensagens');
    const updated = await db.message.update({ where: { id: mid }, data: { content: content.trim(), editedAt: new Date() }, include: S.messageInclude });
    const payload = S.message(updated, '');
    ctx.gw.toChannel(cid, ServerEvents.MESSAGE_UPDATE, payload);
    return S.message(updated, req.auth.userId);
  });

  app.delete('/channels/:cid/messages/:mid', auth, async (req) => {
    const { cid, mid } = req.params as { cid: string; mid: string };
    const a = await requireChannel(db, cid, req.auth.userId);
    const m = await getMsg(cid, mid);
    const own = m.authorId === req.auth.userId;
    if (!own && !(a.channel.serverId && hasPermission(a.perms, Permissions.MANAGE_MESSAGES))) throw forbidden();
    await db.message.update({ where: { id: mid }, data: { deletedAt: new Date(), content: '', pinned: false } });
    const atts = await db.attachment.findMany({ where: { messageId: mid } });
    await db.attachment.deleteMany({ where: { messageId: mid } });
    for (const at of atts) await ctx.storage.delete(at.storageKey);
    if (!own && a.channel.serverId) await audit(ctx, a.channel.serverId, req.auth.userId, 'message_delete', mid, { channelId: cid, authorId: m.authorId });
    ctx.gw.toChannel(cid, ServerEvents.MESSAGE_DELETE, { id: mid, channelId: cid });
    return { ok: true };
  });

  // --- Reactions ---
  app.put('/channels/:cid/messages/:mid/reactions/:emoji/@me', auth, async (req) => {
    const { cid, mid } = req.params as { cid: string; mid: string; emoji: string };
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji);
    if (!EMOJI_RE.test(emoji)) throw badRequest('Emoji inválido');
    const a = await requireChannel(db, cid, req.auth.userId, Permissions.READ_MESSAGE_HISTORY);
    await getMsg(cid, mid);
    const existingEmoji = await db.reaction.findFirst({ where: { messageId: mid, emoji } });
    if (!existingEmoji && !hasPermission(a.perms, Permissions.ADD_REACTIONS)) throw forbidden();
    if (emoji.startsWith('custom:')) {
      const e = await db.emoji.findUnique({ where: { id: emoji.slice(7) } });
      if (!e || (a.channel.serverId && e.serverId !== a.channel.serverId)) throw badRequest('Emoji indisponível');
    }
    const distinct = await db.reaction.groupBy({ by: ['emoji'], where: { messageId: mid } });
    if (!existingEmoji && distinct.length >= 20) throw badRequest('Limite de reações distintas');
    await db.reaction.upsert({
      where: { messageId_userId_emoji: { messageId: mid, userId: req.auth.userId, emoji } },
      create: { messageId: mid, userId: req.auth.userId, emoji },
      update: {},
    });
    ctx.gw.toChannel(cid, ServerEvents.REACTION_UPDATE, { channelId: cid, messageId: mid, emoji, userId: req.auth.userId, add: true });
    return { ok: true };
  });

  app.delete('/channels/:cid/messages/:mid/reactions/:emoji/@me', auth, async (req) => {
    const { cid, mid } = req.params as { cid: string; mid: string };
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji);
    await requireChannel(db, cid, req.auth.userId);
    const r = await db.reaction.deleteMany({ where: { messageId: mid, userId: req.auth.userId, emoji } });
    if (r.count) ctx.gw.toChannel(cid, ServerEvents.REACTION_UPDATE, { channelId: cid, messageId: mid, emoji, userId: req.auth.userId, add: false });
    return { ok: true };
  });

  app.get('/channels/:cid/messages/:mid/reactions/:emoji', auth, async (req) => {
    const { cid, mid } = req.params as { cid: string; mid: string };
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji);
    await requireChannel(db, cid, req.auth.userId);
    const rs = await db.reaction.findMany({ where: { messageId: mid, emoji }, include: { user: true }, take: 100 });
    return rs.map((r) => S.publicUser(r.user));
  });

  // --- Pins ---
  app.get('/channels/:id/pins', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannel(db, id, req.auth.userId, Permissions.READ_MESSAGE_HISTORY);
    const rows = await db.message.findMany({ where: { channelId: id, pinned: true, deletedAt: null }, include: S.messageInclude, orderBy: { id: 'desc' }, take: 50 });
    return rows.map((m) => S.message(m, req.auth.userId));
  });

  for (const pin of [true, false]) {
    app[pin ? 'put' : 'delete']('/channels/:cid/pins/:mid', auth, async (req) => {
      const { cid, mid } = req.params as { cid: string; mid: string };
      const a = await requireChannel(db, cid, req.auth.userId);
      if (a.channel.serverId && !hasPermission(a.perms, Permissions.MANAGE_MESSAGES)) throw forbidden();
      await getMsg(cid, mid);
      if (pin && (await db.message.count({ where: { channelId: cid, pinned: true, deletedAt: null } })) >= 50) throw badRequest('Limite de 50 mensagens fixadas');
      const m = await db.message.update({ where: { id: mid }, data: { pinned: pin }, include: S.messageInclude });
      if (a.channel.serverId) await audit(ctx, a.channel.serverId, req.auth.userId, pin ? 'message_pin' : 'message_unpin', mid, { channelId: cid });
      ctx.gw.toChannel(cid, ServerEvents.MESSAGE_UPDATE, S.message(m, ''));
      ctx.gw.toChannel(cid, ServerEvents.PIN_UPDATE, { channelId: cid });
      return { ok: true };
    });
  }

  // --- Forward ---
  app.post('/channels/:cid/messages/:mid/forward', auth, async (req, reply) => {
    const { cid, mid } = req.params as { cid: string; mid: string };
    const { targetChannelId } = z.object({ targetChannelId: z.string() }).parse(req.body);
    await requireChannel(db, cid, req.auth.userId, Permissions.READ_MESSAGE_HISTORY);
    const src = await getMsg(cid, mid);
    const target = await requireChannel(db, targetChannelId, req.auth.userId, Permissions.SEND_MESSAGES);
    await assertDmAllowed(targetChannelId, req.auth.userId, target.channel.type);
    const quoted = src.content
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    const links = src.attachments.map((at) => `> 📎 ${S.cdnUrl(at.storageKey)}`).join('\n');
    const content = `*Encaminhada de ${src.author.displayName}*\n${quoted}${links ? '\n' + links : ''}`.slice(0, 4000);
    return reply.status(201).send(await createMessage(ctx, target, req.auth.userId, { content }));
  });

  // --- Search ---
  app.get('/search/messages', auth, async (req) => {
    const q = z
      .object({
        q: z.string().max(200).default(''),
        serverId: z.string().optional(),
        channelId: z.string().optional(),
        authorId: z.string().optional(),
        has: z.enum(['attachment', 'image', 'link']).optional(),
        offset: z.coerce.number().int().min(0).max(5000).default(0),
      })
      .parse(req.query);
    const me = req.auth.userId;
    let channelIds: string[];
    if (q.channelId) {
      await requireChannel(db, q.channelId, me, Permissions.READ_MESSAGE_HISTORY);
      channelIds = [q.channelId];
    } else if (q.serverId) {
      channelIds = await visibleChannelIds(db, q.serverId, me);
      // also need READ_MESSAGE_HISTORY; filter
      const filtered: string[] = [];
      for (const c of channelIds) {
        const a = await requireChannel(db, c, me).catch(() => null);
        if (a && hasPermission(a.perms, Permissions.READ_MESSAGE_HISTORY)) filtered.push(c);
      }
      channelIds = filtered;
    } else {
      channelIds = (await db.channelRecipient.findMany({ where: { userId: me }, select: { channelId: true } })).map((r) => r.channelId);
    }
    if (!q.q && !q.authorId && !q.has) throw badRequest('Informe um termo de busca');
    const where = {
      channelId: { in: channelIds },
      deletedAt: null,
      type: 'default',
      ...(q.q ? { content: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.authorId ? { authorId: q.authorId } : {}),
      ...(q.has === 'attachment' ? { attachments: { some: {} } } : {}),
      ...(q.has === 'image' ? { attachments: { some: { contentType: { startsWith: 'image/' } } } } : {}),
      ...(q.has === 'link' ? { content: { contains: 'http' } } : {}),
    };
    const [total, rows] = await Promise.all([
      db.message.count({ where }),
      db.message.findMany({ where, include: S.messageInclude, orderBy: { createdAt: 'desc' }, take: 25, skip: q.offset }),
    ]);
    return { total, messages: rows.map((m) => S.message(m, me)) };
  });

  // --- Saved messages (bookmarks) ---
  app.get('/users/@me/saved', auth, async (req) => {
    const rows = await db.savedMessage.findMany({
      where: { userId: req.auth.userId, message: { deletedAt: null } },
      include: { message: { include: S.messageInclude } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const out = [];
    for (const r of rows) {
      const a = await requireChannel(db, r.message.channelId, req.auth.userId).catch(() => null);
      if (a) out.push(S.message(r.message, req.auth.userId));
    }
    return out;
  });
  app.put('/users/@me/saved/:mid', auth, async (req) => {
    const { mid } = req.params as { mid: string };
    const m = await db.message.findUnique({ where: { id: mid } });
    if (!m || m.deletedAt) throw notFound();
    await requireChannel(db, m.channelId, req.auth.userId);
    await db.savedMessage.upsert({ where: { userId_messageId: { userId: req.auth.userId, messageId: mid } }, create: { userId: req.auth.userId, messageId: mid }, update: {} });
    return { ok: true };
  });
  app.delete('/users/@me/saved/:mid', auth, async (req) => {
    const { mid } = req.params as { mid: string };
    await db.savedMessage.deleteMany({ where: { userId: req.auth.userId, messageId: mid } });
    return { ok: true };
  });
}
