import { io, type Socket } from 'socket.io-client';
import { ServerEvents, type Channel, type Member, type Message, type Presence, type ReadyPayload, type Relationship, type Role, type VoiceState } from '@aldetes/shared';
import { getBaseUrl, getBearer } from './api';
import {
  applyReady,
  applyServer,
  get,
  removeServer,
  set,
  upsertMessage,
  recomputeMyServerPermissions,
  type ServerEntry,
} from '../store';
import { fetchMissedMessages } from './actions';
import { notifyMessage } from './notify';

let socket: Socket | null = null;
let firstReady = true;
const listeners = new Map<string, Set<(d: any) => void>>();

export function onGateway(event: string, cb: (d: any) => void) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
  return () => {
    listeners.get(event)!.delete(cb);
  };
}

export function getSocket() {
  return socket;
}

export function disconnectGateway() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  firstReady = true;
}

export function connectGateway() {
  disconnectGateway();
  const bearer = getBearer();
  socket = io(getBaseUrl() || undefined, {
    transports: ['websocket'],
    withCredentials: true,
    auth: bearer ? { token: bearer } : undefined,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
  });
  set({ status: get().status === 'ready' ? 'ready' : 'connecting' });

  socket.on('connect', () => set({ connection: 'connected' }));
  socket.on('disconnect', (reason) => {
    set({ connection: 'reconnecting' });
    if (reason === 'io server disconnect') {
      // server kicked us (e.g., session revoked); try once to reconnect, auth failure will log out
      socket?.connect();
    }
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED') {
      window.dispatchEvent(new CustomEvent('aldetes:unauthorized'));
      return;
    }
    set({ connection: 'reconnecting' });
  });
  socket.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }));

  socket.onAny((event, data) => {
    listeners.get(event)?.forEach((cb) => cb(data));
  });

  socket.on(ServerEvents.READY, (r: ReadyPayload) => {
    applyReady(r);
    if (!firstReady) fetchMissedMessages();
    firstReady = false;
  });

  socket.on(ServerEvents.MESSAGE_CREATE, (m: Message) => {
    set((st) => {
      const c = st.channels[m.channelId];
      const channels = c ? { ...st.channels, [m.channelId]: { ...c, lastMessageId: m.id } } : st.channels;
      const me = st.me?.id;
      let readStates = st.readStates;
      if (me && m.author.id !== me) {
        const isDm = c && !c.serverId;
        const mentioned = m.mentions.includes(me) || m.mentionEveryone || m.mentionRoles.some((r) => c?.serverId && st.members[c.serverId]?.[me]?.roleIds.includes(r));
        if (isDm || mentioned) {
          const rs = st.readStates[m.channelId] ?? { lastReadMessageId: null, mentionCount: 0 };
          readStates = { ...st.readStates, [m.channelId]: { ...rs, mentionCount: rs.mentionCount + 1 } };
        }
      } else if (me && m.author.id === me) {
        readStates = { ...st.readStates, [m.channelId]: { lastReadMessageId: m.id, mentionCount: 0 } };
      }
      const users = { ...st.users, [m.author.id]: m.author };
      const dmIds = c && !c.serverId && st.dmIds[0] !== c.id ? [c.id, ...st.dmIds.filter((d) => d !== c.id)] : st.dmIds;
      const typing = st.typing[m.channelId]?.[m.author.id] ? { ...st.typing, [m.channelId]: { ...st.typing[m.channelId], [m.author.id]: 0 } } : st.typing;
      return { channels, readStates, users, dmIds, typing };
    });
    upsertMessage(m.channelId, m);
    notifyMessage(m);
  });

  socket.on(ServerEvents.MESSAGE_UPDATE, (m: Message) => {
    const cm = get().messages[m.channelId];
    const old = cm?.items.find((x) => x.id === m.id);
    if (old) upsertMessage(m.channelId, { ...m, reactions: old.reactions });
  });

  socket.on(ServerEvents.MESSAGE_DELETE, ({ id, channelId }: { id: string; channelId: string }) => {
    set((st) => {
      const cm = st.messages[channelId];
      if (!cm) return {};
      return { messages: { ...st.messages, [channelId]: { ...cm, items: cm.items.filter((m) => m.id !== id) } } };
    });
  });

  socket.on(ServerEvents.REACTION_UPDATE, (d: { channelId: string; messageId: string; emoji: string; userId: string; add: boolean }) => {
    set((st) => {
      const cm = st.messages[d.channelId];
      if (!cm) return {};
      const me = st.me?.id;
      const items = cm.items.map((m) => {
        if (m.id !== d.messageId) return m;
        const reactions = m.reactions.slice();
        const i = reactions.findIndex((r) => r.emoji === d.emoji);
        if (d.add) {
          if (i >= 0) {
            const r = reactions[i]!;
            if (d.userId === me && r.me) return m; // already applied optimistically
            reactions[i] = { ...r, count: r.count + 1, me: r.me || d.userId === me };
          } else reactions.push({ emoji: d.emoji, count: 1, me: d.userId === me });
        } else if (i >= 0) {
          const r = reactions[i]!;
          if (d.userId === me && !r.me) return m;
          const count = r.count - 1;
          if (count <= 0) reactions.splice(i, 1);
          else reactions[i] = { ...r, count, me: d.userId === me ? false : r.me };
        }
        return { ...m, reactions };
      });
      return { messages: { ...st.messages, [d.channelId]: { ...cm, items } } };
    });
  });

  socket.on(ServerEvents.TYPING_START, (d: { channelId: string; userId: string }) => {
    set((st) => ({ typing: { ...st.typing, [d.channelId]: { ...st.typing[d.channelId], [d.userId]: Date.now() + 8000 } } }));
  });

  socket.on(ServerEvents.PRESENCE_UPDATE, (p: Presence) => set((st) => ({ presences: { ...st.presences, [p.userId]: p } })));

  const putChannel = (c: Channel) => set((st) => ({ channels: { ...st.channels, [c.id]: { ...st.channels[c.id], ...c } } }));
  socket.on(ServerEvents.CHANNEL_CREATE, putChannel);
  socket.on(ServerEvents.CHANNEL_UPDATE, putChannel);
  socket.on(ServerEvents.CHANNEL_DELETE, ({ id }: { id: string }) =>
    set((st) => {
      const channels = { ...st.channels };
      delete channels[id];
      return { channels, dmIds: st.dmIds.filter((d) => d !== id) };
    }),
  );
  socket.on(ServerEvents.CHANNELS_REORDER, (d: { items: Array<{ id: string; position: number; parentId: string | null }> }) =>
    set((st) => {
      const channels = { ...st.channels };
      for (const it of d.items) if (channels[it.id]) channels[it.id] = { ...channels[it.id]!, position: it.position, parentId: it.parentId };
      return { channels };
    }),
  );

  socket.on(ServerEvents.SERVER_JOIN, (s: ReadyPayload['servers'][number]) => applyServer(s));
  socket.on(ServerEvents.SERVER_UPDATE, (s: ServerEntry) =>
    set((st) => (st.servers[s.id] ? { servers: { ...st.servers, [s.id]: { ...st.servers[s.id]!, ...s, myPermissions: st.servers[s.id]!.myPermissions } } } : {})),
  );
  socket.on(ServerEvents.SERVER_UPDATE, (s: ServerEntry) => recomputeMyServerPermissions(s.id));
  socket.on(ServerEvents.SERVER_DELETE, ({ id }: { id: string }) => removeServer(id));
  socket.on(ServerEvents.SERVER_LEAVE, ({ id }: { id: string }) => removeServer(id));

  const putMember = (m: Member) => {
    set((st) => ({
      members: { ...st.members, [m.serverId]: { ...st.members[m.serverId], [m.userId]: m } },
      users: { ...st.users, [m.userId]: m.user },
    }));
    if (m.userId === get().me?.id) recomputeMyServerPermissions(m.serverId);
  };
  socket.on(ServerEvents.MEMBER_ADD, putMember);
  socket.on(ServerEvents.MEMBER_UPDATE, putMember);
  socket.on(ServerEvents.MEMBER_REMOVE, ({ serverId, userId }: { serverId: string; userId: string }) =>
    set((st) => {
      const m = { ...st.members[serverId] };
      delete m[userId];
      return { members: { ...st.members, [serverId]: m } };
    }),
  );

  const putRole = (r: Role) => {
    set((st) => ({ roles: { ...st.roles, [r.serverId]: { ...st.roles[r.serverId], [r.id]: r } } }));
    recomputeMyServerPermissions(r.serverId);
  };
  socket.on(ServerEvents.ROLE_CREATE, putRole);
  socket.on(ServerEvents.ROLE_UPDATE, putRole);
  socket.on(ServerEvents.ROLE_DELETE, ({ serverId, id }: { serverId: string; id: string }) => {
    set((st) => {
      const roles = { ...st.roles[serverId] };
      delete roles[id];
      const members = Object.fromEntries(Object.entries(st.members[serverId] ?? {}).map(([k, m]) => [k, { ...m, roleIds: m.roleIds.filter((r) => r !== id) }]));
      return { roles: { ...st.roles, [serverId]: roles }, members: { ...st.members, [serverId]: members } };
    });
    recomputeMyServerPermissions(serverId);
  });

  socket.on(ServerEvents.USER_UPDATE, (d: { self?: boolean; user: any }) =>
    set((st) => {
      const users = { ...st.users, [d.user.id]: { ...st.users[d.user.id], ...d.user } };
      // also refresh embedded member.user copies
      const members = { ...st.members };
      for (const sid of Object.keys(members)) {
        const m = members[sid]![d.user.id];
        if (m) members[sid] = { ...members[sid], [d.user.id]: { ...m, user: { ...m.user, ...d.user } } };
      }
      return { users, members, ...(d.self ? { me: d.user } : {}) };
    }),
  );

  socket.on(ServerEvents.RELATIONSHIP_UPDATE, (d: { userId: string; type: Relationship['type'] | null; user: any }) =>
    set((st) => {
      const relationships = { ...st.relationships };
      if (d.type) relationships[d.userId] = { userId: d.userId, type: d.type, user: d.user };
      else delete relationships[d.userId];
      return { relationships, users: { ...st.users, [d.userId]: d.user } };
    }),
  );

  socket.on(ServerEvents.DM_CREATE, (c: Channel) =>
    set((st) => {
      const users = { ...st.users };
      for (const u of c.recipients ?? []) users[u.id] = u;
      return { channels: { ...st.channels, [c.id]: c }, dmIds: [c.id, ...st.dmIds.filter((d) => d !== c.id)], users };
    }),
  );

  socket.on(ServerEvents.VOICE_STATE_UPDATE, ({ userId, state }: { userId: string; state: VoiceState & { channelId: string | null } }) =>
    set((st) => {
      const voiceStates = { ...st.voiceStates };
      if (state.channelId) voiceStates[userId] = state as VoiceState;
      else delete voiceStates[userId];
      return { voiceStates };
    }),
  );

  socket.on('ack', ({ channelId, messageId }: { channelId: string; messageId: string }) =>
    set((st) => ({ readStates: { ...st.readStates, [channelId]: { lastReadMessageId: messageId, mentionCount: 0 } } })),
  );

  socket.on(ServerEvents.SESSION_REVOKED, () => window.dispatchEvent(new CustomEvent('aldetes:unauthorized')));
}

export function emit(event: string, data: unknown) {
  socket?.emit(event, data);
}
