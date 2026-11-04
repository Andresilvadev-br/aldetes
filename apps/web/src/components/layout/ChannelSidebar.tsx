import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission, type Channel } from '@aldetes/shared';
import { useStore, channelPermissions, isUnread, get, displayName, useStoreShallow } from '@/store';
import { Icon, type IconName } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { useContextMenu, confirmDialog, toastError, Popover } from '../common/overlay';
import { InviteModal } from '../modals/InviteModal';
import { CreateChannelModal } from '../modals/CreateChannelModal';
import { ServerSettings } from '../settings/ServerSettings';
import { ChannelSettings } from '../settings/ChannelSettings';
import { api } from '@/lib/api';
import { joinVoice, useVoice } from '@/lib/voice';
import { ackChannel } from '@/lib/actions';
import { setPrefs, usePrefs } from '@/lib/prefs';
import { UserPopoutTrigger } from '../common/UserPopout';
import { ServerIcon } from './ServerRail';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';

export const channelIcon = (t: string): IconName =>
  t === 'voice' ? 'speaker' : t === 'announcement' ? 'megaphone' : t === 'forum' ? 'forum' : t === 'thread' ? 'thread' : 'hash';

function useCollapsed(serverId: string) {
  const key = `aldetes.collapsed.${serverId}`;
  const [collapsed, setC] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setC((c) => {
      const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  return [collapsed, toggle] as const;
}

export function ChannelSidebar({ serverId }: { serverId: string }) {
  const server = useStore((s) => s.servers[serverId])!;
  const allChannels = useStore((s) => s.channels);
  const perms = BigInt(server.myPermissions);
  const [menuOpen, setMenuOpen] = useState<{ x: number; y: number } | null>(null);
  const [modal, setModal] = useState<null | { kind: 'invite' } | { kind: 'settings' } | { kind: 'create'; parentId: string | null; type?: Channel['type'] } | { kind: 'channel'; id: string }>(null);
  const [collapsed, toggleCollapsed] = useCollapsed(serverId);
  const [drag, setDrag] = useState<string | null>(null);
  const canManage = hasPermission(perms, Permissions.MANAGE_CHANNELS);
  const favorites = usePrefs((p) => p.favorites);

  const { uncategorized, categories } = useMemo(() => {
    const chans = Object.values(allChannels).filter((c) => c.serverId === serverId && c.type !== 'thread');
    const sort = (a: Channel, b: Channel) => (a.type === 'voice') === (b.type === 'voice') ? a.position - b.position || (a.id < b.id ? -1 : 1) : a.type === 'voice' ? 1 : -1;
    const cats = chans.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position);
    return {
      uncategorized: chans.filter((c) => c.type !== 'category' && !c.parentId).sort(sort),
      categories: cats.map((cat) => ({ cat, children: chans.filter((c) => c.parentId === cat.id).sort(sort) })),
    };
  }, [allChannels, serverId]);

  async function drop(targetId: string) {
    if (!drag || drag === targetId) return;
    const st = get();
    const dragged = st.channels[drag]!;
    const target = st.channels[targetId]!;
    setDrag(null);
    let items: Array<{ id: string; position: number; parentId: string | null }>;
    if (dragged.type === 'category') {
      if (target.type !== 'category') return;
      const cats = categories.map((c) => c.cat).filter((c) => c.id !== drag);
      cats.splice(cats.findIndex((c) => c.id === targetId), 0, dragged);
      items = cats.map((c, i) => ({ id: c.id, position: i, parentId: null }));
    } else {
      const parentId = target.type === 'category' ? target.id : target.parentId;
      const siblings = Object.values(st.channels)
        .filter((c) => c.serverId === serverId && c.type !== 'category' && c.type !== 'thread' && c.parentId === parentId && c.id !== drag)
        .sort((a, b) => a.position - b.position);
      const idx = target.type === 'category' ? siblings.length : siblings.findIndex((c) => c.id === targetId);
      siblings.splice(idx, 0, dragged);
      items = siblings.map((c, i) => ({ id: c.id, position: i, parentId }));
    }
    await api('PATCH', `/servers/${serverId}/channels/reorder`, { items }).catch(toastError);
  }

  const favChannels = favorites.map((id) => allChannels[id]).filter((c): c is Channel => !!c && c.serverId === serverId);

  return (
    <div className="flex h-full flex-col">
      <button
        aria-haspopup="menu"
        className="group relative flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-line/[0.06] px-4 text-left text-fg-strong"
        style={server.bannerUrl ? { background: `linear-gradient(to bottom, rgb(0 0 0 / .25), rgb(var(--bg-side))), center/cover url(${server.bannerUrl})` } : undefined}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuOpen({ x: r.left + 8, y: r.bottom + 4 });
        }}
      >
        {!server.bannerUrl && <span className="haze pointer-events-none absolute inset-0 opacity-80" />}
        <span className="relative">
          <ServerIcon name={server.name} iconUrl={server.iconUrl} size={34} active />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold tracking-tight">{server.name}</span>
          <OnlineCount serverId={serverId} />
        </span>
        <motion.span animate={{ rotate: menuOpen ? 180 : 0 }} transition={spring.snappy} className="relative text-fg-muted group-hover:text-fg-strong">
          <Icon name="chevronDown" size={18} />
        </motion.span>
      </button>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-4 pt-3">
        {favChannels.length > 0 && (
          <div className="mb-3">
            <div className="eyebrow flex items-center gap-1 px-2 pb-1.5"><Icon name="star" size={11} strokeWidth={2.5} /> Favoritos</div>
            {favChannels.map((c) => (
              <ChannelRow key={c.id} channel={c} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
            ))}
          </div>
        )}
        {uncategorized.map((c) => (
          <ChannelRow key={c.id} channel={c} draggable={canManage} onDragStart={() => setDrag(c.id)} onDrop={() => drop(c.id)} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
        ))}
        {categories.map(({ cat, children }) => {
          const isCollapsed = collapsed.includes(cat.id);
          return (
            <div key={cat.id} className="mt-4">
              <div
                className="group flex items-center justify-between pr-1"
                draggable={canManage}
                onDragStart={() => setDrag(cat.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(cat.id)}
              >
                <button className="eyebrow flex flex-1 items-center gap-1 px-1 py-1 transition-colors hover:text-fg-strong" onClick={() => toggleCollapsed(cat.id)}>
                  <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={spring.snappy} className="flex">
                    <Icon name="chevronDown" size={11} strokeWidth={3} />
                  </motion.span>
                  <span className="truncate">{cat.name}</span>
                </button>
                {canManage && (
                  <button className="text-fg-muted opacity-0 hover:text-fg-strong group-hover:opacity-100" title="Criar canal" onClick={() => setModal({ kind: 'create', parentId: cat.id })}>
                    <Icon name="plus" size={16} />
                  </button>
                )}
              </div>
              {children
                .filter((c) => !isCollapsed || c.id === useVoice.getState().channelId || isUnread(c.id))
                .map((c) => (
                  <ChannelRow key={c.id} channel={c} draggable={canManage} onDragStart={() => setDrag(c.id)} onDrop={() => drop(c.id)} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
                ))}
            </div>
          );
        })}
      </div>
      {menuOpen && (
        <Popover x={menuOpen.x} y={menuOpen.y} onClose={() => setMenuOpen(null)}>
          <div className="menu w-[220px]" onClick={() => setMenuOpen(null)}>
            {hasPermission(perms, Permissions.CREATE_INVITE) && (
              <button className="menu-item text-brand" onClick={() => setModal({ kind: 'invite' })}>
                Convidar pessoas <Icon name="users" size={16} />
              </button>
            )}
            {(hasPermission(perms, Permissions.MANAGE_SERVER) || hasPermission(perms, Permissions.MANAGE_ROLES) || hasPermission(perms, Permissions.BAN_MEMBERS) || hasPermission(perms, Permissions.VIEW_AUDIT_LOG)) && (
              <button className="menu-item" onClick={() => setModal({ kind: 'settings' })}>
                Configurações do servidor <Icon name="settings" size={16} />
              </button>
            )}
            {canManage && (
              <>
                <button className="menu-item" onClick={() => setModal({ kind: 'create', parentId: null })}>
                  Criar canal <Icon name="plus" size={16} />
                </button>
                <button className="menu-item" onClick={() => setModal({ kind: 'create', parentId: null, type: 'category' })}>
                  Criar categoria <Icon name="forum" size={16} />
                </button>
              </>
            )}
            <div className="my-1 h-px bg-line/10" />
            <button className="menu-item" onClick={() => Object.values(get().channels).filter((c) => c.serverId === serverId).forEach((c) => ackChannel(c.id))}>
              Marcar como lido <Icon name="check" size={16} />
            </button>
            {server.ownerId !== get().me?.id && (
              <button
                className="menu-item-danger"
                onClick={async () => {
                  if (await confirmDialog({ title: `Sair de '${server.name}'`, body: 'Tem certeza de que deseja sair?', confirm: 'Sair do servidor', danger: true }))
                    api('DELETE', `/servers/${serverId}/members/@me`).catch(toastError);
                }}
              >
                Sair do servidor <Icon name="logout" size={16} />
              </button>
            )}
          </div>
        </Popover>
      )}
      {modal?.kind === 'invite' && <InviteModal serverId={serverId} onClose={() => setModal(null)} />}
      {modal?.kind === 'settings' && <ServerSettings serverId={serverId} onClose={() => setModal(null)} />}
      {modal?.kind === 'create' && <CreateChannelModal serverId={serverId} parentId={modal.parentId} initialType={modal.type} onClose={() => setModal(null)} />}
      {modal?.kind === 'channel' && <ChannelSettings channelId={modal.id} onClose={() => setModal(null)} />}
    </div>
  );
}

