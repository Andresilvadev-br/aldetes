import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { VoiceMessage } from './VoiceMessage';
import { Permissions, hasPermission, type Attachment, type Channel, type Message } from '@aldetes/shared';
import { useStore, channelPermissions, memberColor, displayName, get, type ClientMessage } from '@/store';
import { renderMarkdown, isJumbo } from '@/lib/markdown';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { UserPopout, UserPopoutTrigger } from '../common/UserPopout';
import { Tooltip, useContextMenu, confirmDialog, toastError, toast, Modal } from '../common/overlay';
import { EmojiPicker } from './EmojiPicker';
import { deleteMessage, editMessage, toggleReaction, resend, discardPending, jumpToMessage } from '@/lib/actions';
import { motion, AnimatePresence } from 'motion/react';
import { spring, dur, ease } from '@/lib/motion';
import { createPortal } from 'react-dom';
import { isMobileNow } from '@/lib/mobile';
import { api } from '@/lib/api';
import { ForwardModal } from '../modals/ForwardModal';

function time(iso: string, withDate = false) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (!withDate) return t;
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return `Hoje às ${t}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ontem às ${t}`;
  return `${d.toLocaleDateString('pt-BR')} ${t}`;
}

const SYSTEM_TEXT: Record<string, string> = {
  member_join: 'entrou no servidor. Dê as boas-vindas!',
};

