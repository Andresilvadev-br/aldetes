import { useMemo, useState, lazy, Suspense, useRef, useLayoutEffect, useEffect } from 'react';
import { ServerCover, IconFrame, themeOf, useServerEffects, usePlainServers } from '../studio/ServerScene';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission, type Channel } from '@aldetes/shared';
import { useStore, channelPermissions, isUnread, get, displayName, useStoreShallow } from '@/store';
import { Icon, type IconName } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { useContextMenu, confirmDialog, toastError, Popover } from '../common/overlay';
import { InviteModal } from '../modals/InviteModal';
import { CreateChannelModal } from '../modals/CreateChannelModal';
const ServerSettings = lazy(() => import('../settings/ServerSettings').then((m) => ({ default: m.ServerSettings })));
const ChannelSettings = lazy(() => import('../settings/ChannelSettings').then((m) => ({ default: m.ChannelSettings })));
import { api } from '@/lib/api';
import { joinVoice, useVoice, focusStream } from '@/lib/voice';
import { ackChannel } from '@/lib/actions';
import { setPrefs, usePrefs } from '@/lib/prefs';
import { UserPopoutTrigger } from '../common/UserPopout';
import { ServerIcon, lastRailRect } from './ServerRail';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { spring } from '@/lib/motion';
import { isMobileNow, openContent } from '@/lib/mobile';

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

  usePlainServers();
  const theme = themeOf(server);
  const effects = useServerEffects();
  // Signature entrance: short, only when the server is opened from the rail, never blocks anything
  const [entrance, setEntrance] = useState(0);
  useEffect(() => {
    if (theme.entrance !== 'none' && effects && lastRailRect?.serverId === serverId && performance.now() - lastRailRect.at < 700) setEntrance((e) => e + 1);
  }, [serverId]);

  // Shared transition: the icon clicked in the rail "flies" into this header (FLIP, transform only, ~300 ms).
  const headerIcon = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const from = lastRailRect;
    const el = headerIcon.current;
    if (!el || !from || from.serverId !== serverId || performance.now() - from.at > 700 || document.documentElement.dataset.reduceMotion === 'true') return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    const dx = from.rect.left + from.rect.width / 2 - (to.left + to.width / 2);
    const dy = from.rect.top + from.rect.height / 2 - (to.top + to.height / 2);
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.rect.width / to.width})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [serverId]);

  const favChannels = favorites.map((id) => allChannels[id]).filter((c): c is Channel => !!c && c.serverId === serverId);

  const canInvite = hasPermission(perms, Permissions.CREATE_INVITE);
  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuOpen({ x: r.left + 8, y: r.bottom + 4 });
  };

  return (
    <div
      className="flex h-full flex-col"
      data-sep={theme.separator}
      style={{
        ...(theme.accent ? ({ '--sa': theme.accent } as React.CSSProperties) : {}),
        // Worlds surfaces: a tint/darkening of the column behind the channel list (text contrast is preserved)
        ...(theme.surface === 'deep' ? { background: 'linear-gradient(rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.18))' } : theme.surface === 'tinted' && theme.accent ? { background: `linear-gradient(180deg, ${theme.accent}14, transparent 60%)` } : {}),
      }}
    >
      {/* hero header: Server Studio cover (scene › banner image/video › accent aurora), big icon, name, live online count */}
      <div className="cz-hover relative shrink-0 overflow-hidden" data-testid="server-header">
        <ServerCover server={server} theme={theme} />
        {entrance && <span key={entrance} className={`studio-entr studio-entr-${theme.entrance}`} aria-hidden />}
        <button aria-haspopup="menu" aria-label="Menu do servidor" onClick={openMenu} className={clsx('group relative flex w-full items-end gap-3 px-4 pb-3 pt-7 text-left text-fg-strong', theme.iconPosition === 'center' && 'flex-col items-center text-center')}>
          <motion.span ref={headerIcon} whileHover={{ rotate: -6, scale: 1.06 }} transition={spring.snappy} className="rounded-[18px] shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] ring-2 ring-bg-side">
            <IconFrame frame={theme.iconFrame} accent={theme.accent}>
              <ServerIcon name={server.name} iconUrl={server.iconUrl} size={46} active />
            </IconFrame>
          </motion.span>
          <span className="min-w-0 flex-1 pb-0.5">
            <span className="block truncate text-[17px] font-black leading-tight tracking-tight drop-shadow">{server.name}</span>
            <OnlineCount serverId={serverId} />
          </span>
          <motion.span
            animate={{ rotate: menuOpen ? 180 : 0 }}
            transition={spring.snappy}
            className="mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-line/10 bg-black/30 text-fg-muted backdrop-blur transition-colors group-hover:bg-black/50 group-hover:text-fg-strong"
          >
            <Icon name="chevronDown" size={17} />
          </motion.span>
        </button>
        {canInvite && (
          <div className="relative px-3 pb-3">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              onClick={() => setModal({ kind: 'invite' })}
              className="group flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-brand/30 bg-brand/10 text-[13px] font-bold text-fg-strong transition-colors hover:bg-brand/20"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/10 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100" />
              <Icon name="users" size={16} className="text-brand" /> Convidar amigos
            </motion.button>
          </div>
        )}
      </div>
      <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-line/10 to-transparent" />

      <motion.div key={serverId} variants={listV} initial="hidden" animate="show" className="scroll-thin flex-1 overflow-y-auto px-2 pb-4 pt-2">
        <WelcomeCard serverId={serverId} theme={theme} />
        {favChannels.length > 0 && (
          <motion.div variants={itemV} className="mb-2">
            <CategoryHeader label="Favoritos" icon="star" count={favChannels.length} />
            {favChannels.map((c) => (
              <ChannelRow key={c.id} channel={c} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
            ))}
          </motion.div>
        )}
        {uncategorized.map((c) => (
          <motion.div key={c.id} variants={itemV}>
            <ChannelRow channel={c} draggable={canManage} onDragStart={() => setDrag(c.id)} onDrop={() => drop(c.id)} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
          </motion.div>
        ))}
        {categories.map(({ cat, children }) => {
          const isCollapsed = collapsed.includes(cat.id);
          const shown = children.filter((c) => !isCollapsed || c.id === useVoice.getState().channelId || isUnread(c.id));
          return (
            <motion.div key={cat.id} variants={itemV} className="mt-3">
              <div draggable={canManage} onDragStart={() => setDrag(cat.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(cat.id)}>
                <CategoryHeader
                  label={cat.name}
                  count={children.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggleCollapsed(cat.id)}
                  onAdd={canManage ? () => setModal({ kind: 'create', parentId: cat.id }) : undefined}
                />
              </div>
              <AnimatePresence initial={false}>
                {shown.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={spring.gentle}
                    className="overflow-hidden"
                  >
                    <ChannelRow channel={c} draggable={canManage} onDragStart={() => setDrag(c.id)} onDrop={() => drop(c.id)} onSettings={() => setModal({ kind: 'channel', id: c.id })} onInvite={() => setModal({ kind: 'invite' })} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
      {menuOpen && (
        <Popover x={menuOpen.x} y={menuOpen.y} onClose={() => setMenuOpen(null)}>
          <div className="menu w-[220px]" onClick={() => setMenuOpen(null)}>
            {canInvite && (
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
      {modal?.kind === 'settings' && <Suspense fallback={null}><ServerSettings serverId={serverId} onClose={() => setModal(null)} /></Suspense>}
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
    const path = `/channels/${channel.serverId}/${channel.id}`;
    if (isMobileNow()) openContent(path);
    else nav(path);
  };

  const onContextMenu = (e: React.MouseEvent) =>
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
    ]);

  const tools = (
    <span className="hidden items-center gap-0.5 group-hover:flex">
      {hasPermission(perms, Permissions.CREATE_INVITE) && (
        <button
          title="Criar convite"
          onClick={(e) => {
            e.stopPropagation();
            onInvite();
          }}
          className="rounded-md p-1 hover:bg-line/10 hover:text-fg-strong"
        >
          <Icon name="users" size={14} />
        </button>
      )}
      {(canManage || hasPermission(perms, Permissions.MANAGE_ROLES)) && (
        <button
          title="Editar canal"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
          className="rounded-md p-1 hover:bg-line/10 hover:text-fg-strong"
        >
          <Icon name="settings" size={14} />
        </button>
      )}
    </span>
  );

  if (isVoice)
    return (
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <VoiceRoom channel={channel} active={active} canConnect={hasPermission(perms, Permissions.CONNECT)} isPrivate={isPrivate} draggable={draggable} onDragStart={onDragStart} onOpen={open} onContextMenu={onContextMenu} tools={tools} />
      </div>
    );

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <motion.div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        onContextMenu={onContextMenu}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        transition={spring.snappy}
        data-glow
        className={clsx(
          'group relative mt-0.5 flex h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-150',
          active ? 'text-fg-strong' : unread ? 'text-fg-strong hover:bg-line/[0.05]' : 'text-fg-faint hover:bg-line/[0.05] hover:text-fg',
        )}
      >
        {active && (
          <motion.span layoutId="channel-active" transition={spring.responsive} className="nav-active absolute inset-0 -z-10 rounded-xl border">
            <span className="grad absolute -left-px bottom-2 top-2 w-[3px] rounded-full" />
          </motion.span>
        )}
        {unread && !active && <motion.span layoutId={`unread-${channel.id}`} className="absolute -left-2 h-2.5 w-1 rounded-r-full bg-fg-strong shadow-[0_0_8px_rgb(var(--fg-strong)/0.8)]" />}
        <span
          className={clsx(
            'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
            active ? 'grad text-white shadow-glow' : 'bg-line/[0.05] group-hover:bg-line/[0.09]',
          )}
        >
          <Icon name={channelIcon(channel.type)} size={15} strokeWidth={active ? 2.5 : 2} />
          {isPrivate && <Icon name="lock" size={9} strokeWidth={3} className="absolute -bottom-1 -right-1 rounded bg-bg-side p-px" />}
        </span>
        <span className={clsx('flex-1 truncate text-[14.5px]', (unread || active) && 'font-semibold')}>{channel.name}</span>
        {mentions > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy} className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-[18px] text-white shadow-[0_0_12px_rgb(var(--danger)/0.5)]">
            {mentions}
          </motion.span>
        )}
        {tools}
      </motion.div>
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

const listV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const itemV: Variants = { hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: spring.gentle } };

/**
 * Server Studio welcome scene: shown on a person's first visit to the server, inside the channel list (never a
 * blocking modal), dismissible, remembered per user and server on this device.
 */
function WelcomeCard({ serverId, theme }: { serverId: string; theme: ReturnType<typeof themeOf> }) {
  const me = useStore((s) => s.me?.id);
  const key = `aldetes.welcomed.${me}.${serverId}`;
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return true;
    }
  });
  if (!theme.welcome.enabled || seen || !theme.welcome.title) return null;
  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    setSeen(true);
  };
  return (
    <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.gentle} className="relative mb-2 overflow-hidden rounded-2xl border border-line/[0.08] p-3" style={{ background: `linear-gradient(135deg, ${theme.accent ?? 'rgb(var(--brand))'}33, transparent 70%)` }} role="note" aria-label="Boas-vindas do servidor">
      <button className="absolute right-1.5 top-1.5 rounded-md p-1 text-fg-faint hover:text-fg-strong" aria-label="Fechar boas-vindas" onClick={close}>
        <Icon name="x" size={14} />
      </button>
      <div className="pr-5 text-[13px] font-extrabold text-fg-strong">{theme.welcome.title}</div>
      {theme.welcome.body && <p className="mt-0.5 text-[12px] text-fg-muted">{theme.welcome.body}</p>}
      <button className="mt-2 text-[12px] font-bold text-brand hover:underline" onClick={close}>
        Bora!
      </button>
    </motion.div>
  );
}

