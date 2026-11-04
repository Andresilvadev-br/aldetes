import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, saveServerOrder, isUnread, get, useStoreShallow } from '@/store';
import { Icon, Logo } from '../common/Icon';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { desktop } from '@/lib/desktop';
import { Tooltip, useContextMenu, confirmDialog, toastError } from '../common/overlay';
import { Avatar } from '../common/Avatar';
import { CreateServerModal } from '../modals/CreateServerModal';
import { InviteModal } from '../modals/InviteModal';
import { ServerSettings } from '../settings/ServerSettings';
import { api } from '@/lib/api';
import { ackChannel } from '@/lib/actions';

export function ServerIcon({ name, iconUrl, size = 48, active }: { name: string; iconUrl: string | null; size?: number; active?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3);
  return iconUrl ? (
    <img src={iconUrl} alt="" draggable={false} className="rounded-2xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className={clsx(
        'flex items-center justify-center rounded-2xl font-bold transition-colors duration-200',
        active ? 'grad text-white' : 'bg-line/[0.06] text-fg-strong group-hover:bg-line/[0.1]',
      )}
      style={{ width: size, height: size, fontSize: initials.length > 2 ? 13 : 16 }}
    >
      {initials}
    </div>
  );
}

/** Left indicator: unread dot, or the active bar that slides between items (shared layout). */
function Pill({ state }: { state: 'none' | 'unread' | 'hover' | 'active' }) {
  if (state === 'active')
    return <motion.span layoutId="rail-active" transition={spring.responsive} className="grad absolute -left-[14px] top-1/2 h-9 w-1.5 -translate-y-1/2 rounded-r-full" />;
  return (
    <span
      className={clsx(
        'absolute -left-[14px] top-1/2 w-1.5 -translate-y-1/2 rounded-r-full bg-fg-strong transition-all duration-200',
        state === 'none' && 'h-0',
        state === 'unread' && 'h-2',
        state === 'hover' && 'h-5',
      )}
    />
  );
}

export function ServerRail() {
  const order = useStore((s) => s.serverOrder);
  const servers = useStore((s) => s.servers);
  const loc = useLocation();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const homeActive = loc.pathname.startsWith('/channels/@me');
  // unread DMs show as avatars on the rail
  const unreadDms = useStoreShallow((s) => s.dmIds.filter((id) => (s.readStates[id]?.mentionCount ?? 0) > 0));

  return (
    <nav className={clsx('scroll-none flex w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto pb-3', desktop?.platform === 'darwin' ? 'pt-10' : 'pt-3')} aria-label="Servidores">
      <RailItem tooltip="Mensagens diretas" active={homeActive} onClick={() => nav('/channels/@me')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-200', homeActive ? 'grad text-white shadow-glow' : 'bg-line/[0.06] text-fg group-hover:text-fg-strong')}>
          <Logo size={26} />
        </div>
      </RailItem>
      {unreadDms.map((id) => (
        <DmBubble key={id} channelId={id} />
      ))}
      <div className="mx-auto my-1 h-px w-8 bg-line/10" />
      {order.map((id) => {
        const s = servers[id];
        if (!s) return null;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!dragId || dragId === id) return;
              const next = order.filter((x) => x !== dragId);
              next.splice(next.indexOf(id), 0, dragId);
              saveServerOrder(next);
              setDragId(null);
            }}
            className={clsx(dragId === id && 'opacity-40')}
          >
            <ServerButton serverId={id} />
          </div>
        );
      })}
      <RailItem tooltip="Adicionar um servidor" onClick={() => setCreating(true)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-line/15 text-fg-muted transition-colors duration-200 group-hover:border-ok/60 group-hover:bg-ok/10 group-hover:text-ok">
          <Icon name="plus" size={22} />
        </div>
      </RailItem>
      <RailItem tooltip="Explorar servidores públicos" active={loc.pathname === '/discover'} onClick={() => nav('/discover')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-200', loc.pathname === '/discover' ? 'grad text-white shadow-glow' : 'bg-line/[0.06] text-fg-muted group-hover:text-fg-strong')}>
          <Icon name="compass" size={22} />
        </div>
      </RailItem>
      {creating && <CreateServerModal onClose={() => setCreating(false)} />}
    </nav>
  );
}

