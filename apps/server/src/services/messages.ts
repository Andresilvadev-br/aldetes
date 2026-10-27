import { ServerEvents, Permissions, hasPermission } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, tooMany } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import * as S from './serialize';
import type { ChannelAccess } from './permissions';

const USER_MENTION = /<@!?(\d{1,20})>/g;
const ROLE_MENTION = /<@&(\d{1,20})>/g;

export async function createMessage(
  ctx: AppContext,
  access: ChannelAccess,
  authorId: string,
  input: { content: string; nonce?: string; replyToId?: string; attachmentIds?: string[] },
) {
  const { db, redis } = ctx;
  const { channel, perms } = access;
  const content = input.content.trim();
  const attachmentIds = input.attachmentIds ?? [];
  if (!content && !attachmentIds.length) throw badRequest('Mensagem vazia');

  // Idempotency: retrying with the same nonce returns the original message (no duplicates on reconnect).
  if (input.nonce) {
    const dup = await db.message.findFirst({
      where: { authorId, nonce: input.nonce, channelId: channel.id, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
      include: S.messageInclude,
    });
    if (dup) return S.message(dup, authorId);
  }

  const bypassSlow = hasPermission(perms, Permissions.MANAGE_MESSAGES) || hasPermission(perms, Permissions.MANAGE_CHANNELS);
  if (channel.slowmodeSeconds > 0 && !bypassSlow) {
    const ok = await redis.set(`slow:${channel.id}:${authorId}`, '1', 'EX', channel.slowmodeSeconds, 'NX');
    if (!ok) throw tooMany(`Modo lento ativo: aguarde ${channel.slowmodeSeconds}s entre mensagens`);
  }

  if (attachmentIds.length) {
    if (!hasPermission(perms, Permissions.ATTACH_FILES)) throw badRequest('Sem permissão para anexar arquivos');
    const atts = await db.attachment.findMany({ where: { id: { in: attachmentIds }, uploaderId: authorId, messageId: null } });
    if (atts.length !== attachmentIds.length) throw badRequest('Anexo inválido');
  }

  let replyToId: string | null = null;
  if (input.replyToId) {
    const r = await db.message.findFirst({ where: { id: input.replyToId, channelId: channel.id, deletedAt: null } });
    if (r) replyToId = r.id;
  }

  // Mentions
  let mentions = [...new Set([...content.matchAll(USER_MENTION)].map((m) => m[1]!))].slice(0, 50);
  let mentionRoles = [...new Set([...content.matchAll(ROLE_MENTION)].map((m) => m[1]!))].slice(0, 20);
  const canEveryone = hasPermission(perms, Permissions.MENTION_EVERYONE);
  const mentionEveryone = canEveryone && /@(everyone|here)\b/.test(content);
  if (channel.serverId) {
    if (mentions.length) {
      const ms = await db.member.findMany({ where: { serverId: channel.serverId, userId: { in: mentions } }, select: { userId: true } });
      mentions = ms.map((m) => m.userId);
    }
    if (mentionRoles.length) {
      const rs = await db.role.findMany({ where: { serverId: channel.serverId, id: { in: mentionRoles }, isEveryone: false } });
      mentionRoles = rs.filter((r) => r.mentionable || canEveryone).map((r) => r.id);
    }
  } else {
    const recs = await db.channelRecipient.findMany({ where: { channelId: channel.id }, select: { userId: true } });
    const set = new Set(recs.map((r) => r.userId));
    mentions = mentions.filter((m) => set.has(m));
    mentionRoles = [];
  }

  const id = snowflake();
  const msg = await db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        id,
        channelId: channel.id,
        authorId,
        content,
        nonce: input.nonce ?? null,
        replyToId,
        mentions,
        mentionRoles,
        mentionEveryone,
      },
    });
    if (attachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: m.id } });
    await tx.channel.update({ where: { id: channel.id }, data: { lastMessageId: m.id } });
    // author has read their own message
    await tx.readState.upsert({
      where: { userId_channelId: { userId: authorId, channelId: channel.id } },
      create: { userId: authorId, channelId: channel.id, lastReadMessageId: m.id },
      update: { lastReadMessageId: m.id, mentionCount: 0 },
    });
    return tx.message.findUniqueOrThrow({ where: { id: m.id }, include: S.messageInclude });
  });

  // Mention counters
  let notify: string[] = [];
  if (!channel.serverId) {
    const recs = await db.channelRecipient.findMany({ where: { channelId: channel.id, userId: { not: authorId } } });
    notify = recs.map((r) => r.userId);
    // reopen closed DMs for recipients
    const closed = recs.filter((r) => r.closed).map((r) => r.userId);
    if (closed.length) await db.channelRecipient.updateMany({ where: { channelId: channel.id, userId: { in: closed } }, data: { closed: false } });
  } else {
    const set = new Set(mentions);
    if (mentionRoles.length || mentionEveryone) {
      const ms = await db.member.findMany({
        where: { serverId: channel.serverId, ...(mentionEveryone ? {} : { roles: { some: { roleId: { in: mentionRoles } } } }) },
        select: { userId: true },
        take: 5000,
      });
      for (const m of ms) set.add(m.userId);
    }
    set.delete(authorId);
    notify = [...set];
  }
  if (notify.length) {
    await db.readState.createMany({ data: notify.map((userId) => ({ userId, channelId: channel.id })), skipDuplicates: true });
    await db.readState.updateMany({ where: { channelId: channel.id, userId: { in: notify } }, data: { mentionCount: { increment: 1 } } });
  }

  const payload = S.message(msg, '');
  ctx.gw.toChannel(channel.id, ServerEvents.MESSAGE_CREATE, payload);
  return { ...payload, reactions: [] };
}

export async function createSystemMessage(ctx: AppContext, channelId: string, authorId: string, kind: string) {
  const m = await ctx.db.message.create({
    data: { id: snowflake(), channelId, authorId, content: kind, type: 'system' },
    include: S.messageInclude,
  });
  await ctx.db.channel.update({ where: { id: channelId }, data: { lastMessageId: m.id } });
  ctx.gw.toChannel(channelId, ServerEvents.MESSAGE_CREATE, S.message(m, ''));
}