function CategoryHeader({ label, count, collapsed, onToggle, onAdd, icon }: { label: string; count: number; collapsed?: boolean; onToggle?: () => void; onAdd?: () => void; icon?: IconName }) {
  return (
    <div className="group flex items-center gap-1 pb-1 pl-1 pr-1">
      <button className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[11px] font-black uppercase phone:min-h-[40px] tracking-[0.14em] text-fg-faint transition-colors hover:text-fg-strong" onClick={onToggle}>
        {icon ? (
          <Icon name={icon} size={11} strokeWidth={2.5} className="text-warn" />
        ) : (
          <motion.span animate={{ rotate: collapsed ? -90 : 0 }} transition={spring.snappy} className="flex">
            <Icon name="chevronDown" size={11} strokeWidth={3} />
          </motion.span>
        )}
        <span className="truncate">{label}</span>
        <span className="cat-sep h-px min-w-3 flex-1 bg-gradient-to-r from-line/15 to-transparent" />
        <span className="rounded-md bg-line/[0.06] px-1.5 text-[10px] tabular-nums tracking-normal">{count}</span>
      </button>
      {onAdd && (
        <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.85 }} transition={spring.snappy} className="tap rounded-md p-0.5 text-fg-muted opacity-0 hover:bg-line/10 hover:text-fg-strong group-hover:opacity-100 phone:opacity-100" title="Criar canal" aria-label="Criar canal" onClick={onAdd}>
          <Icon name="plus" size={15} />
        </motion.button>
      )}
    </div>
  );
}