function RailItem({ tooltip, active, unread, onClick, onContextMenu, children, badge }: { tooltip: string; active?: boolean; unread?: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; children: React.ReactNode; badge?: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="group relative flex w-full justify-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Pill state={active ? 'active' : hover ? 'hover' : unread ? 'unread' : 'none'} />
      <Tooltip label={tooltip} side="right">
        <motion.button
          onClick={onClick}
          onContextMenu={onContextMenu}
          className={clsx('relative rounded-2xl', active && 'shadow-glow')}
          aria-label={tooltip}
          whileHover={{ y: -1, scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          transition={spring.snappy}
        >
          {children}
          {!!badge && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[20px] rounded-full border-[3px] border-bg-rail bg-danger px-1 text-center text-[11px] font-bold leading-[13px] text-white">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </motion.button>
      </Tooltip>
    </div>
  );
}

function DmBubble({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId]);
  const count = useStore((s) => s.readStates[channelId]?.mentionCount ?? 0);
  const nav = useNavigate();
  if (!c) return null;
  const other = c.recipients?.[0];
  const name = c.type === 'group_dm' ? c.name || c.recipients?.map((r) => r.displayName).join(', ') || 'Grupo' : (other?.displayName ?? 'DM');
  return (
    <RailItem tooltip={name} onClick={() => nav(`/channels/@me/${channelId}`)} badge={count}>
      <Avatar userId={other?.id ?? channelId} size={48} />
    </RailItem>
  );
}

function ServerButton({ serverId }: { serverId: string }) {
  const s = useStore((st) => st.servers[serverId])!;
  const loc = useLocation();
  const nav = useNavigate();
  const menu = useContextMenu();
  const active = loc.pathname.startsWith(`/channels/${serverId}`);
  const unread = useStore((st) => Object.values(st.channels).some((c) => c.serverId === serverId && (c.type === 'text' || c.type === 'announcement') && isUnread(c.id)));
  const mentions = useStore((st) => Object.values(st.channels).reduce((a, c) => (c.serverId === serverId ? a + (st.readStates[c.id]?.mentionCount ?? 0) : a), 0));
  const me = useStore((st) => st.me);
  const [modal, setModal] = useState<'invite' | 'settings' | null>(null);
  const perms = BigInt(s.myPermissions);
  return (
    <>
      <RailItem
        tooltip={s.name}
        active={active}
        unread={unread}
        badge={mentions}
        onClick={() => nav(`/channels/${serverId}`)}
        onContextMenu={(e) =>
          menu(e, [
            {
              label: 'Marcar como lido',
              onClick: () => Object.values(get().channels).filter((c) => c.serverId === serverId).forEach((c) => ackChannel(c.id)),
            },
            { separator: true, label: '' },
            { label: 'Convidar pessoas', onClick: () => setModal('invite'), hidden: !hasPermission(perms, Permissions.CREATE_INVITE) },
            { label: 'Configurações do servidor', onClick: () => setModal('settings'), hidden: !hasPermission(perms, Permissions.MANAGE_SERVER | 0n) && !hasPermission(perms, Permissions.MANAGE_ROLES) && !hasPermission(perms, Permissions.VIEW_AUDIT_LOG) && !hasPermission(perms, Permissions.BAN_MEMBERS) },
            { label: 'Copiar ID', onClick: () => navigator.clipboard.writeText(serverId) },
            {
              label: 'Sair do servidor',
              danger: true,
              hidden: s.ownerId === me?.id,
              onClick: async () => {
                if (await confirmDialog({ title: `Sair de '${s.name}'`, body: 'Tem certeza? Você só poderá voltar com um novo convite.', confirm: 'Sair do servidor', danger: true })) {
                  api('DELETE', `/servers/${serverId}/members/@me`).catch(toastError);
                }
              },
            },
          ])
        }
      >
        <ServerIcon name={s.name} iconUrl={s.iconUrl} active={active} />
      </RailItem>
      {modal === 'invite' && <InviteModal serverId={serverId} onClose={() => setModal(null)} />}
      {modal === 'settings' && <ServerSettings serverId={serverId} onClose={() => setModal(null)} />}
    </>
  );
}
