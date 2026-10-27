import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, saveServerOrder, isUnread, get, useStoreShallow } from '@/store';
import { Icon, Logo } from '../common/Icon';
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
    <img src={iconUrl} alt="" draggable={false} className={clsx('object-cover transition-all duration-200', active ? 'rounded-2xl' : 'rounded-[24px] group-hover:rounded-2xl')} style={{ width: size, height: size }} />
  ) : (
    <div
      className={clsx(
        'flex items-center justify-center font-semibold transition-all duration-200',
        active ? 'rounded-2xl bg-brand text-white' : 'rounded-[24px] bg-bg-main text-fg-strong group-hover:rounded-2xl group-hover:bg-brand group-hover:text-white',
      )}
      style={{ width: size, height: size, fontSize: initials.length > 2 ? 13 : 16 }}
    >
      {initials}
    </div>
  );
}

function Pill({ state }: { state: 'none' | 'unread' | 'hover' | 'active' }) {
  return (
    <span
      className={clsx(
        'absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r bg-fg-strong transition-all duration-200',
        state === 'none' && 'h-0',
        state === 'unread' && 'h-2',
        state === 'hover' && 'h-5',
        state === 'active' && 'h-10',
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
    <nav className="scroll-none flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-bg-rail py-3" aria-label="Servidores">
      <RailItem tooltip="Mensagens diretas" active={homeActive} onClick={() => nav('/channels/@me')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center transition-all duration-200', homeActive ? 'rounded-2xl bg-brand text-white' : 'rounded-[24px] bg-bg-main text-fg group-hover:rounded-2xl group-hover:bg-brand group-hover:text-white')}>
          <Logo size={28} />
        </div>
      </RailItem>
      {unreadDms.map((id) => (
        <DmBubble key={id} channelId={id} />
      ))}
      <div className="mx-auto h-0.5 w-8 rounded bg-line/10" />
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
        <div className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-bg-main text-ok transition-all duration-200 group-hover:rounded-2xl group-hover:bg-ok group-hover:text-white">
          <Icon name="plus" size={22} />
        </div>
      </RailItem>
      <RailItem tooltip="Explorar servidores públicos" active={loc.pathname === '/discover'} onClick={() => nav('/discover')}>
        <div className={clsx('flex h-12 w-12 items-center justify-center transition-all duration-200', loc.pathname === '/discover' ? 'rounded-2xl bg-ok text-white' : 'rounded-[24px] bg-bg-main text-ok group-hover:rounded-2xl group-hover:bg-ok group-hover:text-white')}>
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
        <button onClick={onClick} onContextMenu={onContextMenu} className="relative" aria-label={tooltip}>
          {children}
          {!!badge && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] rounded-full border-[3px] border-bg-rail bg-danger px-1 text-center text-[11px] font-bold leading-[13px] text-white">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </button>
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
