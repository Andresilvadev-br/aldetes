import { create } from 'zustand';
import {
  computePermissions,
  hasPermission,
  Permissions,
  type Channel,
  type Member,
  type Message,
  type Presence,
  type PublicUser,
  type ReadyPayload,
  type Relationship,
  type Role,
  type SelfUser,
  type Server,
  type VoiceState,
} from '@aldetes/shared';

export type ClientMessage = Message & { pending?: boolean; failed?: boolean };

export interface ChannelMessages {
  items: ClientMessage[]; // oldest → newest
  hasMore: boolean;
  loading: boolean;
}

export interface ServerEntry extends Server {
  myPermissions: string;
}

interface State {
  status: 'loading' | 'unauthenticated' | 'connecting' | 'ready';
  connection: 'connected' | 'reconnecting' | 'disconnected';
  me: SelfUser | null;
  sessionId: string | null;
  servers: Record<string, ServerEntry>;
  serverOrder: string[];
  channels: Record<string, Channel>;
  roles: Record<string, Record<string, Role>>;
  members: Record<string, Record<string, Member>>;
  users: Record<string, PublicUser>;
  presences: Record<string, Presence>;
  voiceStates: Record<string, VoiceState>;
  relationships: Record<string, Relationship>;
  dmIds: string[];
  readStates: Record<string, { lastReadMessageId: string | null; mentionCount: number }>;
  messages: Record<string, ChannelMessages>;
  typing: Record<string, Record<string, number>>;
  emojis: Record<string, Array<{ id: string; name: string; url: string; animated: boolean }>>;
}

export const initialState: State = {
  status: 'loading',
  connection: 'disconnected',
  me: null,
  sessionId: null,
  servers: {},
  serverOrder: [],
  channels: {},
  roles: {},
  members: {},
  users: {},
  presences: {},
  voiceStates: {},
  relationships: {},
  dmIds: [],
  readStates: {},
  messages: {},
  typing: {},
  emojis: {},
};

export const useStore = create<State>()(() => ({ ...initialState }));
export const set = useStore.setState;
export const get = useStore.getState;

