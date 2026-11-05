import { create } from 'zustand';

/**
 * Persistent drafts per conversation (survive closing the app). Stored per device in localStorage, keyed by channel,
 * cleared on logout. Feeds the composer and the Pulse "Continuar conversa" module.
 */
type Draft = { text: string; at: number };
const KEY = 'aldetes.drafts';
const MAX = 200;

function load(): Record<string, Draft> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Draft>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export const useDrafts = create<Record<string, Draft>>()(() => load());

let timer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(useDrafts.getState()));
    } catch {
      /* quota / private mode: drafts stay in memory */
    }
  }, 400);
}

export function getDraft(channelId: string): string {
  const d = useDrafts.getState()[channelId]?.text;
  if (d != null) return d;
  // drafts from before 1.0 lived in sessionStorage
  try {
    return sessionStorage.getItem(`draft.${channelId}`) ?? '';
  } catch {
    return '';
  }
}

export function setDraft(channelId: string, text: string) {
  const cur = useDrafts.getState();
  if ((cur[channelId]?.text ?? '') === text) return;
  const next = { ...cur };
  if (text.trim()) next[channelId] = { text, at: Date.now() };
  else delete next[channelId];
  const keys = Object.keys(next);
  if (keys.length > MAX) keys.sort((a, b) => next[a]!.at - next[b]!.at).slice(0, keys.length - MAX).forEach((k) => delete next[k]);
  useDrafts.setState(next, true);
  try {
    sessionStorage.removeItem(`draft.${channelId}`);
  } catch {
    /* ignore */
  }
  persist();
}

export function clearDrafts() {
  useDrafts.setState({}, true);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
