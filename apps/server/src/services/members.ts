import { ServerEvents, type VoiceState } from '@aldetes/shared';
import type { AppContext } from '../context';
import { forbidden } from '../lib/errors';
import * as S from './serialize';
import { buildServerPayload } from './ready';
import { createSystemMessage } from './messages';
import { getPresence } from '../gateway';

export async function addMember(ctx: AppContext, serverId: string, userId: string) {
  const { db } = ctx;
  const ban = await db.ban.findUnique({ where: { serverId_userId: { serverId, userId } } });
  if (ban) throw forbidden('Você está banido deste servidor');
  const existing = await db.member.findUnique({ where: { serverId_userId: { serverId, userId } } });
  if (existing) return { already: true };
  const member = await db.member.create({ data: { serverId, userId }, include: S.memberInclude });
  ctx.gw.toServer(serverId, ServerEvents.MEMBER_ADD, S.member(member));
  await ctx.gw.syncServerSubscriptions(serverId, userId);
  const payload = await buildServerPayload(ctx, serverId, userId);
  ctx.gw.toUser(userId, ServerEvents.SERVER_JOIN, payload);
  // The newcomer didn't have these people in their READY: send who is online (and what they're doing).
  const others = (payload?.members ?? []).map((m) => m.userId).filter((u) => u !== userId);
  if (others.length) {
    const online = await ctx.redis.mget(others.map((u) => `presence:${u}`));
    for (const [i, u] of others.entries()) {
      if (online[i] && online[i] !== 'invisible') ctx.gw.toUser(userId, ServerEvents.PRESENCE_UPDATE, await getPresence(ctx, u));
    }
  }
  const server = await db.server.findUniqueOrThrow({ where: { id: serverId } });
  if (server.welcomeChannelId) {
    await createSystemMessage(ctx, server.welcomeChannelId, userId, 'member_join').catch(() => {});
  }
  await ctx.gw.broadcastPresence(userId);
  return { already: false };
}

export async function removeMember(ctx: AppContext, serverId: string, userId: string) {
  const { db } = ctx;
  await db.member.delete({ where: { serverId_userId: { serverId, userId } } }).catch(() => {});
  ctx.gw.toServer(serverId, ServerEvents.MEMBER_REMOVE, { serverId, userId });
  ctx.gw.toUser(userId, ServerEvents.SERVER_LEAVE, { id: serverId });
  await ctx.gw.syncServerSubscriptions(serverId, userId);
  await disconnectFromServerVoice(ctx, serverId, userId);
}

export async function disconnectFromServerVoice(ctx: AppContext, serverId: string, userId: string) {
  const raw = await ctx.redis.hget('voice:states', userId);
  if (!raw) return;
  const st = JSON.parse(raw) as VoiceState;
  if (st.serverId !== serverId) return;
  await ctx.livekit.removeParticipant(st.channelId, userId).catch(() => {});
  await ctx.gw.setVoiceState(null, userId);
}

