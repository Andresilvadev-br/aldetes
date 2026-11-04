import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, useStoreShallow, isUnread, displayName } from '@/store';
import { api } from '@/lib/api';
import { ackChannel } from '@/lib/actions';
import { openContent } from '@/lib/mobile';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { ServerIcon } from '../layout/ServerRail';
import { toastError } from '../common/overlay';
import { dmName } from '../layout/HomeSidebar';

/** What needs attention, from data the app already has: mentions, unread DMs and friend requests. */
function useItems() {
  const mentions = useStoreShallow((s) =>
    Object.entries(s.readStates)
      .filter(([id, r]) => r.mentionCount > 0 && s.channels[id]?.serverId)
      .map(([id]) => id),
  );
  const dms = useStoreShallow((s) => s.dmIds.filter((id) => isUnread(id)));
  const requests = useStoreShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').map((r) => r.userId));
  return { mentions, dms, requests };
}
export function useNotificationCount() {
  const { mentions, dms, requests } = useItems();
  return mentions.length + dms.length + requests.length;
}

export function NotificationsScreen() {
  const { mentions, dms, requests } = useItems();
  const empty = !mentions.length && !dms.length && !requests.length;
  const readAll = () => [...mentions, ...dms].forEach((id) => ackChannel(id));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <h1 className="flex-1 text-[22px] font-black tracking-tight text-fg-strong">Notificações</h1>
        {(mentions.length > 0 || dms.length > 0) && (
          <button className="h-11 rounded-full px-3 text-sm font-semibold text-brand active:bg-brand/10" onClick={readAll}>
            Marcar tudo como lido
          </button>
        )}
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {empty && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-16 flex flex-col items-center gap-3 text-center">
            <span className="tile h-16 w-16 rounded-3xl bg-ok/15 text-ok">
              <Icon name="check" size={30} strokeWidth={2.6} />
            </span>
            <div className="text-lg font-extrabold text-fg-strong">Tudo em dia</div>
            <p className="max-w-[260px] text-sm text-fg-muted">Menções, mensagens novas e pedidos de amizade aparecem aqui.</p>
          </motion.div>
        )}
        <AnimatePresence initial={false}>
          {requests.length > 0 && <Section key="req" title="Pedidos de amizade" />}
          {requests.map((id) => (
            <Row key={`r${id}`}>
              <Avatar userId={id} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-fg-strong">{displayName(id, null)}</span>
                <span className="block text-xs text-fg-muted">quer ser seu amigo</span>
              </span>
              <button className="flex h-11 w-11 items-center justify-center rounded-full bg-ok/15 text-ok" aria-label="Aceitar" onClick={() => api('PUT', `/relationships/${id}`, { type: 'friend' }).catch(toastError)}>
                <Icon name="check" size={19} strokeWidth={2.6} />
              </button>
              <button className="flex h-11 w-11 items-center justify-center rounded-full bg-line/[0.08] text-fg-muted" aria-label="Recusar" onClick={() => api('DELETE', `/relationships/${id}`).catch(toastError)}>
                <Icon name="x" size={19} />
              </button>
            </Row>
          ))}
          {mentions.length > 0 && <Section key="men" title="Menções" />}
          {mentions.map((id) => (
            <MentionRow key={`m${id}`} channelId={id} />
          ))}
          {dms.length > 0 && <Section key="dm" title="Mensagens novas" />}
          {dms.map((id) => (
            <DmRow key={`d${id}`} channelId={id} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="eyebrow px-2 pb-1.5 pt-5">{title}</motion.div>;
}
function Row({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
      transition={spring.gentle}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      onClick={onClick}
      className={clsx('mb-1.5 flex min-h-[64px] items-center gap-3 rounded-2xl border border-line/[0.06] bg-line/[0.025] px-3 py-2', onClick && 'active:scale-[0.99] active:bg-line/[0.05]')}
    >
      {children}
    </motion.div>
  );
}
function MentionRow({ channelId }: { channelId: string }) {
  const ch = useStore((s) => s.channels[channelId]);
  const server = useStore((s) => (ch?.serverId ? s.servers[ch.serverId] : undefined));
  const n = useStore((s) => s.readStates[channelId]?.mentionCount ?? 0);
  if (!ch || !server) return null;
  return (
    <Row onClick={() => openContent(`/channels/${server.id}/${ch.id}`)} label={`${n} menções em #${ch.name}, ${server.name}`}>
      <ServerIcon name={server.name} iconUrl={server.iconUrl} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-fg-strong">#{ch.name}</span>
        <span className="block truncate text-xs text-fg-muted">{server.name}</span>
      </span>
      <span className="rounded-full bg-danger px-2 text-[12px] font-black leading-[22px] text-white">@{n}</span>
    </Row>
  );
}
function DmRow({ channelId }: { channelId: string }) {
  const ch = useStore((s) => s.channels[channelId]);
  const other = useStore((s) => (ch?.type === 'dm' ? ch.recipients?.find((u) => u.id !== s.me?.id) : undefined));
  if (!ch) return null;
  return (
    <Row onClick={() => openContent(`/channels/@me/${ch.id}`)} label={`Mensagens novas de ${dmName(ch)}`}>
      {other ? <Avatar userId={other.id} size={44} showStatus /> : <span className="tile grad h-11 w-11 text-white"><Icon name="users" size={18} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-fg-strong">{dmName(ch)}</span>
        <span className="block text-xs text-fg-muted">mensagem nova</span>
      </span>
      <span className="h-2.5 w-2.5 rounded-full bg-brand" />
    </Row>
  );
}
