import clsx from 'clsx';
import { useStore } from '@/store';

const COLORS = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#d63031', '#e84393', '#fdcb6e', '#00cec9'];
export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export const STATUS_COLOR: Record<string, string> = {
  online: 'bg-ok',
  idle: 'bg-warn',
  dnd: 'bg-danger',
  offline: 'bg-fg-faint',
  invisible: 'bg-fg-faint',
};
export const STATUS_LABEL: Record<string, string> = {
  online: 'Disponível',
  idle: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline',
  invisible: 'Invisível',
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return <span className={clsx('block rounded-full', STATUS_COLOR[status] ?? 'bg-fg-faint', className)} />;
}

export function Avatar({
  userId,
  url,
  name,
  size = 40,
  showStatus = false,
  speaking = false,
  className,
}: {
  userId: string;
  url?: string | null;
  name?: string;
  size?: number;
  showStatus?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const user = useStore((s) => s.users[userId]);
  const presence = useStore((s) => (showStatus ? s.presences[userId] : undefined));
  const me = useStore((s) => s.me);
  const src = url !== undefined ? url : user?.avatarUrl;
  const label = name ?? user?.displayName ?? '?';
  let status = presence?.status ?? 'offline';
  if (me?.id === userId && showStatus) status = me.status === 'invisible' ? 'offline' : (presence?.status ?? me.status);
  const dot = Math.max(10, Math.round(size * 0.3));
  return (
    <div className={clsx('relative shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" className={clsx('h-full w-full rounded-full object-cover', speaking && 'ring-2 ring-ok ring-offset-2 ring-offset-bg-side')} draggable={false} />
      ) : (
        <div
          className={clsx('flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white', speaking && 'ring-2 ring-ok ring-offset-2 ring-offset-bg-side')}
          style={{ background: colorFor(userId), fontSize: size * 0.4 }}
        >
          {label.slice(0, 1).toUpperCase()}
        </div>
      )}
      {showStatus && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg-side p-[3px]" style={{ width: dot + 6, height: dot + 6 }}>
          <StatusDot status={status} className="h-full w-full" />
        </span>
      )}
    </div>
  );
}
