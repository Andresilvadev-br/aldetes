import type { PrismaClient, Channel, PermissionOverwrite, Server, Role } from '@prisma/client';
import { computePermissions, hasPermission, Permissions, ALL_PERMISSIONS, type Overwrite } from '@aldetes/shared';
import { forbidden, notFound } from '../lib/errors';

export const DM_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ATTACH_FILES |
  Permissions.ADD_REACTIONS |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.CONNECT |
  Permissions.SPEAK |
  Permissions.VIDEO;

/** Permissions removed while a member is in timeout. */
const TIMEOUT_STRIP =
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.SPEAK |
  Permissions.CONNECT |
  Permissions.VIDEO |
  Permissions.CREATE_THREADS |
  Permissions.CREATE_INVITE;

export interface ServerAccess {
  server: Server;
  roles: Role[];
  memberRoleIds: string[];
  isOwner: boolean;
  perms: bigint;
  timedOut: boolean;
  topRolePosition: number; // owner = Infinity
}

const toOverwrites = (ows: PermissionOverwrite[]): Overwrite[] =>
  ows.map((o) => ({ targetType: o.targetType as 'role' | 'member', targetId: o.targetId, allow: BigInt(o.allow), deny: BigInt(o.deny) }));

export async function getServerAccess(db: PrismaClient, serverId: string, userId: string): Promise<ServerAccess | null> {
  const [server, member, roles] = await Promise.all([
    db.server.findUnique({ where: { id: serverId } }),
    db.member.findUnique({ where: { serverId_userId: { serverId, userId } }, include: { roles: true } }),
    db.role.findMany({ where: { serverId } }),
  ]);
  if (!server || !member) return null;
  const everyone = roles.find((r) => r.isEveryone)!;
  const memberRoleIds = member.roles.map((r) => r.roleId);
  const rolePerms = new Map(roles.map((r) => [r.id, BigInt(r.permissions)]));
  const isOwner = server.ownerId === userId;
  let perms = computePermissions({ isOwner, everyoneRoleId: everyone.id, rolePerms, memberRoleIds, memberId: userId });
  const timedOut = !!member.timeoutUntil && member.timeoutUntil > new Date();
  if (timedOut && !hasPermission(perms, Permissions.ADMINISTRATOR)) perms &= ~TIMEOUT_STRIP;
  const topRolePosition = isOwner
    ? Number.POSITIVE_INFINITY
    : Math.max(0, ...roles.filter((r) => memberRoleIds.includes(r.id)).map((r) => r.position));
  return { server, roles, memberRoleIds, isOwner, perms, timedOut, topRolePosition };
}

export function channelPermsFromAccess(access: ServerAccess, userId: string, overwrites: PermissionOverwrite[]): bigint {
  if (access.isOwner) return ALL_PERMISSIONS;
  const everyone = access.roles.find((r) => r.isEveryone)!;
  const rolePerms = new Map(access.roles.map((r) => [r.id, BigInt(r.permissions)]));
  let p = computePermissions({
    isOwner: false,
    everyoneRoleId: everyone.id,
    rolePerms,
    memberRoleIds: access.memberRoleIds,
    memberId: userId,
    overwrites: toOverwrites(overwrites),
  });
  if (access.timedOut && !hasPermission(p, Permissions.ADMINISTRATOR)) p &= ~TIMEOUT_STRIP;
  // No VIEW_CHANNEL means nothing else applies.
  if (!hasPermission(p, Permissions.VIEW_CHANNEL)) return 0n;
  return p;
}

export interface ChannelAccess {
  channel: Channel;
  perms: bigint;
  server: ServerAccess | null;
}

export async function getChannelAccess(db: PrismaClient, channelId: string, userId: string): Promise<ChannelAccess | null> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  if (!channel.serverId) {
    const rec = await db.channelRecipient.findUnique({ where: { channelId_userId: { channelId, userId } } });
    if (!rec) return null;
    return { channel, perms: DM_PERMISSIONS, server: null };
  }
  const access = await getServerAccess(db, channel.serverId, userId);
  if (!access) return null;
  // Threads inherit permissions from their parent channel.
  const permChannelId = channel.type === 'thread' && channel.parentId ? channel.parentId : channel.id;
  const overwrites = await db.permissionOverwrite.findMany({ where: { channelId: permChannelId } });
  let perms = channelPermsFromAccess(access, userId, overwrites);
  // Category overwrites are not inherited at runtime (channels are synced on creation).
  if (channel.type === 'announcement' && !hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
    perms &= ~Permissions.SEND_MESSAGES;
  }
  return { channel, perms, server: access };
}

/** Throws 404 if the channel isn't visible, 403 if the flag is missing. */
export async function requireChannel(db: PrismaClient, channelId: string, userId: string, flag?: bigint): Promise<ChannelAccess> {
  const a = await getChannelAccess(db, channelId, userId);
  if (!a || !hasPermission(a.perms, Permissions.VIEW_CHANNEL)) throw notFound('Canal não encontrado');
  if (flag !== undefined && !hasPermission(a.perms, flag)) throw forbidden();
  return a;
}

export async function requireServer(db: PrismaClient, serverId: string, userId: string, flag?: bigint): Promise<ServerAccess> {
  const a = await getServerAccess(db, serverId, userId);
  if (!a) throw notFound('Servidor não encontrado');
  if (flag !== undefined && !hasPermission(a.perms, flag)) throw forbidden();
  return a;
}

/** Ids of channels in a server the user can view. */
export async function visibleChannelIds(db: PrismaClient, serverId: string, userId: string): Promise<string[]> {
  const access = await getServerAccess(db, serverId, userId);
  if (!access) return [];
  const channels = await db.channel.findMany({ where: { serverId, type: { not: 'thread' } }, include: { overwrites: true } });
  const visible = new Set(
    channels.filter((c) => hasPermission(channelPermsFromAccess(access, userId, c.overwrites), Permissions.VIEW_CHANNEL)).map((c) => c.id),
  );
  const threads = await db.channel.findMany({ where: { serverId, type: 'thread' }, select: { id: true, parentId: true } });
  for (const t of threads) if (t.parentId && visible.has(t.parentId)) visible.add(t.id);
  return [...visible];
}

/** Actor must outrank the target member (owner can't be targeted). */
export async function assertCanActOn(db: PrismaClient, actor: ServerAccess, targetUserId: string) {
  if (targetUserId === actor.server.ownerId) throw forbidden('Não é possível agir sobre o dono do servidor');
  if (actor.isOwner) return;
  const target = await getServerAccess(db, actor.server.id, targetUserId);
  if (!target) throw notFound('Membro não encontrado');
  if (target.topRolePosition >= actor.topRolePosition) throw forbidden('O cargo do alvo é igual ou superior ao seu');
}
