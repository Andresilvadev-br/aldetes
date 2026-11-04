import type { Attachment, Message } from '@aldetes/shared';
import { prepareImage, type Prepared } from './mediaPrep';
import { api, upload } from './api';
import { get, set, upsertMessage, type ClientMessage } from '../store';
import { setUpload, endUpload } from './island';

const PAGE = 50;

export async function loadMessages(channelId: string, opts: { before?: string } = {}) {
  const st = get();
  const cm = st.messages[channelId];
  if (cm?.loading) return;
  if (!opts.before && cm) return; // already loaded; realtime keeps it fresh
  set((s) => ({ messages: { ...s.messages, [channelId]: { items: cm?.items ?? [], hasMore: cm?.hasMore ?? true, loading: true } } }));
  try {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (opts.before) q.set('before', opts.before);
    const rows = await api<Message[]>('GET', `/channels/${channelId}/messages?${q}`);
    const older = rows.slice().reverse();
    set((s) => {
      const cur = s.messages[channelId]?.items ?? [];
      const ids = new Set(cur.map((m) => m.id));
      const merged = opts.before ? [...older.filter((m) => !ids.has(m.id)), ...cur] : mergeLatest(cur, older);
      return { messages: { ...s.messages, [channelId]: { items: merged, hasMore: rows.length === PAGE, loading: false } } };
    });
  } catch (err) {
    set((s) => ({ messages: { ...s.messages, [channelId]: { items: s.messages[channelId]?.items ?? [], hasMore: true, loading: false } } }));
    throw err;
  }
}

function mergeLatest(cur: ClientMessage[], fetched: ClientMessage[]) {
  const map = new Map(fetched.map((m) => [m.id, m]));
  for (const m of cur) if (!map.has(m.id)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => (a.pending ? 1 : b.pending ? -1 : a.id < b.id ? -1 : 1));
}

/** After a reconnect: fetch messages newer than what we have (no duplicates thanks to id merge). */
export async function fetchMissedMessages() {
  const st = get();
  for (const [channelId, cm] of Object.entries(st.messages)) {
    if (!st.channels[channelId]) continue;
    const last = [...cm.items].reverse().find((m) => !m.pending);
    if (!last) continue;
    try {
      const rows = await api<Message[]>('GET', `/channels/${channelId}/messages?after=${last.id}&limit=100`);
      if (rows.length >= 100) {
        // gap too big — reset this channel's cache
        set((s) => {
          const messages = { ...s.messages };
          delete messages[channelId];
          return { messages };
        });
        continue;
      }
      for (const m of rows.reverse()) upsertMessage(channelId, m);
    } catch {
      /* channel may no longer be visible */
    }
  }
  // retry failed sends
  for (const [channelId, cm] of Object.entries(get().messages)) {
    for (const m of cm.items) if (m.pending || m.failed) void resend(channelId, m);
  }
}

function nonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function sendMessage(channelId: string, content: string, opts: { replyTo?: Message | null; files?: File[]; onProgress?: (p: number) => void; voice?: { durationMs: number; waveform: string } } = {}) {
  const me = get().me!;
  const n = nonce();
  let attachments: Attachment[] = [];
  const optimistic: ClientMessage = {
    id: `pending-${n}`,
    channelId,
    author: me,
    content,
    createdAt: new Date().toISOString(),
    editedAt: null,
    replyTo: opts.replyTo ? { id: opts.replyTo.id, content: opts.replyTo.content, author: opts.replyTo.author } : null,
    attachments: [],
    reactions: [],
    mentions: [],
    mentionRoles: [],
    mentionEveryone: false,
    pinned: false,
    nonce: n,
    type: 'default',
    pending: true,
  };
  set((s) => {
    const cm = s.messages[channelId] ?? { items: [], hasMore: true, loading: false };
    return { messages: { ...s.messages, [channelId]: { ...cm, items: [...cm.items, optimistic] } } };
  });
  try {
    if (opts.files?.length) {
      const fd = new FormData();
      // Photos are shrunk + given a thumbnail and a blur preview on this device (receivers download little).
      const prepared: Prepared[] = await Promise.all(opts.files.map((f) => (opts.voice ? Promise.resolve({ file: f }) : prepareImage(f))));
      prepared.forEach((p, i) => {
        fd.append('files', p.file, p.file.name);
        if (p.thumb) fd.append(`thumb_${i}`, p.thumb, 'thumb');
        const meta = { ...(p.placeholder ? { placeholder: p.placeholder } : {}), ...(opts.voice && i === 0 ? opts.voice : {}) };
        if (Object.keys(meta).length) fd.append(`meta_${i}`, JSON.stringify(meta));
      });
      const label = opts.files.length === 1 ? opts.files[0]!.name : `${opts.files.length} arquivos`;
      setUpload(n, label, 0);
      try {
        attachments = await upload<Attachment[]>('/attachments', fd, (p) => {
          setUpload(n, label, p);
          opts.onProgress?.(p);
        });
      } finally {
        endUpload(n);
      }
    }
    (optimistic as any)._attachmentIds = attachments.map((a) => a.id);
    const msg = await api<Message>('POST', `/channels/${channelId}/messages`, {
      content,
      nonce: n,
      replyToId: opts.replyTo?.id,
      attachmentIds: attachments.map((a) => a.id),
    });
    upsertMessage(channelId, msg);
  } catch (err) {
    markFailed(channelId, n);
    throw err;
  }
}

function markFailed(channelId: string, n: string) {
  set((s) => {
    const cm = s.messages[channelId];
    if (!cm) return {};
    return { messages: { ...s.messages, [channelId]: { ...cm, items: cm.items.map((m) => (m.nonce === n && m.pending ? { ...m, failed: true } : m)) } } };
  });
}

export async function resend(channelId: string, m: ClientMessage) {
  if (!m.nonce) return;
  try {
    const msg = await api<Message>('POST', `/channels/${channelId}/messages`, {
      content: m.content,
      nonce: m.nonce,
      replyToId: m.replyTo?.id,
      attachmentIds: (m as any)._attachmentIds ?? [],
    });
    upsertMessage(channelId, msg);
  } catch {
    markFailed(channelId, m.nonce);
  }
}

export function discardPending(channelId: string, n: string) {
  set((s) => {
    const cm = s.messages[channelId];
    if (!cm) return {};
    return { messages: { ...s.messages, [channelId]: { ...cm, items: cm.items.filter((m) => m.nonce !== n || !m.pending) } } };
  });
}

export const editMessage = (channelId: string, id: string, content: string) => api('PATCH', `/channels/${channelId}/messages/${id}`, { content });
export const deleteMessage = (channelId: string, id: string) => api('DELETE', `/channels/${channelId}/messages/${id}`);

export async function toggleReaction(channelId: string, messageId: string, emoji: string) {
  const m = get().messages[channelId]?.items.find((x) => x.id === messageId);
  const mine = m?.reactions.find((r) => r.emoji === emoji)?.me;
  const path = `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`;
  await api(mine ? 'DELETE' : 'PUT', path);
}

const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function ackChannel(channelId: string) {
  const st = get();
  const c = st.channels[channelId];
  if (!c?.lastMessageId) return;
  const rs = st.readStates[channelId];
  if (rs?.lastReadMessageId === c.lastMessageId && !rs.mentionCount) return;
  const messageId = c.lastMessageId;
  set((s) => ({ readStates: { ...s.readStates, [channelId]: { lastReadMessageId: messageId, mentionCount: 0 } } }));
  clearTimeout(ackTimers.get(channelId));
  ackTimers.set(
    channelId,
    setTimeout(() => {
      api('POST', `/channels/${channelId}/ack`, { messageId }).catch(() => {});
    }, 800),
  );
}

export async function openDm(userId: string): Promise<string> {
  const c = await api<{ id: string }>('POST', '/users/@me/channels', { recipientIds: [userId] });
  return c.id;
}