export const MessageRow = memo(function MessageRow({ message: m, channel, grouped, onReply }: { message: ClientMessage; channel: Channel; grouped: boolean; onReply: (m: Message) => void }) {
  const me = useStore((s) => s.me)!;
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [userPop, setUserPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [forward, setForward] = useState(false);
  // only messages that just arrived animate in (not history loads)
  const [fresh] = useState(() => Date.now() - new Date(m.createdAt).getTime() < 4000);
  const menu = useContextMenu();
  const nav = useNavigate();
  const perms = channelPermissions(channel.id);
  const canManage = !!channel.serverId && hasPermission(perms, Permissions.MANAGE_MESSAGES);
  const canPin = !channel.serverId || canManage;
  const isMine = m.author.id === me.id;
  const color = useStore(() => memberColor(channel.serverId, m.author.id));
  const name = useStore(() => displayName(m.author.id, channel.serverId));
  const mentionsMe = m.mentions.includes(me.id) || m.mentionEveryone || (channel.serverId ? m.mentionRoles.some((r) => get().members[channel.serverId!]?.[me.id]?.roleIds.includes(r)) : false);
  const ctx = {
    serverId: channel.serverId,
    onUser: (id: string, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setUserPop({ id, x: r.left, y: r.bottom + 4 });
    },
    onChannel: (id: string) => {
      const c = get().channels[id];
      if (c?.serverId) nav(`/channels/${c.serverId}/${c.id}`);
    },
  };

  if (m.type === 'system') {
    return (
      <div className="group flex items-center gap-4 px-4 py-1 hover:bg-fg/[.03]">
        <div className="flex w-10 justify-center text-ok">
          <Icon name="chevronRight" size={18} strokeWidth={3} />
        </div>
        <div className="text-sm text-fg-muted">
          <span className="font-medium text-fg-strong">{name}</span> {SYSTEM_TEXT[m.content] ?? m.content}
          <span className="ml-2 text-xs text-fg-faint">{time(m.createdAt, true)}</span>
        </div>
      </div>
    );
  }

  const actions = () => [
    { label: 'Adicionar reação', onClick: () => setPicker({ x: window.innerWidth / 2 - 160, y: 120 }), hidden: m.pending },
    { label: 'Responder', onClick: () => onReply(m), hidden: m.pending },
    { label: 'Editar mensagem', onClick: () => setEditing(true), hidden: !isMine || m.pending },
    { label: m.pinned ? 'Desafixar mensagem' : 'Fixar mensagem', onClick: () => api(m.pinned ? 'DELETE' : 'PUT', `/channels/${channel.id}/pins/${m.id}`).catch(toastError), hidden: !canPin || m.pending },
    {
      label: 'Criar thread',
      hidden: !channel.serverId || channel.type === 'thread' || !hasPermission(perms, Permissions.CREATE_THREADS) || m.pending,
      onClick: async () => {
        try {
          const t = await api<Channel>('POST', `/channels/${channel.id}/threads`, { name: m.content.slice(0, 60) || 'Thread', messageId: m.id });
          nav(`/channels/${t.serverId}/${t.id}`);
        } catch (e) {
          toastError(e);
        }
      },
    },
    { label: 'Encaminhar', onClick: () => setForward(true), hidden: m.pending },
    { label: 'Salvar mensagem', onClick: () => api('PUT', `/users/@me/saved/${m.id}`).then(() => toast('Mensagem salva'), toastError), hidden: m.pending },
    { label: 'Copiar texto', onClick: () => navigator.clipboard.writeText(m.content) },
    { label: 'Copiar ID da mensagem', onClick: () => navigator.clipboard.writeText(m.id), hidden: m.pending },
    {
      label: 'Excluir mensagem',
      danger: true,
      hidden: (!isMine && !canManage) || m.pending,
      onClick: async () => {
        if (await confirmDialog({ title: 'Excluir mensagem', body: 'Tem certeza de que deseja excluir esta mensagem?', confirm: 'Excluir', danger: true })) deleteMessage(channel.id, m.id).catch(toastError);
      },
    },
  ];

  return (
    <div
      className={clsx(
        'group relative pr-12 [content-visibility:auto] [contain-intrinsic-size:auto_48px]',
        grouped ? 'py-[var(--msg-pad,0.125rem)]' : 'mt-[var(--msg-gap,1rem)] py-[var(--msg-pad,0.125rem)]',
        mentionsMe ? 'border-l-2 border-brand bg-brand/[0.07] hover:bg-brand/[0.1]' : 'hover:bg-line/[0.025]',
        fresh && 'msg-in',
        m.pending && !m.failed && 'opacity-60',
      )}
      onContextMenu={(e) => menu(e, actions())}
      data-message-id={m.id}
    >
      {m.replyTo && (
        <div className="relative mb-1 ml-[72px] flex items-center gap-1 text-sm text-fg-muted before:absolute before:-left-9 before:top-2.5 before:h-2.5 before:w-8 before:rounded-tl before:border-l-2 before:border-t-2 before:border-fg-faint/50">
          <Avatar userId={m.replyTo.author.id} url={m.replyTo.author.avatarUrl} size={16} />
          <span className="font-medium" style={{ color: memberColor(channel.serverId, m.replyTo.author.id) ?? undefined }}>
            @{displayName(m.replyTo.author.id, channel.serverId)}
          </span>
          <span
            className="cursor-pointer truncate hover:text-fg"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && void jumpToMessage(channel.id, m.replyTo!.id)}
            onClick={() => void jumpToMessage(channel.id, m.replyTo!.id)}
          >
            {m.replyTo.content || 'Clique para ver o anexo'}
          </span>
        </div>
      )}
      <div className="flex gap-4 pl-4">
        <div className="w-10 shrink-0">
          {grouped ? (
            <span className="hidden pt-1 text-[11px] text-fg-faint group-hover:block">{time(m.createdAt)}</span>
          ) : (
            <UserPopoutTrigger userId={m.author.id} serverId={channel.serverId}>
              <Avatar userId={m.author.id} url={m.author.avatarUrl} size={40} className="mt-0.5 cursor-pointer" />
            </UserPopoutTrigger>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              <UserPopoutTrigger userId={m.author.id} serverId={channel.serverId}>
                <span className="cursor-pointer font-medium hover:underline" style={{ color: color ?? 'rgb(var(--fg-strong))' }}>
                  {name}
                </span>
              </UserPopoutTrigger>
              <span className="text-xs text-fg-faint">{time(m.createdAt, true)}</span>
            </div>
          )}
          {editing ? (
            <EditBox
              initial={m.content}
              onCancel={() => setEditing(false)}
              onSave={async (content) => {
                setEditing(false);
                if (content.trim() && content !== m.content) await editMessage(channel.id, m.id, content).catch(toastError);
              }}
            />
          ) : (
            m.content && (
              <div className={clsx('whitespace-pre-wrap break-words leading-[1.375rem] text-fg', isJumbo(m.content) && 'text-5xl leading-tight')}>
                {renderMarkdown(m.content, ctx)}
                {m.editedAt && <span className="ml-1 text-[10px] text-fg-faint" title={new Date(m.editedAt).toLocaleString('pt-BR')}>(editado)</span>}
              </div>
            )
          )}
          {m.attachments.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {m.attachments.map((a) => (
                <AttachmentView key={a.id} a={a} />
              ))}
            </div>
          )}
          {m.failed && (
            <div className="mt-1 flex items-center gap-2 text-sm text-danger">
              Falha ao enviar.
              <button className="underline" onClick={() => resend(channel.id, m)}>
                Tentar novamente
              </button>
              <button className="underline" onClick={() => m.nonce && discardPending(channel.id, m.nonce)}>
                Descartar
              </button>
            </div>
          )}
          {m.reactions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.reactions.map((r) => (
                <ReactionChip key={r.emoji} channelId={channel.id} messageId={m.id} emoji={r.emoji} count={r.count} me={r.me} serverId={channel.serverId} />
              ))}
            </div>
          )}
        </div>
      </div>
      {!m.pending && !editing && (
        <div className="absolute -top-4 right-4 z-10 hidden animate-pop overflow-hidden rounded-xl border border-line/[0.08] bg-bg-float p-0.5 shadow-float group-hover:flex">
          <Tooltip label="Adicionar reação">
            <button className="icon-btn" onClick={(e) => setPicker({ x: e.clientX - 320, y: e.clientY + 10 })}>
              <Icon name="smile" size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Responder">
            <button className="icon-btn" onClick={() => onReply(m)}>
              <Icon name="reply" size={18} />
            </button>
          </Tooltip>
          {isMine && (
            <Tooltip label="Editar">
              <button className="icon-btn" onClick={() => setEditing(true)}>
                <Icon name="edit" size={18} />
              </button>
            </Tooltip>
          )}
          {m.content && (
            <Tooltip label="Copiar texto">
              <button
                className="icon-btn"
                aria-label="Copiar texto"
                onClick={() => navigator.clipboard.writeText(m.content).then(() => toast('Texto copiado'), () => toast('Não foi possível copiar', 'error'))}
              >
                <Icon name="copy" size={17} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Mais">
            <button className="icon-btn" onClick={(e) => menu(e, actions())}>
              <Icon name="moreH" size={18} />
            </button>
          </Tooltip>
        </div>
      )}
      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          serverId={channel.serverId}
          onClose={() => setPicker(null)}
          onPick={(emoji) => {
            setPicker(null);
            toggleReaction(channel.id, m.id, emoji).catch(toastError);
          }}
        />
      )}
      {userPop && <UserPopout userId={userPop.id} serverId={channel.serverId} x={userPop.x} y={userPop.y} onClose={() => setUserPop(null)} />}
      {forward && <ForwardModal channelId={channel.id} messageId={m.id} onClose={() => setForward(false)} />}
    </div>
  );
});

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="my-1">
      <textarea
        className="input min-h-[44px] resize-none bg-bg-input"
        value={v}
        autoFocus
        rows={Math.min(10, v.split('\n').length)}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(v);
          }
        }}
      />
      <div className="mt-1 text-xs text-fg-muted">
        Esc para <button className="text-brand hover:underline" onClick={onCancel}>cancelar</button> · Enter para{' '}
        <button className="text-brand hover:underline" onClick={() => onSave(v)}>
          salvar
        </button>
      </div>
    </div>
  );
}

