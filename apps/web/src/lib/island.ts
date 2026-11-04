import { create } from 'zustand';

/**
 * Live Island state. Persistent activities (call, screen share, uploads) come from their own
 * stores; this store holds short-lived events (messages, incoming calls, results) and uploads.
 */
export interface IslandEvent {
  id: string;
  kind: 'message' | 'ring' | 'success' | 'error' | 'info';
  title: string;
  body?: string;
  userId?: string;
  channelId?: string;
  ttl: number; // ms
  createdAt: number;
}

export interface UploadActivity {
  id: string;
  label: string;
  progress: number; // 0..1
}

interface IslandState {
  events: IslandEvent[];
  uploads: Record<string, UploadActivity>;
  expanded: boolean;
}

export const useIsland = create<IslandState>()(() => ({ events: [], uploads: {}, expanded: false }));
const set = useIsland.setState;

let seq = 0;
const lastByKey = new Map<string, number>();

/** Rate-limited: the same key won't re-announce within `cooldown` ms. Max 3 queued. */
export function pushIsland(e: Omit<IslandEvent, 'id' | 'createdAt'> & { key?: string; cooldown?: number }) {
  const now = Date.now();
  if (e.key) {
    const last = lastByKey.get(e.key) ?? 0;
    if (now - last < (e.cooldown ?? 1500)) return;
    lastByKey.set(e.key, now);
  }
  const ev: IslandEvent = { ...e, id: `ev${++seq}`, createdAt: now };
  set((s) => {
    // a ring always wins and replaces older rings
    const rest = s.events.filter((x) => !(x.kind === 'ring' && ev.kind === 'ring'));
    const events = ev.kind === 'ring' ? [ev, ...rest] : [...rest, ev];
    return { events: events.slice(0, 3) };
  });
  return ev.id;
}

export function dismissIsland(id: string) {
  set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
}

export function setUpload(id: string, label: string, progress: number) {
  set((s) => ({ uploads: { ...s.uploads, [id]: { id, label, progress } } }));
}
export function endUpload(id: string) {
  set((s) => {
    const uploads = { ...s.uploads };
    delete uploads[id];
    return { uploads };
  });
}
export function setIslandExpanded(v: boolean) {
  set({ expanded: v });
}
