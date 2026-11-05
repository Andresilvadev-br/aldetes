import type { Prisma, User } from '@prisma/client';
import type { PublicUser, SelfUser, Message, Channel, Role, Member, Server, Attachment } from '@aldetes/shared';
import type { Config } from '../config';
import { studioThemeSchema } from '@aldetes/shared';

let publicUrl = '';
export function setPublicUrl(cfg: Config) {
  publicUrl = cfg.API_PUBLIC_URL.replace(/\/$/, '');
}
export const cdnUrl = (key: string | null | undefined) => (key ? `${publicUrl}/cdn/${key}` : null);

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: cdnUrl(u.avatarKey),
    bannerUrl: cdnUrl(u.bannerKey),
    accentColor: u.accentColor,
    bio: u.bio,
    customStatus: u.customStatus,
    createdAt: u.createdAt.toISOString(),
    bannerPreset: u.bannerPreset,
    profileEffect: u.profileEffect,
    avatarDecoration: u.avatarDecoration,
    profileEntrance: u.profileEntrance,
    pronouns: u.pronouns,
    profileLinks: Array.isArray(u.profileLinks) ? (u.profileLinks as Array<{ label: string; url: string }>) : [],
  };
}

export function selfUser(u: User): SelfUser {
  return {
    ...publicUser(u),
    email: u.email,
    emailVerified: u.emailVerified,
    status: u.status as SelfUser['status'],
    allowDmsFrom: u.allowDmsFrom as SelfUser['allowDmsFrom'],
    allowFriendRequests: u.allowFriendRequests,
  };
}

export const messageInclude = {
  author: true,
  attachments: true,
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { include: { author: true } },
} satisfies Prisma.MessageInclude;

export type FullMessage = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function attachment(a: FullMessage['attachments'][number]): Attachment {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    url: cdnUrl(a.storageKey)!,
    width: a.width,
    height: a.height,
    thumbUrl: a.thumbKey ? cdnUrl(a.thumbKey) : null,
    placeholder: a.placeholder ?? null,
    durationMs: a.durationMs ?? null,
    waveform: a.waveform ? [...Buffer.from(a.waveform, 'base64')] : null,
  };
}

/** `viewerId` is used to compute `me` on reactions. */
export function message(m: FullMessage, viewerId: string): Message {
  const groups = new Map<string, { count: number; me: boolean }>();
  for (const r of m.reactions) {
    const g = groups.get(r.emoji) ?? { count: 0, me: false };
    g.count++;
    if (r.userId === viewerId) g.me = true;
    groups.set(r.emoji, g);
  }
  return {
    id: m.id,
    channelId: m.channelId,
    author: publicUser(m.author),
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    replyTo:
      m.replyTo && !m.replyTo.deletedAt
        ? { id: m.replyTo.id, content: m.replyTo.content.slice(0, 200), author: publicUser(m.replyTo.author) }
        : null,
    attachments: m.attachments.map(attachment),
    reactions: [...groups.entries()].map(([emoji, g]) => ({ emoji, ...g })),
    mentions: m.mentions,
    mentionRoles: m.mentionRoles,
    mentionEveryone: m.mentionEveryone,
    pinned: m.pinned,
    nonce: m.nonce,
    type: m.type as Message['type'],
  };
}

export const channelInclude = { overwrites: true } satisfies Prisma.ChannelInclude;

export function channel(
  c: Prisma.ChannelGetPayload<{ include: typeof channelInclude }>,
  recipients?: User[],
): Channel {
  return {
    id: c.id,
    serverId: c.serverId,
    type: c.type as Channel['type'],
    name: c.name,
    topic: c.topic,
    position: c.position,
    parentId: c.parentId,
    slowmodeSeconds: c.slowmodeSeconds,
    lastMessageId: c.lastMessageId,
    ownerId: c.ownerId,
    overwrites: c.overwrites.map((o) => ({
      targetType: o.targetType as 'role' | 'member',
      targetId: o.targetId,
      allow: o.allow,
      deny: o.deny,
    })),
    ...(recipients ? { recipients: recipients.map(publicUser) } : {}),
  };
}

export function role(r: Prisma.RoleGetPayload<object>): Role {
  return {
    id: r.id,
    serverId: r.serverId,
    name: r.name,
    color: r.color,
    position: r.position,
    permissions: r.permissions,
    hoist: r.hoist,
    mentionable: r.mentionable,
    isEveryone: r.isEveryone,
  };
}

export const memberInclude = { user: true, roles: { select: { roleId: true } } } satisfies Prisma.MemberInclude;

export function member(m: Prisma.MemberGetPayload<{ include: typeof memberInclude }>): Member {
  return {
    userId: m.userId,
    serverId: m.serverId,
    nickname: m.nickname,
    roleIds: m.roles.map((r) => r.roleId),
    joinedAt: m.joinedAt.toISOString(),
    timeoutUntil: m.timeoutUntil?.toISOString() ?? null,
    user: publicUser(m.user),
  };
}

/** Stored JSON is re-validated on the way out: a bad/old value falls back to defaults instead of breaking clients. */
function parseStudio(v: unknown) {
  if (!v) return null;
  const r = studioThemeSchema.safeParse(v);
  return r.success ? r.data : null;
}

export function server(s: Prisma.ServerGetPayload<object>): Server {
  return {
    id: s.id,
    name: s.name,
    iconUrl: cdnUrl(s.iconKey),
    bannerUrl: cdnUrl(s.bannerKey),
    description: s.description,
    ownerId: s.ownerId,
    isPublic: s.isPublic,
    rulesChannelId: s.rulesChannelId,
    welcomeChannelId: s.welcomeChannelId,
    createdAt: s.createdAt.toISOString(),
    studio: parseStudio(s.studio),
  };
}