/**
 * Reaction with micro-physics: springs in when it first appears, squashes on press, the counter rolls up/down,
 * and your own reaction gets a short ring burst. Transform/opacity only; reduced motion = plain chip.
 */
function ReactionChip({ channelId, messageId, emoji, count, me, serverId }: { channelId: string; messageId: string; emoji: string; count: number; me: boolean; serverId: string | null }) {
  const custom = emoji.startsWith('custom:') ? (useStore.getState().emojis[serverId ?? '']?.find((e) => e.id === emoji.slice(7)) ?? null) : null;
  const [prev, setPrev] = useState(count);
  const [burst, setBurst] = useState(0);
  const dir = count >= prev ? 1 : -1;
  if (prev !== count) setPrev(count);
  return (
    <motion.button
      layout="position"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.86 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 620, damping: 22, mass: 0.6 }}
      onClick={() => {
        if (!me) setBurst((b) => b + 1);
        toggleReaction(channelId, messageId, emoji).catch(toastError);
      }}
      aria-pressed={me}
      aria-label={`${count} ${count === 1 ? 'reação' : 'reações'} ${custom ? custom.name : emoji}${me ? ', incluindo a sua' : ''}`}
      className={clsx('relative flex h-7 items-center gap-1.5 rounded-lg border px-2 text-sm transition-colors duration-150', me ? 'border-brand/60 bg-brand/15 text-fg-strong' : 'border-line/[0.06] bg-line/[0.05] text-fg-muted hover:border-line/20')}
    >
      {burst > 0 && <motion.span key={burst} aria-hidden className="pointer-events-none absolute inset-0 rounded-lg border-2 border-brand" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 0.45, ease: ease.out }} />}
      {custom ? <img src={custom.url} alt="" className="h-4 w-4 object-contain" /> : <span aria-hidden>{emoji}</span>}
      <span className="relative inline-flex h-4 overflow-hidden text-xs font-semibold tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={count} initial={{ y: dir * 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -dir * 12, opacity: 0 }} transition={{ duration: dur.short, ease: ease.out }}>
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