function ChannelRow({
  channel,
  draggable,
  onDragStart,
  onDrop,
  onSettings,
  onInvite,
}: {
  channel: Channel;
  draggable?: boolean;
  onDragStart?: () => void;
  onDrop?: () => void;
  onSettings: () => void;
  onInvite: () => void;
}) {
  const { channelId } = useParams();
  const nav = useNavigate();
  const menu = useContextMenu();
  const active = channelId === channel.id;
  const unread = useStore(() => isUnread(channel.id));
  const mentions = useStore((s) => s.readStates[channel.id]?.mentionCount ?? 0);
  const perms = channelPermissions(channel.id);
  const canManage = hasPermission(perms, Permissions.MANAGE_CHANNELS);
  const voiceChannel = useVoice((v) => v.channelId);
  const favorites = usePrefs((p) => p.favorites);
  const isVoice = channel.type === 'voice';
  const isPrivate = channel.overwrites.some((o) => o.targetType === 'role' && (BigInt(o.deny) & Permissions.VIEW_CHANNEL) !== 0n);

  const open = () => {
    if (isVoice) {
      if (!hasPermission(perms, Permissions.CONNECT)) return;
      if (voiceChannel !== channel.id) void joinVoice(channel.id);
    }
    nav(`/channels/${channel.serverId}/${channel.id}`);
  };

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        onContextMenu={(e) =>
          menu(e, [
            { label: 'Marcar como lido', onClick: () => ackChannel(channel.id), hidden: isVoice },
            {
              label: favorites.includes(channel.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
              onClick: () => setPrefs({ favorites: favorites.includes(channel.id) ? favorites.filter((f) => f !== channel.id) : [...favorites, channel.id] }),
            },
            { label: 'Convidar pessoas', onClick: onInvite, hidden: !hasPermission(perms, Permissions.CREATE_INVITE) },
            { label: 'Editar canal', onClick: onSettings, hidden: !canManage && !hasPermission(perms, Permissions.MANAGE_ROLES) },
            { label: 'Copiar ID do canal', onClick: () => navigator.clipboard.writeText(channel.id) },
            {
              label: 'Excluir canal',
              danger: true,
              hidden: !canManage,
              onClick: async () => {
                if (await confirmDialog({ title: 'Excluir canal', body: <>Tem certeza de que deseja excluir <b>#{channel.name}</b>? Isso não pode ser desfeito.</>, confirm: 'Excluir canal', danger: true }))
                  api('DELETE', `/channels/${channel.id}`).catch(toastError);
              },
            },
          ])
        }
        data-glow
        className={clsx(
          'group relative mt-0.5 flex h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 transition-colors duration-150 active:scale-[0.985]',
          active ? 'text-fg-strong' : unread && !isVoice ? 'text-fg-strong hover:bg-line/[0.05]' : 'text-fg-faint hover:bg-line/[0.05] hover:text-fg',
        )}
      >
        {active && (
          <motion.span layoutId="channel-active" transition={spring.responsive} className="nav-active absolute inset-0 -z-10 rounded-xl border">
            <span className="grad absolute -left-px top-2 bottom-2 w-[3px] rounded-full" />
          </motion.span>
        )}
        {unread && !active && !isVoice && <span className="absolute -left-2 h-2 w-1 rounded-r bg-fg-strong" />}
        <span className={clsx('relative', active && 'text-brand')}>
          <Icon name={channelIcon(channel.type)} size={18} />
          {isPrivate && <Icon name="lock" size={9} strokeWidth={3} className="absolute -bottom-0.5 -right-1 rounded bg-bg-side" />}
        </span>
        <span className={clsx('flex-1 truncate', unread && !isVoice && 'font-semibold')}>{channel.name}</span>
        {mentions > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-[18px] text-white shadow-[0_0_12px_rgb(var(--danger)/0.5)]">{mentions}</span>}
        <span className="hidden items-center gap-1 group-hover:flex">
          {hasPermission(perms, Permissions.CREATE_INVITE) && (
            <button
              title="Criar convite"
              onClick={(e) => {
                e.stopPropagation();
                onInvite();
              }}
              className="hover:text-fg-strong"
            >
              <Icon name="users" size={15} />
            </button>
          )}
          {(canManage || hasPermission(perms, Permissions.MANAGE_ROLES)) && (
            <button
              title="Editar canal"
              onClick={(e) => {
                e.stopPropagation();
                onSettings();
              }}
              className="hover:text-fg-strong"
            >
              <Icon name="settings" size={15} />
            </button>
          )}
        </span>
      </div>
      {isVoice && <VoiceMembers channelId={channel.id} serverId={channel.serverId!} />}
    </div>
  );
}

function OnlineCount({ serverId }: { serverId: string }) {
  const n = useStore((s) => Object.keys(s.members[serverId] ?? {}).filter((u) => (s.presences[u]?.status ?? 'offline') !== 'offline').length);
  const total = useStore((s) => Object.keys(s.members[serverId] ?? {}).length);
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_rgb(var(--ok))]" />
      {n} online · {total} membros
    </span>
  );
}

const NO_SPEAKERS: Record<string, boolean> = {};

function VoiceMembers({ channelId, serverId }: { channelId: string; serverId: string }) {
  const states = useStoreShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channelId));
  const speaking = useVoice((v) => (v.channelId === channelId ? v.speaking : NO_SPEAKERS));
  if (!states.length) return null;
  return (
    <div className="mb-1 ml-6">
      {states.map((v) => (
        <UserPopoutTrigger key={v.userId} userId={v.userId} serverId={serverId}>
          <div className="group flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-fg-muted transition-colors hover:bg-line/[0.05] hover:text-fg">
            <span className={clsx('rounded-full', !!speaking[v.userId] && !v.selfMute && !v.serverMute && 'speaking')}><Avatar userId={v.userId} size={24} /></span>
            <span className="flex-1 truncate text-sm">{displayName(v.userId, serverId)}</span>
            {v.streaming && <span className="rounded bg-danger px-1 text-[10px] font-bold text-white">AO VIVO</span>}
            {v.video && <Icon name="camera" size={14} />}
            {(v.selfMute || v.serverMute) && <Icon name="micOff" size={14} className={v.serverMute ? 'text-danger' : ''} />}
            {(v.selfDeaf || v.serverDeaf) && <Icon name="headphonesOff" size={14} className={v.serverDeaf ? 'text-danger' : ''} />}
          </div>
        </UserPopoutTrigger>
      ))}
    </div>
  );
}
