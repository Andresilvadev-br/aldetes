import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence } from 'motion/react';
import { useVoiceRecorder, RecordingBar, SendOrMic } from './VoiceRecorder';
import { Permissions, hasPermission, type Message } from '@aldetes/shared';
import { useStore, useStoreShallow, get, channelPermissions, displayName } from '@/store';
import { sendMessage } from '@/lib/actions';
import { emit } from '@/lib/gateway';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { toastError, toast } from '../common/overlay';
import { EmojiPicker } from './EmojiPicker';
import { dmName } from '../layout/HomeSidebar';
import { searchEmoji } from '@/lib/emoji';

const MAX_FILE_MB = 25;

type Suggestion = { kind: 'user' | 'role' | 'channel' | 'emoji'; id: string; label: string; insert: string; sub?: string; color?: string | null };

/** Convert human-friendly @name / #channel tokens to wire mentions before sending. */
export function encodeMentions(text: string, serverId: string | null, channelId: string): string {
  const st = get();
  const users: Array<{ id: string; username: string }> = serverId
    ? Object.values(st.members[serverId] ?? {}).map((m) => ({ id: m.userId, username: m.user.username }))
    : [...(st.channels[channelId]?.recipients ?? []).map((u) => ({ id: u.id, username: u.username })), { id: st.me!.id, username: st.me!.username }];
  const byName = new Map(users.map((u) => [u.username.toLowerCase(), u.id]));
  const roles = serverId ? Object.values(st.roles[serverId] ?? {}).filter((r) => !r.isEveryone) : [];
  const chans = serverId ? Object.values(st.channels).filter((c) => c.serverId === serverId && c.type !== 'category' && c.type !== 'voice') : [];
  // don't touch code spans/blocks
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/(^|[\s(])@([a-z0-9_.]{2,32})/g, (all, pre, name) => {
          const id = byName.get(name.toLowerCase());
          if (id) return `${pre}<@${id}>`;
          const role = roles.find((r) => r.name.toLowerCase().replace(/\s+/g, '') === name.toLowerCase());
          return role ? `${pre}<@&${role.id}>` : all;
        })
        .replace(/(^|[\s(])#([a-z0-9_\-]{1,100})/g, (all, pre, name) => {
          const c = chans.find((x) => x.name.toLowerCase() === name.toLowerCase());
          return c ? `${pre}<#${c.id}>` : all;
        });
    })
    .join('');
}