/**
 * Photos never "print" line by line anymore: the tiny blurred preview shows instantly at the final size,
 * the light thumbnail fades in over it, and the original is only downloaded when the photo is opened.
 */
function ImageAttachment({ a }: { a: Attachment }) {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const [loaded, setLoaded] = useState(false);
  const thumb = useRef<HTMLButtonElement>(null);
  const w = Math.min(400, a.width ?? 400);
  const hRaw = a.width && a.height ? Math.round((a.height / a.width) * w) : undefined;
  const h = hRaw && hRaw > 350 ? 350 : hRaw;
  const wFinal = hRaw && h && hRaw > 350 ? Math.round((w * 350) / hRaw) : w;
  const src = a.thumbUrl ?? a.url;
  return (
    <>
      <button
        ref={thumb}
        type="button"
        onClick={() => thumb.current && setOpen(thumb.current.getBoundingClientRect())}
        aria-label={`Abrir imagem ${a.filename}`}
        className={clsx('group/img relative block cursor-zoom-in overflow-hidden rounded-xl border border-line/[0.06] bg-line/[0.04]', open && !isMobileNow() && 'invisible')}
        style={{ width: wFinal, height: h ?? 220, maxWidth: '100%' }}
      >
        {a.placeholder && (
          <img src={a.placeholder} alt="" aria-hidden className={clsx('absolute inset-0 h-full w-full scale-110 object-cover blur-xl transition-opacity duration-500', loaded && 'opacity-0')} />
        )}
        {!a.placeholder && !loaded && <span className="absolute inset-0 animate-pulse bg-line/[0.06]" />}
        <img
          src={src}
          alt={a.filename}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={clsx('relative h-full w-full object-cover transition-[opacity,transform,filter] duration-500 ease-out group-hover/img:scale-[1.02]', loaded ? 'opacity-100 blur-0' : 'opacity-0 blur-md')}
        />
      </button>
      {open && (isMobileNow() ? <MobileLightbox a={a} src={src} onClose={() => setOpen(null)} /> : <ImageViewer a={a} src={src} from={open} getThumb={() => thumb.current?.getBoundingClientRect() ?? open} onClose={() => setOpen(null)} />)}
    </>
  );
}

