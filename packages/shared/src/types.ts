import type { ChannelType, PresenceStatus } from './schemas';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  bio: string;
  customStatus: string | null;
  createdAt: string;
}

export interface SelfUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  status: PresenceStatus;
  allowDmsFrom: 'everyone' | 'friends' | 'server_members';
  allowFriendRequests: boolean;
}

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: string; // bigint as decimal string
  hoist: boolean;
  mentionable: boolean;
  isEveryone: boolean;
}

export interface PermissionOverwriteDTO {
  targetType: 'role' | 'member';
  targetId: string;
  allow: string;
  deny: string;
}

export interface Channel {
  id: string;
  serverId: string | null;
  type: ChannelType | 'dm' | 'group_dm';
  name: string;
  topic: string | null;
  position: number;
  parentId: string | null;
  slowmodeSeconds: number;
  lastMessageId: string | null;
  overwrites: PermissionOverwriteDTO[];
  recipients?: PublicUser[];
  ownerId?: string | null;
}

export interface Member {
  userId: string;
  serverId: string;
  nickname: string | null;
  roleIds: string[];
  joinedAt: string;
  timeoutUntil: string | null;
  user: PublicUser;
}

export interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  ownerId: string;
  isPublic: boolean;
  rulesChannelId: string | null;
  welcomeChannelId: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  width: number | null;
  height: number | null;
}

export interface ReactionGroup {
  emoji: string; // unicode or "custom:<id>"
  count: number;
  me: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  author: PublicUser;
  content: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: { id: string; content: string; author: PublicUser } | null;
  attachments: Attachment[];
  reactions: ReactionGroup[];
  mentions: string[];
  mentionRoles: string[];
  mentionEveryone: boolean;
  pinned: boolean;
  nonce?: string | null;
  type: 'default' | 'system';
}

export interface Presence {
  userId: string;
  status: PresenceStatus | 'offline';
  customStatus: string | null;
}

export interface VoiceState {
  userId: string;
  channelId: string;
  serverId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  video: boolean;
  streaming: boolean;
}

export interface Relationship {
  userId: string;
  type: 'friend' | 'incoming' | 'outgoing' | 'blocked';
  user: PublicUser;
}

export interface ReadyPayload {
  user: SelfUser;
  servers: Array<Server & { channels: Channel[]; roles: Role[]; members: Member[]; myPermissions: string }>;
  dms: Channel[];
  relationships: Relationship[];
  presences: Presence[];
  voiceStates: VoiceState[];
  readStates: Array<{ channelId: string; lastReadMessageId: string | null; mentionCount: number }>;
  sessionId: string;
}