/** Animated equalizer: who is talking right now. */
function Eq({ on, className }: { on: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex h-3 items-end gap-[2px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={clsx('w-[3px] rounded-full bg-ok', on ? 'eq-bar' : 'h-[3px] opacity-40')} style={on ? { animationDelay: `${i * 0.15}s` } : undefined} />
      ))}
    </span>
  );
}

/**
 * Voice channel as a "room" card: who is inside, who is talking (live equalizer), who is streaming
 * (with a one-click Assistir), what they are playing — and a clear Entrar / Você está aqui state.
 */
function VoiceRoom({
  channel,
  active,
  canConnect,
  isPrivate,
  draggable,
  onDragStart,
  onOpen,
  onContextMenu,
  tools,
}: {
  channel: Channel;
  active: boolean;
  canConnect: boolean;
  isPrivate: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  tools: React.ReactNode;
}) {
  const nav = useNavigate();
  const serverId = channel.serverId!;
  const states = useStoreShallow((s) => Object.values(s.voiceStates).filter((v) => v.channelId === channel.id));
  const mine = useVoice((v) => v.channelId === channel.id);
  const myState = useVoice((v) => (v.channelId === channel.id ? v.state : null));
  const speaking = useVoice((v) => (v.channelId === channel.id ? v.speaking : NO_SPEAKERS));
  const presences = useStoreShallow((s) => states.map((v) => s.presences[v.userId]?.activity ?? null));
  const anyTalking = states.some((v) => speaking[v.userId] && !v.selfMute && !v.serverMute);
  const live = states.filter((v) => v.streaming).length;
  const filled = states.length > 0;

  const watch = async (userId: string) => {
    if (!mine) await joinVoice(channel.id);
    focusStream(userId);
    const path = `/channels/${serverId}/${channel.id}`;
    if (isMobileNow()) openContent(path);
    else nav(path);
  };

  return (
    <motion.div
      layout="position"
      transition={spring.gentle}
      className={clsx(
        'relative mt-1 rounded-2xl border transition-[background-color,border-color,box-shadow] duration-300',
        mine ? 'border-ok/30 bg-ok/[0.06] shadow-[0_8px_30px_-14px_rgb(var(--ok)/0.6)]' : filled ? 'border-line/[0.07] bg-line/[0.025]' : 'border-transparent',
        !filled && !mine && 'hover:bg-line/[0.04]',
      )}
    >
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={onOpen}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        onContextMenu={onContextMenu}
        data-glow
        className={clsx('group relative flex cursor-pointer items-center gap-2.5 rounded-2xl px-2', filled ? 'h-12' : 'h-10', active || mine || filled ? 'text-fg-strong' : 'text-fg-faint hover:text-fg', !canConnect && 'cursor-not-allowed opacity-60')}
      >
        <span
          className={clsx(
            'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-300',
            mine ? 'bg-ok text-black shadow-[0_0_18px_rgb(var(--ok)/0.55)]' : filled ? 'grad text-white' : 'bg-line/[0.05] group-hover:bg-line/[0.09]',
          )}
        >
          {anyTalking && <span className="absolute inset-0 rounded-lg ring-2 ring-ok/70" style={{ animation: 'cz-pulse-ring 1.4s ease-out infinite' }} />}
          <Icon name={isPrivate ? 'lock' : 'speaker'} size={15} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate text-[14.5px]', (filled || mine) && 'font-bold')}>{channel.name}</span>
          {filled && (
            <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-medium text-fg-muted">
              <Eq on={anyTalking} />
              {states.length} na call
              {live > 0 && <span className="truncate font-bold text-danger">· {live} ao vivo</span>}
            </span>
          )}
        </span>
        {tools}
        <AnimatePresence mode="popLayout" initial={false}>
          {mine ? (
            <motion.span key="here" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring.snappy} title={myState === 'connected' ? 'Você está nesta call' : 'Conectando…'} className="relative mr-1 flex h-2.5 w-2.5 group-hover:hidden">
              <span className={clsx('absolute inset-0 rounded-full', myState === 'connected' ? 'bg-ok' : 'bg-warn')} style={{ animation: 'cz-pulse-ring 1.6s ease-out infinite' }} />
              <span className={clsx('relative h-2.5 w-2.5 rounded-full', myState === 'connected' ? 'bg-ok' : 'bg-warn')} />
            </motion.span>
          ) : (
            canConnect && (
              <motion.span key="join" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={spring.snappy} className="hidden items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[11px] font-black text-black shadow-[0_4px_14px_-4px_rgb(var(--ok)/0.8)] group-hover:flex">
                <Icon name="phone" size={11} strokeWidth={3} /> Entrar
              </motion.span>
            )
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {states.map((v, idx) => {
          const talking = !!speaking[v.userId] && !v.selfMute && !v.serverMute;
          const act = presences[idx];
          return (
            <motion.div
              key={v.userId}
              layout
              initial={{ opacity: 0, height: 0, x: -12 }}
              animate={{ opacity: 1, height: 'auto', x: 0 }}
              exit={{ opacity: 0, height: 0, x: 12 }}
              transition={spring.gentle}
              className="overflow-hidden"
            >
              <UserPopoutTrigger userId={v.userId} serverId={serverId}>
                <div className={clsx('group/m mx-1 mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors', talking ? 'bg-ok/[0.08]' : 'hover:bg-line/[0.05]')}>
                  <motion.span animate={{ scale: talking ? 1.08 : 1 }} transition={spring.snappy} className={clsx('relative rounded-full', talking && 'speaking')}>
                    <Avatar userId={v.userId} size={28} />
                  </motion.span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={clsx('block truncate text-[13.5px] font-semibold transition-colors', talking ? 'text-fg-strong' : 'text-fg')}>{displayName(v.userId, serverId)}</span>
                    {act && (
                      <span className="block truncate text-[11px] text-fg-muted">
                        {act.type === 'playing' ? '🎮 ' : '🎵 '}
                        {act.name}
                      </span>
                    )}
                  </span>
                  {v.streaming && (
                    <>
                      <span className="flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-[9.5px] font-black tracking-wide text-white shadow-[0_0_12px_rgb(var(--danger)/0.6)] group-hover/m:hidden">
                        <span className="rec-dot h-1.5 w-1.5 rounded-full bg-white" /> AO VIVO
                      </span>
                      <button
                        className="hidden items-center gap-1 rounded-md bg-danger px-2 py-0.5 text-[10.5px] font-black text-white hover:bg-danger/85 group-hover/m:flex"
                        onClick={(e) => {
                          e.stopPropagation();
                          void watch(v.userId);
                        }}
                      >
                        <Icon name="screen" size={11} strokeWidth={2.6} /> Assistir
                      </button>
                    </>
                  )}
                  <span className="flex items-center gap-1 text-fg-faint">
                    {v.video && <Icon name="camera" size={14} />}
                    {(v.selfMute || v.serverMute) && <Icon name="micOff" size={14} className={v.serverMute ? 'text-danger' : 'text-danger/70'} />}
                    {(v.selfDeaf || v.serverDeaf) && <Icon name="headphonesOff" size={14} className={v.serverDeaf ? 'text-danger' : 'text-danger/70'} />}
                  </span>
                </div>
              </UserPopoutTrigger>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
