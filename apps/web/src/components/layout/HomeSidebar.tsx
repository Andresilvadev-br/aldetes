import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useStore, useStoreShallow, isUnread } from '@/store';
import { usePrefs, setPrefs, togglePinDm } from '@/lib/prefs';
import { useVoice } from '@/lib/voice';
import { openDm } from '@/lib/actions';
import { activityLine } from '@/lib/activity';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { api } from '@/lib/api';
import { toastError, useContextMenu } from '../common/overlay';
import { CreateGroupModal } from '../modals/CreateGroupModal';
import { isMobileNow, openContent, useIsMobile } from '@/lib/mobile';
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
  const mobile = useIsMobile();
  const pinned = usePrefs((p) => p.pinnedDms);
  const filter = usePrefs((p) => p.dmFilter);
  const unreadSet = useStoreShallow((s) => s.dmIds.filter((id) => isUnread(id)));
  const unreadCount = unreadSet.length;
  // pinned first (in pin order), then the rest by recency; on phones the 0.8 list is kept as is
  const shown = useMemo(() => {
    if (mobile) return dmIds;
    const pins = pinned.filter((id) => dmIds.includes(id));
    const rest = dmIds.filter((id) => !pins.includes(id));
    const all = [...pins, ...rest];
    return filter === 'unread' ? all.filter((id) => unreadSet.includes(id)) : filter === 'pinned' ? pins : all;
  }, [mobile, dmIds, pinned, filter, unreadSet]);
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-line/[0.06] px-4 phone:hidden">
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
          onClick={() => (isMobileNow() ? openContent('/channels/@me') : nav('/channels/@me'))}
        >
          <Icon name="users" />
          <span className="flex-1 text-left">Amigos</span>
          {pending > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pending}</span>}
        </button>
        <LiveFriends />
        <div className="eyebrow mt-4 flex items-center justify-between px-2 pb-1.5">
          <span>Mensagens diretas</span>
          <button className="tap hover:text-fg-strong" title="Criar DM em grupo" aria-label="Criar DM em grupo" onClick={() => setGroup(true)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        {!mobile && (
          <div className="mb-1.5 flex gap-1 px-1" role="tablist" aria-label="Filtrar conversas">
            {(
              [
                ['all', 'Todas'],
                ['unread', `Não lidas${unreadCount ? ` · ${unreadCount}` : ''}`],
                ['pinned', 'Fixadas'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={filter === v} onClick={() => setPrefs({ dmFilter: v })} className={clsx('relative rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors', filter === v ? 'text-fg-strong' : 'text-fg-faint hover:text-fg')}>
                {filter === v && <motion.span layoutId="dm-filter" transition={spring.responsive} className="absolute inset-0 rounded-lg bg-line/[0.08]" />}
                <span className="relative">{l}</span>
              </button>
            ))}
          </div>
        )}
        {shown.map((id) => (
          <DmRow key={id} channelId={id} pinned={pinned.includes(id)} />
        ))}
        {!shown.length && (
          <p className="px-2 py-4 text-center text-xs text-fg-faint">
            {!dmIds.length ? 'Suas conversas aparecerão aqui.' : filter === 'unread' ? 'Tudo lido por aqui.' : 'Nenhuma conversa fixada. Clique com o botão direito numa DM para fixar.'}
          </p>
        )}
      </div>
      {group && <CreateGroupModal onClose={() => setGroup(false)} />}
      {switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}
    </div>
  );
}

/** Friends in a call or a game right now (real presence; offline/invisible people are never listed). */
function LiveFriends() {
  const nav = useNavigate();
  const myCall = useVoice((v) => (v.state === 'connected' ? v.channelId : null));
  const myCallIsServer = useStore((s) => !!(myCall && s.channels[myCall]?.serverId));
  const ids = useStoreShallow((s) =>
    Object.values(s.relationships)
      .filter((r) => r.type === 'friend' && (s.presences[r.userId]?.status ?? 'offline') !== 'offline' && (s.voiceStates[r.userId] || s.presences[r.userId]?.activity))
      .map((r) => r.userId)
      .slice(0, 6),
  );
  if (!ids.length || isMobileNow()) return null;
  return (
    <div className="mt-4">
      <div className="eyebrow px-2 pb-1.5">Agora</div>
      {ids.map((uid) => (
        <LiveFriendRow key={uid} userId={uid} canInvite={!!myCall && myCallIsServer} myCall={myCall} onOpen={async () => nav(`/channels/@me/${await openDm(uid)}`)} />
      ))}
    </div>
  );
}

function LiveFriendRow({ userId, canInvite, myCall, onOpen }: { userId: string; canInvite: boolean; myCall: string | null; onOpen: () => void }) {
  const user = useStore((s) => s.users[userId] ?? s.relationships[userId]?.user);
  const act = useStore((s) => s.presences[userId]?.activity);
  const voice = useStoreShallow((s) => {
    const v = s.voiceStates[userId];
    const c = v ? s.channels[v.channelId] : undefined;
    return v ? { id: v.channelId, name: c ? (c.serverId ? c.name : 'chamada privada') : 'uma call', same: v.channelId === myCall } : null;
  });
  const [sent, setSent] = useState(false);
  if (!user) return null;
  const invite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api('POST', `/voice/${myCall}/invite`, { userId });
      setSent(true);
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} data-glow className="group flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2 text-fg-muted transition-colors hover:bg-line/[0.05] hover:text-fg">
      <Avatar userId={userId} size={30} showStatus />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-fg">{user.displayName}</span>
        <span className={clsx('block truncate text-[11px]', voice ? 'text-ok' : 'text-fg-faint')}>{voice ? `Em ${voice.name}` : activityLine(act)}</span>
      </span>
      {canInvite && !voice?.same && (
        <button className="rounded-lg bg-line/[0.07] px-2 py-1 text-[11px] font-bold text-fg-muted opacity-0 transition-opacity hover:text-fg-strong focus:opacity-100 group-hover:opacity-100 disabled:opacity-60" disabled={sent} onClick={(e) => void invite(e)} aria-label={`Chamar ${user.displayName} para a sua call`}>
          {sent ? 'Chamado' : 'Chamar'}
        </button>
      )}
    </div>
  );
}

function DmRow({ channelId, pinned }: { channelId: string; pinned?: boolean }) {
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
      onClick={() => (isMobileNow() ? openContent(`/channels/@me/${channelId}`) : nav(`/channels/@me/${channelId}`))}
      onContextMenu={(e) =>
        menu(e, [
          { label: pinned ? 'Desafixar conversa' : 'Fixar conversa', onClick: () => togglePinDm(channelId), hidden: isMobileNow() },
          { label: c.type === 'group_dm' ? 'Sair do grupo' : 'Fechar DM', onClick: close, danger: c.type === 'group_dm' },
          { label: 'Copiar ID', onClick: () => navigator.clipboard.writeText(channelId) },
        ])
      }
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
      {pinned && <Icon name="pin" size={13} className="text-fg-faint" aria-label="Fixada" />}
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