export function Composer({ channelId, replyTo, onClearReply }: { channelId: string; replyTo: Message | null; onClearReply: () => void }) {
  const channel = useStore((s) => s.channels[channelId])!;
  const [text, setText] = useState(() => sessionStorage.getItem(`draft.${channelId}`) ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState(0);
  const [cursor, setCursor] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const perms = channelPermissions(channelId);
  const canAttach = hasPermission(perms, Permissions.ATTACH_FILES);
  const typingUsers = useStoreShallow((s) => {
    const t = s.typing[channelId] ?? {};
    const now = Date.now();
    return Object.entries(t)
      .filter(([uid, exp]) => exp > now && uid !== s.me?.id)
      .map(([uid]) => uid);
  });
  const [, force] = useState(0);
  useEffect(() => {
    if (!typingUsers.length) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [typingUsers.length]);

  useEffect(() => {
    sessionStorage.setItem(`draft.${channelId}`, text);
  }, [text, channelId]);
  useEffect(() => {
    if (replyTo) ta.current?.focus();
  }, [replyTo]);

  // autocomplete
  const suggestions = useMemo<Suggestion[]>(() => {
    const before = text.slice(0, cursor);
    const m = /(^|\s)([@#:])([^\s@#:]{0,32})$/.exec(before);
    if (!m) return [];
    const [, , trigger, q] = m;
    const ql = q!.toLowerCase();
    const st = get();
    if (trigger === '@') {
      const users = channel.serverId
        ? Object.values(st.members[channel.serverId] ?? {}).map((mm) => mm.user)
        : [...(channel.recipients ?? []), st.me!];
      const out: Suggestion[] = users
        .filter((u) => u.username.includes(ql) || u.displayName.toLowerCase().includes(ql))
        .slice(0, 8)
        .map((u) => ({ kind: 'user', id: u.id, label: displayName(u.id, channel.serverId), sub: u.username, insert: `@${u.username} ` }));
      if (channel.serverId) {
        for (const r of Object.values(st.roles[channel.serverId] ?? {}))
          if (!r.isEveryone && (r.mentionable || hasPermission(perms, Permissions.MENTION_EVERYONE)) && r.name.toLowerCase().includes(ql))
            out.push({ kind: 'role', id: r.id, label: `@${r.name}`, insert: `@${r.name.replace(/\s+/g, '')} `, color: r.color });
        if (hasPermission(perms, Permissions.MENTION_EVERYONE))
          for (const e of ['everyone', 'here']) if (e.startsWith(ql)) out.push({ kind: 'role', id: e, label: `@${e}`, insert: `@${e} `, sub: e === 'everyone' ? 'Notifica todos' : 'Notifica quem está online' });
      }
      return out.slice(0, 10);
    }
    if (trigger === '#' && channel.serverId) {
      return Object.values(st.channels)
        .filter((c) => c.serverId === channel.serverId && ['text', 'announcement', 'forum'].includes(c.type) && c.name.includes(ql))
        .slice(0, 8)
        .map((c) => ({ kind: 'channel', id: c.id, label: `#${c.name}`, insert: `#${c.name} ` }));
    }
    if (trigger === ':' && q!.length >= 2) {
      const custom = channel.serverId ? (st.emojis[channel.serverId] ?? []).filter((e) => e.name.toLowerCase().includes(ql)) : [];
      return [
        ...custom.slice(0, 5).map((e) => ({ kind: 'emoji' as const, id: e.id, label: `:${e.name}:`, insert: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}> `, sub: e.url })),
        ...searchEmoji(ql)
          .slice(0, 8)
          .map(([e, n]) => ({ kind: 'emoji' as const, id: e, label: `${e}  :${n.split(' ')[0]}:`, insert: `${e} ` })),
      ];
    }
    return [];
  }, [text, cursor, channel, perms]);

  useEffect(() => setSel(0), [suggestions.length]);

  function applySuggestion(s: Suggestion) {
    const before = text.slice(0, cursor).replace(/([@#:])([^\s@#:]{0,32})$/, s.insert);
    const after = text.slice(cursor);
    setText(before + after);
    requestAnimationFrame(() => {
      ta.current?.setSelectionRange(before.length, before.length);
      setCursor(before.length);
      ta.current?.focus();
    });
  }

  function addFiles(list: FileList | File[]) {
    if (!canAttach) return toast('Você não tem permissão para anexar arquivos aqui.', 'error');
    const arr = [...list];
    const big = arr.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return toast(`"${big.name}" excede o limite de ${MAX_FILE_MB} MB.`, 'error');
    setFiles((f) => [...f, ...arr].slice(0, 10));
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const recorder = useVoiceRecorder((clip) => {
    const reply = replyTo;
    onClearReply();
    setProgress(0);
    sendMessage(channelId, '', { replyTo: reply, files: [clip.file], voice: { durationMs: clip.durationMs, waveform: clip.waveform }, onProgress: setProgress })
      .catch(toastError)
      .finally(() => setProgress(null));
  });

  async function submit() {
    const content = encodeMentions(text.trim(), channel.serverId, channelId);
    if (!content && !files.length) return;
    // "/shrug"-style quick commands
    const body = content === '/shrug' ? '¯\\_(ツ)_/¯' : content;
    if (body.length > 4000) return toast('Mensagem muito longa (máx. 4000 caracteres).', 'error');
    const sendFiles = files;
    setText('');
    setFiles([]);
    onClearReply();
    try {
      await sendMessage(channelId, body, { replyTo, files: sendFiles, onProgress: sendFiles.length ? setProgress : undefined });
    } catch (e) {
      toastError(e);
    } finally {
      setProgress(null);
    }
  }

  const placeholder = channel.serverId ? `Conversar em #${channel.name}` : `Conversar com ${dmName(channel)}`;

  return (
    <div data-composer className="relative shrink-0 px-2 pb-6 pt-1 sm:px-4">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 max-h-72 animate-pop overflow-y-auto rounded-2xl border border-line/[0.08] bg-bg-float p-1.5 shadow-float">
          {suggestions.map((s, i) => (
            <button
              key={s.kind + s.id}
              className={clsx('flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left', i === sel ? 'bg-brand/15 text-fg-strong' : 'text-fg')}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              {s.kind === 'user' && <Avatar userId={s.id} size={24} />}
              {s.kind === 'emoji' && s.sub && <img src={s.sub} className="h-6 w-6 object-contain" alt="" />}
              <span style={{ color: s.color ?? undefined }}>{s.label}</span>
              {s.sub && s.kind !== 'emoji' && <span className="ml-auto text-sm text-fg-faint">{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-line/[0.08] bg-brand/[0.08] px-4 py-2 text-sm text-fg-muted">
          <span>
            Respondendo a <b className="text-fg-strong">{displayName(replyTo.author.id, channel.serverId)}</b>
          </span>
          <button className="hover:text-fg-strong" onClick={onClearReply}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className={clsx('flex gap-3 overflow-x-auto border border-b-0 border-line/[0.08] bg-bg-input/80 p-3', replyTo ? '' : 'rounded-t-2xl')}>
          {files.map((f, i) => (
            <div key={i} className="relative flex h-40 w-40 shrink-0 flex-col rounded-xl border border-line/[0.06] bg-bg-side p-2">
              {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} className="min-h-0 flex-1 rounded object-contain" alt="" /> : <Icon name="file" size={64} className="m-auto text-fg-muted" />}
              <div className="mt-1 truncate text-xs text-fg">{f.name}</div>
              <button className="absolute -right-2 -top-2 rounded bg-bg-float p-1 text-danger shadow" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {progress !== null && (
        <div className="h-1 w-full bg-bg-side">
          <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div
        className={clsx(
          'flex items-end gap-2 border border-line/[0.08] bg-bg-input/80 py-1 pl-3 pr-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-brand/45 focus-within:shadow-[0_0_0_4px_rgb(var(--brand)/0.1)] sm:pl-4',
          replyTo || files.length ? 'rounded-b-2xl' : 'rounded-2xl',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        {canAttach && recorder.phase === 'idle' && (
          <button className="mb-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-line/[0.07] text-fg-muted transition-[transform,color,background-color] hover:bg-brand/20 hover:text-brand active:scale-90" title="Enviar arquivo" onClick={() => fileInput.current?.click()}>
            <Icon name="plus" size={17} strokeWidth={2.5} />
          </button>
        )}
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <AnimatePresence mode="popLayout" initial={false}>
          {recorder.phase !== 'idle' && <RecordingBar key="rec" r={recorder} />}
        </AnimatePresence>
        <textarea
          ref={ta}
          hidden={recorder.phase !== 'idle'}
          aria-label={placeholder}
          className="scroll-thin max-h-[50vh] min-h-[44px] flex-1 resize-none bg-transparent py-[11px] text-fg-strong outline-none placeholder:text-fg-faint"
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCursor(e.target.selectionStart);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            const now = Date.now();
            if (e.target.value && now - lastTyping.current > 6000) {
              lastTyping.current = now;
              emit('typing', { channelId });
            }
          }}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                return setSel((sel + 1) % suggestions.length);
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                return setSel((sel - 1 + suggestions.length) % suggestions.length);
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                return applySuggestion(suggestions[sel]!);
              }
            }
            // phones: Enter makes a new line and the send button sends (like WhatsApp)
            if (e.key === 'Enter' && !e.shiftKey && !coarse) {
              e.preventDefault();
              void submit();
            }
            if (e.key === 'Escape' && replyTo) onClearReply();
          }}
        />
        {recorder.phase === 'idle' && (
        <button
          className="mb-2.5 shrink-0 text-fg-muted hover:text-fg-strong"
          title="Emoji"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPicker({ x: r.right - 340, y: r.top - 370 });
          }}
        >
          <Icon name="smile" size={22} />
        </button>
        )}
        <SendOrMic canSend={!!text.trim() || files.length > 0} onSend={() => void submit()} recorder={recorder} canRecord={canAttach} />
      </div>
      <div className="absolute bottom-1 left-4 h-5 text-xs text-fg-muted">
        {typingUsers.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
            <b className="text-fg">{typingUsers.slice(0, 3).map((u) => displayName(u, channel.serverId)).join(', ')}</b>
            {typingUsers.length > 3 ? ' e outros estão digitando…' : typingUsers.length > 1 ? ' estão digitando…' : ' está digitando…'}
          </span>
        )}
      </div>
      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          serverId={channel.serverId}
          forText
          onClose={() => setPicker(null)}
          onPick={(emoji) => {
            setText((t) => t + emoji);
            setPicker(null);
            ta.current?.focus();
          }}
        />
      )}
    </div>
  );
}
