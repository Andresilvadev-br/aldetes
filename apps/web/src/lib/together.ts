import { create } from 'zustand';
import { ServerEvents, type BoardItem, type TogetherOp, type TogetherSession, type TogetherCreate } from '@aldetes/shared';
import { api, ApiError } from './api';
import { onGateway, emit } from './gateway';
import { useStore } from '../store';

/**
 * Together client: sessions per channel, kept in sync by Socket.IO ("together:update") and re-fetched after any
 * reconnect (READY) — so a person who dropped finds the timer and the notes at the current version.
 * Ops carry an opId that is reused on retry: the server ignores replays, so nothing is applied twice.
 * "Salvo" is only shown after the server acknowledged (never optimistic for notes).
 */
type Presence = { userId: string; x?: number; y?: number; editing?: boolean; at: number };
interface TogetherStore {
  byChannel: Record<string, TogetherSession[]>;
  /** serverNow - Date.now(): the timer uses the server clock */
  offset: number;
  sync: 'idle' | 'syncing' | 'offline';
  presence: Record<string, Record<string, Presence>>; // sid → userId → presence
}
export const useTogether = create<TogetherStore>()(() => ({ byChannel: {}, offset: 0, sync: 'idle', presence: {} }));
const set = useTogether.setState;
const get = useTogether.getState;

let watched: string | null = null;
let installed = false;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const upsert = (channelId: string, s: TogetherSession) =>
  set((st) => {
    const list = st.byChannel[channelId] ?? [];
    const i = list.findIndex((x) => x.id === s.id);
    const next = i >= 0 ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
    return { byChannel: { ...st.byChannel, [channelId]: next } };
  });

export async function loadTogether(channelId: string) {
  set({ sync: 'syncing' });
  try {
    const r = await api<{ serverNow: number; sessions: TogetherSession[] }>('GET', `/channels/${channelId}/together`);
    set((st) => ({ byChannel: { ...st.byChannel, [channelId]: r.sessions }, offset: r.serverNow - Date.now(), sync: 'idle' }));
  } catch {
    set({ sync: 'offline' });
  }
}

/** Start following one call's tools (only the call you are in). */
export function watchTogether(channelId: string | null) {
  watched = channelId;
  if (!installed) {
    installed = true;
    onGateway('together:update', onUpdate);
    onGateway('together:presence', (p: Presence & { channelId: string; sid: string }) => {
      if (p.channelId !== watched) return;
      set((st) => ({ presence: { ...st.presence, [p.sid]: { ...st.presence[p.sid], [p.userId]: { ...p, at: Date.now() } } } }));
    });
    // after a reconnect the server sends READY again: resync the call we're in
    onGateway(ServerEvents.READY, () => watched && void loadTogether(watched));
  }
  if (channelId) void loadTogether(channelId);
}

function onUpdate(m: { type: string; session?: TogetherSession; id?: string; channelId?: string; version?: number; delta?: { add?: BoardItem; remove?: string[]; clear?: boolean }; serverNow?: number }) {
  if (m.serverNow) set({ offset: m.serverNow - Date.now() });
  if ((m.type === 'created' || m.type === 'state') && m.session) return upsert(m.session.channelId, m.session);
  if (m.type === 'deleted' && m.id && m.channelId) return set((st) => ({ byChannel: { ...st.byChannel, [m.channelId!]: (st.byChannel[m.channelId!] ?? []).filter((x) => x.id !== m.id) } }));
  if (m.type === 'delta' && m.id) {
    const ch = Object.keys(get().byChannel).find((c) => get().byChannel[c]!.some((x) => x.id === m.id));
    if (!ch) return;
    const s = get().byChannel[ch]!.find((x) => x.id === m.id)!;
    // a missed version → fetch the truth instead of guessing
    if (m.version !== s.version + 1) return void loadTogether(ch);
    upsert(ch, applyDelta(s, m.delta!, m.version!));
  }
}

function applyDelta(s: TogetherSession, d: { add?: BoardItem; remove?: string[]; clear?: boolean }, version: number): TogetherSession {
  const b = s.state.board;
  if (!b) return s;
  let items = b.items;
  if (d.clear) items = [];
  if (d.remove) items = items.filter((i) => !d.remove!.includes(i.id));
  if (d.add && !items.some((i) => i.id === d.add!.id)) items = [...items, d.add];
  return { ...s, version, state: { ...s.state, board: { ...b, items } } };
}

export async function createTogether(channelId: string, body: TogetherCreate) {
  const r = await api<{ serverNow: number; session: TogetherSession }>('POST', `/channels/${channelId}/together`, body);
  upsert(channelId, r.session);
  return r.session;
}

export class TogetherConflict extends Error {
  constructor(public session: TogetherSession) {
    super('conflict');
  }
}

/** Send one operation (retried with the SAME opId on network errors, so it can't be applied twice). */
export async function togetherOp(s: TogetherSession, op: TogetherOp, baseVersion?: number) {
  const opId = newId();
  // board: show my own stroke immediately; the server's delta (same id) is then a no-op
  if (op.type === 'stroke' || op.type === 'text') {
    const me = useStore.getState().me?.id ?? '';
    const item = (op.type === 'stroke' ? { ...op, by: me, type: 'stroke' } : { ...op, by: me, type: 'text' }) as BoardItem;
    upsert(s.channelId, { ...s, state: { ...s.state, board: { ...s.state.board!, items: [...s.state.board!.items, item] } } });
  }
  for (let attempt = 0; ; attempt++) {
    set({ sync: 'syncing' });
    try {
      const r = await api<{ serverNow: number; session: TogetherSession; duplicate?: boolean }>('POST', `/together/${s.id}/op`, { opId, baseVersion, op });
      set({ sync: 'idle', offset: r.serverNow - Date.now() });
      if (r.session.state && Object.keys(r.session.state).length) upsert(s.channelId, r.session);
      return r.session;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        set({ sync: 'idle' });
        const body = e.body as { session?: TogetherSession } | undefined;
        if (body?.session) {
          upsert(s.channelId, body.session);
          throw new TogetherConflict(body.session);
        }
      }
      const network = !(e instanceof ApiError) || e.status === 0;
      if (!network || attempt >= 3) {
        set({ sync: network ? 'offline' : 'idle' });
        if (!network) void loadTogether(s.channelId);
        throw e;
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

export async function closeTogether(s: TogetherSession, keep: boolean) {
  await api('POST', `/together/${s.id}/close`, { keep });
  if (!keep) set((st) => ({ byChannel: { ...st.byChannel, [s.channelId]: (st.byChannel[s.channelId] ?? []).filter((x) => x.id !== s.id) } }));
}

let lastPresence = 0;
export function sendPresence(channelId: string, sid: string, p: { x?: number; y?: number; editing?: boolean }) {
  const now = Date.now();
  if (now - lastPresence < 50) return;
  lastPresence = now;
  emit('together:presence', { channelId, sid, ...p });
}

export const serverNow = () => Date.now() + get().offset;