/** Phones: the 0.8 lightbox, unchanged (mobile is out of the 1.0 scope). */
function MobileLightbox({ a, src, onClose }: { a: Attachment; src: string; onClose: () => void }) {
  const [fullLoaded, setFullLoaded] = useState(false);
  return (
    <Modal onClose={onClose} className="!max-w-[92vw] bg-transparent shadow-none">
      <div className="relative flex items-center justify-center">
        {!fullLoaded && <img src={src} alt="" aria-hidden className="max-h-[80vh] max-w-full rounded" />}
        <img src={a.url} alt={a.filename} onLoad={() => setFullLoaded(true)} className={clsx('max-h-[80vh] max-w-full rounded', !fullLoaded && 'absolute inset-0 m-auto opacity-0')} />
        {!fullLoaded && <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white/80">carregando original…</span>}
      </div>
      <a href={a.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-fg-muted hover:underline">
        Abrir original ({fmtSize(a.size)})
      </a>
    </Modal>
  );
}

/**
 * Viewer connected to the thumbnail: the picture grows out of it (FLIP with the Web Animations API, transform only)
 * and shrinks back into it when closed. The original is only downloaded here.
 */
function ImageViewer({ a, src, from, getThumb, onClose }: { a: Attachment; src: string; from: DOMRect; getThumb: () => DOMRect; onClose: () => void }) {
  const img = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const closing = useRef(false);
  const ratio = a.width && a.height ? a.width / a.height : from.width / Math.max(1, from.height);
  const maxW = window.innerWidth * 0.92;
  const maxH = window.innerHeight * 0.8;
  const W = Math.round(Math.min(maxW, maxH * ratio, Math.max(from.width, a.width ?? maxW)));
  const H = Math.round(W / ratio);
  const reduce = document.documentElement.dataset.reduceMotion === 'true';
  const flip = (r: DOMRect) => {
    const dx = r.left + r.width / 2 - window.innerWidth / 2;
    const dy = r.top + r.height / 2 - (window.innerHeight / 2 - 14);
    return `translate(${dx}px, ${dy}px) scale(${r.width / W}, ${r.height / H})`;
  };
  useLayoutEffect(() => {
    if (reduce || !img.current) return;
    img.current.animate([{ transform: flip(from), borderRadius: '24px' }, { transform: 'none', borderRadius: '12px' }], { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduce || !img.current) return onClose();
    const back = document.getElementById(`bd-${a.id}`);
    back?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    img.current.animate([{ transform: 'none' }, { transform: flip(getThumb()) }], { duration: 260, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' }).onfinish = onClose;
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" role="dialog" aria-modal aria-label={a.filename} onClick={close}>
      <motion.div id={`bd-${a.id}`} className="absolute inset-0 bg-black/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur.short }} />
      <div ref={img} className="relative overflow-hidden rounded-xl bg-black/40 shadow-float" style={{ width: W, height: H }} onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
        <img src={a.url} alt={a.filename} onLoad={() => setFull(true)} className={clsx('absolute inset-0 h-full w-full object-contain transition-opacity duration-300', full ? 'opacity-100' : 'opacity-0')} />
        {!full && <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white/80">carregando original…</span>}
      </div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: dur.short }} className="relative mt-3 flex items-center gap-3 text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
        <span className="max-w-[40vw] truncate">{a.filename}</span>
        <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-white hover:underline">
          Abrir original ({fmtSize(a.size)})
        </a>
        <button className="rounded-lg bg-white/10 px-3 py-1 font-semibold hover:bg-white/20" onClick={close} autoFocus>
          Fechar
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

export function AttachmentView({ a }: { a: Attachment }) {
  // voice messages first: a WebM voice note is detected as video/webm by its container
  if ((a.contentType.startsWith('audio/') || a.contentType === 'video/webm' || a.contentType === 'video/mp4') && (a.waveform || a.durationMs)) return <VoiceMessage a={a} />;
  if (a.contentType.startsWith('image/')) return <ImageAttachment a={a} />;
  if (a.contentType.startsWith('video/')) return <video src={a.url} controls preload="metadata" className="max-h-[350px] max-w-[min(100%,480px)] rounded-lg bg-black" />;
  if (a.contentType.startsWith('audio/'))
    return (
      <div className="w-full max-w-[420px] rounded-xl border border-line/[0.07] bg-line/[0.03] p-3">
        <div className="mb-2 truncate text-sm text-brand">{a.filename}</div>
        <audio src={a.url} controls className="w-full" preload="metadata" />
      </div>
    );
  return (
    <div className="flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-line/[0.07] bg-line/[0.03] p-3">
      <Icon name="file" size={32} className="text-fg-muted" />
      <div className="min-w-0 flex-1">
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[#4aa8ff] hover:underline" download={a.filename}>
          {a.filename}
        </a>
        <div className="text-xs text-fg-faint">{fmtSize(a.size)}</div>
      </div>
      <a href={a.url} download={a.filename} className="icon-btn" title="Baixar">
        <Icon name="download" />
      </a>
    </div>
  );
}
