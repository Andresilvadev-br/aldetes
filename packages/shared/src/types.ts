import type { Activity, ChannelType, PresenceStatus } from './schemas';

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
  bannerPreset: string | null;
  profileEffect: string | null;
  /** 1.0 (absent on older servers) */
  avatarDecoration?: string | null;
  profileEntrance?: string | null;
  pronouns?: string | null;
  profileLinks?: Array<{ label: string; url: string }>;
  /** 2.0 Spaces: the person's corner (null = default) and its revision (cache key) */
  space?: import('./schemas').SpaceScene | null;
  spaceRev?: number;
  /** 2.1 Identity Studio */
  bannerOptions?: import('./schemas').BannerOptions | null;
  profileTheme?: string | null;
  profileDecor?: import('./schemas').ProfileDecor | null;
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
  type: ChannelType | 'thread' | 'dm' | 'group_dm';
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
  /** Server Studio (1.0): the published theme; null = default look. */
  studio?: import('./schemas').StudioTheme | null;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  width: number | null;
  height: number | null;
  /** light version for the chat (null for old uploads, GIFs and non-images) */
  thumbUrl?: string | null;
  /** tiny blurred data-URL preview, shown instantly */
  placeholder?: string | null;
  /** voice message: duration and 0–255 amplitude bars */
  durationMs?: number | null;
  waveform?: number[] | null;
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
  activity?: Activity | null;
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

/* ---------------- Together (2.0) ---------------- */
export type BoardItem =
  | { id: string; by: string; type: 'stroke'; tool: 'pen' | 'marker'; color: string; width: number; points: Array<[number, number]> }
  | { id: string; by: string; type: 'text'; color: string; x: number; y: number; text: string };
export interface TogetherState {
  poll?: { question: string; options: string[]; votes: Record<string, number>; endsAt: number | null; closed: boolean };
  timer?: { label: string; durationMs: number; startedAt: number | null; remainingMs: number };
  notes?: { title: string; text: string; editedBy: string | null };
  board?: { title: string; items: BoardItem[] };
  roll?: { title: string; mode: 'dice' | 'people'; sides: number; results: Array<{ by: string; value: number; pick: string | null; at: number }> };
}
export interface TogetherSession {
  id: string;
  channelId: string;
  kind: 'poll' | 'timer' | 'notes' | 'board' | 'roll';
  createdBy: string;
  version: number;
  state: TogetherState;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  keep: boolean;
}
