import type { Channel } from '@aldetes/shared';
import type { AppContext } from '../context';
import * as S from './serialize';

export async function listDms(ctx: AppContext, userId: string): Promise<Channel[]> {
  const recs = await ctx.db.channelRecipient.findMany({
    where: { userId, closed: false },
    include: { channel: { include: { overwrites: true, recipients: { include: { user: true } } } } },
  });
  return recs
    .map((r) =>
      S.channel(
        r.channel,
        r.channel.recipients.filter((x) => x.userId !== userId).map((x) => x.user),
      ),
    )
    .sort((a, b) => (BigInt(b.lastMessageId ?? b.id) > BigInt(a.lastMessageId ?? a.id) ? 1 : -1));
}

export async function dmChannelPayload(ctx: AppContext, channelId: string, viewerId: string): Promise<Channel> {
  const c = await ctx.db.channel.findUniqueOrThrow({
    where: { id: channelId },
    include: { overwrites: true, recipients: { include: { user: true } } },
  });
  return S.channel(c, c.recipients.filter((x) => x.userId !== viewerId).map((x) => x.user));
}

/** Is either user blocking the other? */
export async function isBlockedBetween(ctx: AppContext, a: string, b: string) {
  const n = await ctx.db.relationship.count({
    where: { type: 'blocked', OR: [{ fromId: a, toId: b }, { fromId: b, toId: a }] },
  });
  return n > 0;
}
