import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission, type Attachment, type Channel, type Message } from '@aldetes/shared';
import { useStore, channelPermissions, memberColor, displayName, get, type ClientMessage } from '@/store';
import { renderMarkdown, isJumbo } from '@/lib/markdown';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { UserPopout, UserPopoutTrigger } from '../common/UserPopout';
import { Tooltip, useContextMenu, confirmDialog, toastError, toast, Modal } from '../common/overlay';
import { EmojiPicker } from './EmojiPicker';
import { deleteMessage, editMessage, toggleReaction, resend, discardPending } from '@/lib/actions';
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
        grouped ? 'py-0.5' : 'mt-4 py-0.5',
        mentionsMe ? 'border-l-2 border-mention bg-mention/10 hover:bg-mention/[.13]' : 'hover:bg-fg/[.03]',
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
            onClick={() => document.querySelector(`[data-message-id="${m.replyTo!.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
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
        <div className="absolute -top-4 right-4 z-10 hidden overflow-hidden rounded-md bg-bg-main shadow ring-1 ring-black/20 group-hover:flex">
          <Tooltip label="Adicionar reação">
            <button className="icon-btn rounded-none" onClick={(e) => setPicker({ x: e.clientX - 320, y: e.clientY + 10 })}>
              <Icon name="smile" size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Responder">
            <button className="icon-btn rounded-none" onClick={() => onReply(m)}>
              <Icon name="reply" size={18} />
            </button>
          </Tooltip>
          {isMine && (
            <Tooltip label="Editar">
              <button className="icon-btn rounded-none" onClick={() => setEditing(true)}>
                <Icon name="edit" size={18} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Mais">
            <button className="icon-btn rounded-none" onClick={(e) => menu(e, actions())}>
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

function ReactionChip({ channelId, messageId, emoji, count, me, serverId }: { channelId: string; messageId: string; emoji: string; count: number; me: boolean; serverId: string | null }) {
  const custom = emoji.startsWith('custom:') ? (useStore.getState().emojis[serverId ?? '']?.find((e) => e.id === emoji.slice(7)) ?? null) : null;
  return (
    <button
      onClick={() => toggleReaction(channelId, messageId, emoji).catch(toastError)}
      className={clsx('flex h-6 items-center gap-1 rounded-md border px-1.5 text-sm transition-colors', me ? 'border-brand bg-brand/20 text-fg-strong' : 'border-transparent bg-fg/10 text-fg-muted hover:border-fg-faint')}
    >
      {custom ? <img src={custom.url} alt={custom.name} className="h-4 w-4 object-contain" /> : <span>{emoji}</span>}
      <span className="text-xs font-semibold">{count}</span>
    </button>
  );
}

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export function AttachmentView({ a }: { a: Attachment }) {
  const [lightbox, setLightbox] = useState(false);
  if (a.contentType.startsWith('image/')) {
    const w = Math.min(400, a.width ?? 400);
    const h = a.width && a.height ? Math.round((a.height / a.width) * w) : undefined;
    return (
      <>
        <img
          src={a.url}
          alt={a.filename}
          loading="lazy"
          onClick={() => setLightbox(true)}
          className="max-h-[350px] cursor-zoom-in rounded-lg object-contain"
          style={{ width: w, height: h && h > 350 ? 350 : h, maxWidth: '100%' }}
        />
        {lightbox && (
          <Modal onClose={() => setLightbox(false)} className="!max-w-[90vw] bg-transparent shadow-none">
            <img src={a.url} alt={a.filename} className="max-h-[80vh] max-w-full rounded" />
            <a href={a.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-fg-muted hover:underline">
              Abrir original
            </a>
          </Modal>
        )}
      </>
    );
  }
  if (a.contentType.startsWith('video/')) return <video src={a.url} controls preload="metadata" className="max-h-[350px] max-w-[min(100%,480px)] rounded-lg bg-black" />;
  if (a.contentType.startsWith('audio/'))
    return (
      <div className="w-full max-w-[420px] rounded-lg border border-black/20 bg-bg-side p-3">
        <div className="mb-2 truncate text-sm text-brand">{a.filename}</div>
        <audio src={a.url} controls className="w-full" preload="metadata" />
      </div>
    );
  return (
    <div className="flex w-full max-w-[420px] items-center gap-3 rounded-lg border border-black/20 bg-bg-side p-3">
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
