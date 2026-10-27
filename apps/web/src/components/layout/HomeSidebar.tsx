import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useStore } from '@/store';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { api } from '@/lib/api';
import { toastError, useContextMenu } from '../common/overlay';
import { CreateGroupModal } from '../modals/CreateGroupModal';
import { QuickSwitcher } from '../modals/QuickSwitcher';

export function dmName(c: { type: string; name: string; recipients?: { displayName: string }[] }) {
  if (c.type === 'group_dm') return c.name || c.recipients?.map((r) => r.displayName).join(', ') || 'Grupo vazio';
  return c.recipients?.[0]?.displayName ?? 'Mensagem direta';
}

export function HomeSidebar() {
  const dmIds = useStore((s) => s.dmIds);
  const nav = useNavigate();
  const loc = useLocation();
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
  const [group, setGroup] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-2.5 shadow-sm">
        <button className="h-7 w-full truncate rounded bg-bg-rail px-2 text-left text-[13px] text-fg-muted" onClick={() => setSwitcher(true)}>
          Encontre ou comece uma conversa
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
        <button
          className={clsx('flex h-10 w-full items-center gap-3 rounded px-3 font-medium', loc.pathname === '/channels/@me' ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10 hover:text-fg')}
          onClick={() => nav('/channels/@me')}
        >
          <Icon name="users" />
          <span className="flex-1 text-left">Amigos</span>
          {pending > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pending}</span>}
        </button>
        <div className="mt-4 flex items-center justify-between px-2 pb-1 text-xs font-semibold uppercase text-fg-muted">
          <span>Mensagens diretas</span>
          <button className="hover:text-fg-strong" title="Criar DM em grupo" onClick={() => setGroup(true)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        {dmIds.map((id) => (
          <DmRow key={id} channelId={id} />
        ))}
        {!dmIds.length && <p className="px-2 py-4 text-center text-xs text-fg-faint">Suas conversas aparecerão aqui.</p>}
      </div>
      {group && <CreateGroupModal onClose={() => setGroup(false)} />}
      {switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}
    </div>
  );
}

function DmRow({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId]);
  const { channelId: active } = useParams();
  const nav = useNavigate();
  const menu = useContextMenu();
  const mentions = useStore((s) => s.readStates[channelId]?.mentionCount ?? 0);
  const inCall = useStore((s) => Object.values(s.voiceStates).some((v) => v.channelId === channelId));
  if (!c) return null;
  const other = c.recipients?.[0];
  const close = () => {
    api('DELETE', `/channels/${channelId}`).catch(toastError);
    if (active === channelId) nav('/channels/@me');
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nav(`/channels/@me/${channelId}`)}
      onContextMenu={(e) => menu(e, [{ label: c.type === 'group_dm' ? 'Sair do grupo' : 'Fechar DM', onClick: close, danger: c.type === 'group_dm' }, { label: 'Copiar ID', onClick: () => navigator.clipboard.writeText(channelId) }])}
      className={clsx('group mt-0.5 flex h-11 cursor-pointer items-center gap-3 rounded px-2', active === channelId ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10 hover:text-fg')}
    >
      {c.type === 'group_dm' ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
          <Icon name="users" size={18} />
        </div>
      ) : (
        <Avatar userId={other?.id ?? ''} size={32} showStatus />
      )}
      <div className="min-w-0 flex-1">
        <div className={clsx('truncate', mentions > 0 && 'font-semibold text-fg-strong')}>{dmName(c)}</div>
        {c.type === 'group_dm' && <div className="truncate text-xs text-fg-faint">{(c.recipients?.length ?? 0) + 1} membros</div>}
      </div>
      {inCall && <Icon name="speaker" size={16} className="text-ok" />}
      {mentions > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{mentions}</span>}
      <button
        className="hidden text-fg-muted hover:text-fg-strong group-hover:block"
        title="Fechar"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
