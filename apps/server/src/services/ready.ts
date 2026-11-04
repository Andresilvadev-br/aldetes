import type { ReadyPayload, Relationship, Presence, VoiceState } from '@aldetes/shared';
import type { AppContext } from '../context';
import * as S from './serialize';
import { getServerAccess, channelPermsFromAccess } from './permissions';
import { hasPermission, Permissions } from '@aldetes/shared';
import { listDms } from './dms';

export async function buildRelationships(ctx: AppContext, userId: string): Promise<Relationship[]> {
  const [outRows, inRows] = await Promise.all([
    ctx.db.relationship.findMany({ where: { fromId: userId }, include: { to: true } }),
    ctx.db.relationship.findMany({ where: { toId: userId, type: 'pending' }, include: { from: true } }),
  ]);
  const out: Relationship[] = outRows.map((r) => ({
    userId: r.toId,
    type: r.type === 'friend' ? 'friend' : r.type === 'blocked' ? 'blocked' : 'outgoing',
    user: S.publicUser(r.to),
  }));
  const seen = new Set(out.map((r) => r.userId));
  for (const r of inRows) if (!seen.has(r.fromId)) out.push({ userId: r.fromId, type: 'incoming', user: S.publicUser(r.from) });
  return out;
}

export async function buildServerPayload(ctx: AppContext, serverId: string, userId: string) {
  const access = await getServerAccess(ctx.db, serverId, userId);
  if (!access) return null;
  const [channels, members] = await Promise.all([
    ctx.db.channel.findMany({ where: { serverId, archived: false }, include: S.channelInclude, orderBy: { position: 'asc' } }),
    ctx.db.member.findMany({ where: { serverId }, include: S.memberInclude }),
  ]);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const visible = channels.filter((c) => {
    const permSource = c.type === 'thread' && c.parentId ? byId.get(c.parentId) : c;
    if (!permSource) return false;
    return hasPermission(channelPermsFromAccess(access, userId, permSource.overwrites), Permissions.VIEW_CHANNEL);
  });
  return {
    ...S.server(access.server),
    channels: visible.map((c) => S.channel(c)),
    roles: access.roles.sort((a, b) => a.position - b.position).map(S.role),
    members: members.map(S.member),
    myPermissions: access.perms.toString(),
  };
}

export async function buildReady(ctx: AppContext, userId: string, sessionId: string): Promise<ReadyPayload> {
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await ctx.db.member.findMany({ where: { userId }, select: { serverId: true } });
  const servers = (await Promise.all(memberships.map((m) => buildServerPayload(ctx, m.serverId, userId)))).filter(
    (s): s is NonNullable<typeof s> => !!s,
  );
  const dms = await listDms(ctx, userId);
  const relationships = await buildRelationships(ctx, userId);

  const related = new Set<string>();
  for (const s of servers) for (const m of s.members) related.add(m.userId);
  for (const r of relationships) if (r.type === 'friend') related.add(r.userId);
  for (const d of dms) for (const r of d.recipients ?? []) related.add(r.id);
  related.add(userId);
  const ids = [...related];
  const statuses = ids.length ? await ctx.redis.mget(ids.map((i) => `presence:${i}`)) : [];
  const acts = ids.length ? await ctx.redis.mget(ids.map((i) => `activity:${i}`)) : [];
  const customs = await ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, customStatus: true } });
  const customMap = new Map(customs.map((c) => [c.id, c.customStatus]));
  const presences: Presence[] = [];
  ids.forEach((id, i) => {
    const st = statuses[i];
    if (!st) return;
    if (st === 'invisible' && id !== userId) return;
    const hidden = st === 'invisible' && id !== userId;
    if (hidden) return;
    presences.push({
      userId: id,
      status: st === 'invisible' ? 'offline' : (st as Presence['status']),
      customStatus: customMap.get(id) ?? null,
      activity: acts[i] ? JSON.parse(acts[i]!) : null,
    });
  });

  const serverIds = new Set(servers.map((s) => s.id));
  const dmIds = new Set(dms.map((d) => d.id));
  const allVoice = await ctx.redis.hgetall('voice:states');
  const voiceStates = Object.values(allVoice)
    .map((v) => JSON.parse(v) as VoiceState)
    .filter((v) => (v.serverId ? serverIds.has(v.serverId) : dmIds.has(v.channelId)));

  const readStates = await ctx.db.readState.findMany({ where: { userId } });

  return {
    user: S.selfUser(user),
    servers,
    dms,
    relationships,
    presences,
    voiceStates,
    readStates: readStates.map((r) => ({ channelId: r.channelId, lastReadMessageId: r.lastReadMessageId, mentionCount: r.mentionCount })),
    sessionId,
  };
}
