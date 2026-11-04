import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useStore } from '@/store';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { api } from '@/lib/api';
import { toastError, useContextMenu } from '../common/overlay';
import { CreateGroupModal } from '../modals/CreateGroupModal';
import { showContent } from '@/lib/mobile';
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
      <div className="relative flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-line/[0.06] px-4">
        <span className="haze pointer-events-none absolute inset-0 opacity-80" />
        <span className="tile grad relative text-white shadow-glow">
          <Icon name="at" size={18} />
        </span>
        <span className="relative min-w-0">
          <span className="block text-[15px] font-extrabold tracking-tight text-fg-strong">Conversas</span>
          <button className="text-[11px] font-medium text-fg-muted hover:text-fg-strong" onClick={() => setSwitcher(true)}>
            Buscar conversa · Ctrl K
          </button>
        </span>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
        <button
          data-glow
          className={clsx('relative flex h-10 w-full items-center gap-3 rounded-xl border border-transparent px-3 font-semibold transition-colors', loc.pathname === '/channels/@me' ? 'nav-active' : 'text-fg-muted hover:bg-line/[0.05] hover:text-fg')}
          onClick={() => (nav('/channels/@me'), showContent())}
        >
          <Icon name="users" />
          <span className="flex-1 text-left">Amigos</span>
          {pending > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pending}</span>}
        </button>
        <div className="eyebrow mt-5 flex items-center justify-between px-2 pb-1.5">
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
      onClick={() => (nav(`/channels/@me/${channelId}`), showContent())}
      onContextMenu={(e) => menu(e, [{ label: c.type === 'group_dm' ? 'Sair do grupo' : 'Fechar DM', onClick: close, danger: c.type === 'group_dm' }, { label: 'Copiar ID', onClick: () => navigator.clipboard.writeText(channelId) }])}
      data-glow
      className={clsx('group relative mt-0.5 flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2 transition-colors', active === channelId ? 'nav-active' : 'text-fg-muted hover:bg-line/[0.05] hover:text-fg')}
    >
      {c.type === 'group_dm' ? (
        <div className="grad flex h-8 w-8 items-center justify-center rounded-full text-white">
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