const ORDER_KEY = 'aldetes.serverOrder';
function loadOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
  } catch {
    return [];
  }
}
export function saveServerOrder(order: string[]) {
  set({ serverOrder: order });
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

type ServerPayload = ReadyPayload['servers'][number];

export function applyServer(s: ServerPayload) {
  set((st) => {
    const { channels, roles, members, myPermissions, ...server } = s;
    const chans = { ...st.channels };
    for (const id of Object.keys(chans)) if (chans[id]!.serverId === s.id) delete chans[id];
    for (const c of channels) chans[c.id] = c;
    const users = { ...st.users };
    for (const m of members) users[m.userId] = m.user;
    return {
      servers: { ...st.servers, [s.id]: { ...server, myPermissions } },
      serverOrder: st.serverOrder.includes(s.id) ? st.serverOrder : [...st.serverOrder, s.id],
      channels: chans,
      roles: { ...st.roles, [s.id]: Object.fromEntries(roles.map((r) => [r.id, r])) },
      members: { ...st.members, [s.id]: Object.fromEntries(members.map((m) => [m.userId, m])) },
      users,
    };
  });
}

export function removeServer(id: string) {
  set((st) => {
    const servers = { ...st.servers };
    delete servers[id];
    const channels = Object.fromEntries(Object.entries(st.channels).filter(([, c]) => c.serverId !== id));
    const roles = { ...st.roles };
    delete roles[id];
    const members = { ...st.members };
    delete members[id];
    return { servers, channels, roles, members, serverOrder: st.serverOrder.filter((s) => s !== id) };
  });
}

export function applyReady(r: ReadyPayload) {
  const saved = loadOrder();
  const ids = r.servers.map((s) => s.id);
  const order = [...saved.filter((s) => ids.includes(s)), ...ids.filter((s) => !saved.includes(s))];
  set({
    ...initialState,
    messages: get().messages, // keep cache; gaps are refetched by the gateway on reconnect
    status: 'ready',
    connection: 'connected',
    me: r.user,
    sessionId: r.sessionId,
    serverOrder: order,
    presences: Object.fromEntries(r.presences.map((p) => [p.userId, p])),
    voiceStates: Object.fromEntries(r.voiceStates.map((v) => [v.userId, v])),
    relationships: Object.fromEntries(r.relationships.map((x) => [x.userId, x])),
    readStates: Object.fromEntries(r.readStates.map((x) => [x.channelId, { lastReadMessageId: x.lastReadMessageId, mentionCount: x.mentionCount }])),
    users: Object.fromEntries([...r.relationships.map((x) => [x.userId, x.user] as const), [r.user.id, r.user] as const]),
    emojis: get().emojis,
  });
  for (const s of r.servers) applyServer(s);
  set((st) => {
    const channels = { ...st.channels };
    const users = { ...st.users };
    for (const d of r.dms) {
      channels[d.id] = d;
      for (const u of d.recipients ?? []) users[u.id] = u;
    }
    return { channels, users, dmIds: r.dms.map((d) => d.id) };
  });
}

// ---------- selectors / helpers ----------

export function channelPermissions(channelId: string): bigint {
  const st = get();
  const c = st.channels[channelId];
  const me = st.me;
  if (!c || !me) return 0n;
  if (!c.serverId) return Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.ATTACH_FILES | Permissions.ADD_REACTIONS | Permissions.READ_MESSAGE_HISTORY | Permissions.CONNECT | Permissions.SPEAK | Permissions.VIDEO;
  const server = st.servers[c.serverId];
  const roles = st.roles[c.serverId] ?? {};
  const member = st.members[c.serverId]?.[me.id];
  if (!server || !member) return 0n;
  const everyone = Object.values(roles).find((r) => r.isEveryone);
  const permSrc = c.type === 'thread' && c.parentId ? (st.channels[c.parentId] ?? c) : c;
  let p = computePermissions({
    isOwner: server.ownerId === me.id,
    everyoneRoleId: everyone?.id ?? '',
    rolePerms: new Map(Object.values(roles).map((r) => [r.id, BigInt(r.permissions)])),
    memberRoleIds: member.roleIds,
    memberId: me.id,
    overwrites: permSrc.overwrites.map((o) => ({ ...o, allow: BigInt(o.allow), deny: BigInt(o.deny) })),
  });
  if (member.timeoutUntil && new Date(member.timeoutUntil) > new Date() && !hasPermission(p, Permissions.ADMINISTRATOR)) {
    p &= ~(Permissions.SEND_MESSAGES | Permissions.ADD_REACTIONS | Permissions.SPEAK | Permissions.CONNECT | Permissions.VIDEO);
  }
  if (c.type === 'announcement' && !hasPermission(p, Permissions.MANAGE_MESSAGES)) p &= ~Permissions.SEND_MESSAGES;
  return p;
}

export function serverPermissions(serverId: string): bigint {
  const s = get().servers[serverId];
  return s ? BigInt(s.myPermissions) : 0n;
}

/** Recompute my server-level permissions locally after role/member changes. */
export function recomputeMyServerPermissions(serverId: string) {
  const st = get();
  const me = st.me;
  const server = st.servers[serverId];
  if (!me || !server) return;
  const roles = st.roles[serverId] ?? {};
  const member = st.members[serverId]?.[me.id];
  if (!member) return;
  const everyone = Object.values(roles).find((r) => r.isEveryone);
  const p = computePermissions({
    isOwner: server.ownerId === me.id,
    everyoneRoleId: everyone?.id ?? '',
    rolePerms: new Map(Object.values(roles).map((r) => [r.id, BigInt(r.permissions)])),
    memberRoleIds: member.roleIds,
    memberId: me.id,
  });
  set((s) => ({ servers: { ...s.servers, [serverId]: { ...server, myPermissions: p.toString() } } }));
}

export function memberColor(serverId: string | null, userId: string): string | null {
  if (!serverId) return null;
  const st = get();
  const m = st.members[serverId]?.[userId];
  if (!m) return null;
  const roles = st.roles[serverId] ?? {};
  let best: Role | null = null;
  for (const rid of m.roleIds) {
    const r = roles[rid];
    if (r?.color && (!best || r.position > best.position)) best = r;
  }
  return best?.color ?? null;
}

export function displayName(userId: string, serverId?: string | null): string {
  const st = get();
  if (serverId) {
    const nick = st.members[serverId]?.[userId]?.nickname;
    if (nick) return nick;
  }
  const u = st.users[userId];
  return u?.displayName ?? u?.username ?? 'Usuário desconhecido';
}

export function isUnread(channelId: string): boolean {
  const st = get();
  const c = st.channels[channelId];
  if (!c?.lastMessageId) return false;
  const rs = st.readStates[channelId];
  if (!rs?.lastReadMessageId) return true;
  return c.lastMessageId > rs.lastReadMessageId;
}

export function upsertMessage(channelId: string, msg: ClientMessage) {
  set((st) => {
    const cm = st.messages[channelId];
    if (!cm) return {};
    const items = cm.items.slice();
    // Replace optimistic message by nonce, or existing by id
    let idx = msg.nonce ? items.findIndex((m) => m.pending && m.nonce === msg.nonce) : -1;
    if (idx < 0) idx = items.findIndex((m) => m.id === msg.id);
    if (idx >= 0) items[idx] = { ...items[idx], ...msg, pending: false, failed: false };
    else {
      // keep sorted by id (ids are fixed-width, so string compare works)
      let i = items.length;
      while (i > 0 && !items[i - 1]!.pending && items[i - 1]!.id > msg.id) i--;
      items.splice(i, 0, msg);
    }
    // bound memory: keep at most 400 messages per channel in memory
    const trimmed = items.length > 400 ? items.slice(items.length - 400) : items;
    return { messages: { ...st.messages, [channelId]: { ...cm, items: trimmed, hasMore: cm.hasMore || trimmed.length < items.length } } };
  });
}

import { useShallow } from 'zustand/react/shallow';
/** For selectors that build arrays/objects: re-render only when the contents change. */
export function useStoreShallow<T>(sel: (s: State) => T): T {
  return useStore(useShallow(sel));
}
export const EMPTY: never[] = [];
