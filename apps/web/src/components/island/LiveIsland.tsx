import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useStore, useStoreShallow, get, displayName } from '@/store';
import { useIsland, dismissIsland, setIslandExpanded, pushIsland, type IslandEvent } from '@/lib/island';
import { useVoice, toggleMute, toggleDeaf, toggleCamera, leaveVoice, stopScreenShare, joinVoice } from '@/lib/voice';
import { onGateway } from '@/lib/gateway';
import { playSound } from '@/lib/sounds';
import { desktop } from '@/lib/desktop';
import { spring, greeting } from '@/lib/motion';
import { Avatar } from '../common/Avatar';
import { Icon, Logo } from '../common/Icon';
import { ScreenShareModal } from '../voice/ScreenShareModal';
import { dmName } from '../layout/HomeSidebar';

/* ------------------------------------------------------------------ helpers */

function useNow(active: boolean, every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const fade = {
  initial: { opacity: 0, scale: 0.96, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.98, filter: 'blur(2px)', transition: { duration: 0.1 } },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
} as const;

/* ------------------------------------------------------------------ island */

/**
 * Live Island — a single physical capsule that morphs between states:
 * idle → compact activity → split (call + stream) → expanded controls → transient events.
 */
export function LiveIsland() {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const expanded = useIsland((s) => s.expanded);
  const events = useIsland((s) => s.events);
  const uploads = useIsland((s) => s.uploads);
  const v = useVoice();
  const connection = useStore((s) => s.connection);
  const [share, setShare] = useState(false);
  const [hovering, setHovering] = useState(false);

  const inCall = !!v.channelId && v.state !== 'idle';
  const upload = Object.values(uploads)[0];
  const event = events[0];

  // Incoming calls (gateway) become island events
  useEffect(
    () =>
      onGateway('call:ring', (d: { channelId: string; from: string }) => {
        if (useVoice.getState().channelId === d.channelId || get().me?.status === 'dnd') return;
        pushIsland({ kind: 'ring', title: displayName(d.from), body: 'está te chamando', userId: d.from, channelId: d.channelId, ttl: 30000 });
        desktop?.notify('Chamada recebida', `${displayName(d.from)} está te chamando`, d.channelId);
      }),
    [],
  );

  // Ring sound loop while a ring is showing; stop if the caller leaves
  const ring = events.find((e) => e.kind === 'ring');
  const callerHere = useStore((s) => (ring ? s.voiceStates[ring.userId!]?.channelId === ring.channelId : false));
  useEffect(() => {
    if (!ring) return;
    playSound('ring');
    const t = setInterval(() => playSound('ring'), 2500);
    return () => clearInterval(t);
  }, [ring?.id]);
  useEffect(() => {
    if (ring && !callerHere && Date.now() - ring.createdAt > 3000) dismissIsland(ring.id);
  }, [ring, callerHere]);

  // Auto-dismiss transient events (paused while hovered)
  useEffect(() => {
    if (!event || hovering) return;
    const left = Math.max(800, event.ttl - (Date.now() - event.createdAt));
    const t = setTimeout(() => dismissIsland(event.id), left);
    return () => clearTimeout(t);
  }, [event, hovering]);

  // Collapse on outside click / ESC
  useEffect(() => {
    if (!expanded) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[role=dialog]') && setIslandExpanded(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setIslandExpanded(false);
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [expanded]);

  type Mode = 'ring' | 'event' | 'expanded' | 'split' | 'call' | 'upload' | 'reconnect' | 'idle';
  const mode: Mode = ring
    ? 'ring'
    : event
      ? 'event'
      : expanded
        ? 'expanded'
        : connection !== 'connected'
          ? 'reconnect'
          : inCall && v.screen
            ? 'split'
            : inCall
              ? 'call'
              : upload
                ? 'upload'
                : 'idle';

  const big = mode === 'ring' || mode === 'expanded';
  const accentEdge = mode === 'call' || mode === 'split' || mode === 'expanded' || mode === 'ring';

  return (
    <div className="no-drag relative flex justify-center" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <motion.div
        ref={ref}
        layout
        transition={spring.island}
        style={{ borderRadius: big ? 26 : 22 }}
        data-testid="live-island"
        data-mode={mode}
        className={clsx(
          'relative overflow-hidden border bg-black text-white shadow-[0_14px_40px_-12px_rgb(0_0_0/0.9)]',
          accentEdge ? 'border-brand/40 shadow-glow' : 'border-white/[0.08]',
          big ? 'w-[400px]' : 'min-w-[180px] max-w-[460px]',
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={mode === 'event' ? event!.id : mode} {...fade}>
            {mode === 'ring' && ring && (
              <RingView
                ev={ring}
                onAccept={() => {
                  dismissIsland(ring.id);
                  nav(`/channels/@me/${ring.channelId}`);
                  void joinVoice(ring.channelId!);
                }}
                onDecline={() => dismissIsland(ring.id)}
              />
            )}
            {mode === 'event' && event && (
              <EventView
                ev={event}
                onOpen={() => {
                  dismissIsland(event.id);
                  const c = event.channelId ? get().channels[event.channelId] : null;
                  if (c) nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`);
                }}
              />
            )}
            {mode === 'expanded' && (inCall ? <CallExpanded onShare={() => setShare(true)} /> : <IdleExpanded />)}
            {mode === 'split' && <SplitCompact onClick={() => setIslandExpanded(true)} />}
            {mode === 'call' && <CallCompact onClick={() => setIslandExpanded(true)} />}
            {mode === 'upload' && upload && <UploadCompact label={upload.label} progress={upload.progress} />}
            {mode === 'reconnect' && (
              <Row>
                <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
                <span className="text-[13px] font-semibold">Reconectando…</span>
              </Row>
            )}
            {mode === 'idle' && <IdleCompact onClick={() => setIslandExpanded(true)} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {share && <ScreenShareModal onClose={() => setShare(false)} />}
    </div>
  );
}

function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={clsx('flex h-9 w-full items-center gap-2.5 whitespace-nowrap px-3.5 text-left', onClick && 'cursor-pointer', className)}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ compact states */

function IdleCompact({ onClick }: { onClick: () => void }) {
  const now = useNow(true, 15000);
  const mentions = useStore((s) => Object.values(s.readStates).reduce((a, r) => a + r.mentionCount, 0));
  return (
    <Row onClick={onClick}>
      <span className="grad flex h-5 w-5 items-center justify-center rounded-md text-white">
        <Logo size={12} />
      </span>
      <span className="text-[13px] font-semibold tabular-nums text-white/85">{new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="flex-1" />
      {mentions > 0 ? (
        <span className="flex items-center gap-1 rounded-full bg-danger px-2 text-[11px] font-bold leading-5">
          <Icon name="at" size={11} strokeWidth={2.5} />
          {mentions > 99 ? '99+' : mentions}
        </span>
      ) : (
        <span className="text-[12px] text-white/40">tudo em dia</span>
      )}
    </Row>
  );
}

function useCallInfo() {
  const channelId = useVoice((s) => s.channelId);
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const server = useStore((s) => (channel?.serverId ? s.servers[channel.serverId] : undefined));
  const participants = useStoreShallow((s) => (channelId ? Object.values(s.voiceStates).filter((x) => x.channelId === channelId).map((x) => x.userId) : []));
  const name = channel ? (channel.serverId ? channel.name : dmName(channel)) : '';
  return { channelId, channel, server, participants, name };
}

function SpeakingStack({ ids, size = 20 }: { ids: string[]; size?: number }) {
  const speaking = useVoice((s) => s.speaking);
  const sorted = [...ids].sort((a, b) => Number(!!speaking[b]) - Number(!!speaking[a])).slice(0, 3);
  return (
    <span className="flex -space-x-1.5">
      {sorted.map((id) => (
        <span key={id} className={clsx('rounded-full ring-2 ring-black', speaking[id] && 'speaking')}>
          <Avatar userId={id} size={size} />
        </span>
      ))}
    </span>
  );
}

function CallCompact({ onClick }: { onClick: () => void }) {
  const { name, participants } = useCallInfo();
  const v = useVoice();
  const now = useNow(true);
  const ok = v.state === 'connected';
  return (
    <Row onClick={onClick}>
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', ok ? 'bg-ok shadow-[0_0_10px_rgb(var(--ok))]' : 'animate-pulse bg-warn')} />
      <span className="max-w-[150px] truncate text-[13px] font-semibold">{name}</span>
      <SpeakingStack ids={participants} />
      <span className="flex-1" />
      {(v.selfMute || v.selfDeaf) && <Icon name="micOff" size={14} className="text-danger" />}
      <span className="text-[12px] font-semibold tabular-nums text-white/60">{ok && v.connectedAt ? fmt(now - v.connectedAt) : v.state === 'connecting' ? 'conectando' : 'reconectando'}</span>
    </Row>
  );
}

function SplitCompact({ onClick }: { onClick: () => void }) {
  const v = useVoice();
  const now = useNow(true);
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1">
        <CallCompact onClick={onClick} />
      </div>
      <motion.div layout className="my-1.5 w-px bg-white/10" />
      <Row onClick={onClick} className="!w-auto">
        <span className="rec-dot h-2 w-2 rounded-full bg-danger" />
        <span className="text-[12px] font-bold tracking-wide text-danger">AO VIVO</span>
        <span className="text-[12px] tabular-nums text-white/60">{v.screenSince ? fmt(now - v.screenSince) : ''}</span>
      </Row>
    </div>
  );
}

function UploadCompact({ label, progress }: { label: string; progress: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <Row>
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={r} stroke="rgb(255 255 255 / .15)" strokeWidth="2.5" fill="none" />
        <circle cx="9" cy="9" r={r} stroke="rgb(var(--brand))" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: 'stroke-dashoffset .2s' }} />
      </svg>
      <span className="max-w-[220px] truncate text-[13px] font-semibold">Enviando {label}</span>
      <span className="flex-1" />
      <span className="text-[12px] tabular-nums text-white/60">{Math.round(progress * 100)}%</span>
    </Row>
  );
}

/* ------------------------------------------------------------------ expanded */

function CtrlBtn({ icon, label, active, danger, onClick, disabled }: { icon: Parameters<typeof Icon>[0]['name']; label: string; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={spring.snappy}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        danger ? 'bg-danger text-white hover:bg-danger/85' : active ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20',
      )}
    >
      <Icon name={icon} size={19} />
    </motion.button>
  );
}

function CallExpanded({ onShare }: { onShare: () => void }) {
  const { name, server, participants, channel } = useCallInfo();
  const v = useVoice();
  const now = useNow(true);
  const nav = useNavigate();
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="tile grad text-white">
          <Icon name={channel?.serverId ? 'speaker' : 'phone'} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{name}</div>
          <div className="truncate text-xs text-white/55">
            {server?.name ?? 'Chamada privada'} · <span className="tabular-nums">{v.connectedAt ? fmt(now - v.connectedAt) : '—'}</span>
            {v.pingMs !== null && ` · ${v.pingMs} ms`}
          </div>
        </div>
        <button
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
          onClick={() => {
            setIslandExpanded(false);
            if (channel) nav(channel.serverId ? `/channels/${channel.serverId}/${channel.id}` : `/channels/@me/${channel.id}`);
          }}
        >
          Abrir
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {participants.map((id) => (
          <Participant key={id} id={id} serverId={channel?.serverId ?? null} />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2.5">
        <CtrlBtn icon={v.selfMute || v.selfDeaf ? 'micOff' : 'mic'} label="Microfone" active={v.selfMute || v.selfDeaf} onClick={() => void toggleMute()} />
        <CtrlBtn icon={v.selfDeaf ? 'headphonesOff' : 'headphones'} label="Fones" active={v.selfDeaf} onClick={() => void toggleDeaf()} />
        <CtrlBtn icon={v.camera ? 'camera' : 'cameraOff'} label="Câmera" active={v.camera} disabled={!v.canVideo} onClick={() => void toggleCamera()} />
        <CtrlBtn icon={v.screen ? 'screenOff' : 'screen'} label="Tela" active={v.screen} disabled={!v.canVideo} onClick={() => (v.screen ? void stopScreenShare() : onShare())} />
        <CtrlBtn icon="hangup" label="Desconectar" danger onClick={() => (setIslandExpanded(false), void leaveVoice())} />
      </div>
    </div>
  );
}

function Participant({ id, serverId }: { id: string; serverId: string | null }) {
  const speaking = useVoice((s) => !!s.speaking[id]);
  const vs = useStore((s) => s.voiceStates[id]);
  return (
    <span className={clsx('flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs transition-colors', speaking ? 'bg-ok/20 text-white' : 'bg-white/[0.07] text-white/75')}>
      <span className={clsx('rounded-full', speaking && 'speaking')}>
        <Avatar userId={id} size={20} />
      </span>
      <span className="max-w-[90px] truncate font-medium">{displayName(id, serverId)}</span>
      {(vs?.selfMute || vs?.serverMute) && <Icon name="micOff" size={11} className="text-danger" />}
      {vs?.streaming && <span className="rounded bg-danger px-1 text-[9px] font-bold">AO VIVO</span>}
    </span>
  );
}

function IdleExpanded() {
  const nav = useNavigate();
  const rows = useStoreShallow((s) =>
    Object.entries(s.readStates)
      .filter(([id, r]) => r.mentionCount > 0 && s.channels[id])
      .sort((a, b) => b[1].mentionCount - a[1].mentionCount)
      .slice(0, 4)
      .map(([id, r]) => `${id}:${r.mentionCount}`),
  );
  const me = useStore((s) => s.me);
  const greet = greeting();
  return (
    <div className="p-4">
      <div className="text-[15px] font-bold">
        {greet}, <span className="grad-text">{me?.displayName}</span>
      </div>
      <div className="eyebrow mb-2 mt-3 !text-white/40">Menções não lidas</div>
      {rows.length === 0 && <div className="py-2 text-sm text-white/50">Nada pendente. Tudo em dia ✨</div>}
      {rows.map((r) => {
        const [id, count] = r.split(':') as [string, string];
        const c = get().channels[id]!;
        return (
          <button
            key={id}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/10"
            onClick={() => {
              setIslandExpanded(false);
              nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`);
            }}
          >
            <Icon name={c.serverId ? 'hash' : 'at'} size={15} className="text-white/50" />
            <span className="flex-1 truncate">{c.serverId ? c.name : dmName(c)}</span>
            {c.serverId && <span className="truncate text-xs text-white/40">{get().servers[c.serverId]?.name}</span>}
            <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold">{count}</span>
          </button>
        );
      })}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/40">
        <span className="kbd !border-white/15 !text-white/60">Ctrl</span>
        <span className="kbd !border-white/15 !text-white/60">K</span>
        para ir a qualquer lugar
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ transient */

function EventView({ ev, onOpen }: { ev: IslandEvent; onOpen: () => void }) {
  const icon = ev.kind === 'success' ? 'check' : ev.kind === 'error' ? 'x' : 'bell';
  return (
    <button onClick={onOpen} className="flex w-[400px] max-w-full items-center gap-3 px-3 py-2.5 text-left">
      {ev.userId ? (
        <Avatar userId={ev.userId} size={34} />
      ) : (
        <span className={clsx('tile h-8 w-8', ev.kind === 'error' ? 'bg-danger' : ev.kind === 'success' ? 'bg-ok' : 'grad')}>
          <Icon name={icon} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">{ev.title}</span>
        {ev.body && <span className="block truncate text-[12px] text-white/60">{ev.body}</span>}
      </span>
      {ev.channelId && <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">Abrir</span>}
    </button>
  );
}

function RingView({ ev, onAccept, onDecline }: { ev: IslandEvent; onAccept: () => void; onDecline: () => void }) {
  const c = useStore((s) => (ev.channelId ? s.channels[ev.channelId] : undefined));
  const label = useMemo(() => (c && c.type === 'group_dm' ? dmName(c) : null), [c]);
  return (
    <div className="flex items-center gap-3 p-3.5">
      <motion.span animate={{ rotate: [0, -8, 8, -6, 6, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 1.1 }} className="rounded-full">
        <Avatar userId={ev.userId!} size={46} />
      </motion.span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">{ev.title}</div>
        <div className="truncate text-xs text-white/60">{label ? `chamada em ${label}` : ev.body}</div>
      </div>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onDecline} className="flex h-11 w-11 items-center justify-center rounded-full bg-danger" aria-label="Recusar">
        <Icon name="hangup" size={19} />
      </motion.button>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onAccept} className="flex h-11 w-11 items-center justify-center rounded-full bg-ok shadow-[0_0_22px_rgb(var(--ok)/0.6)]" aria-label="Atender">
        <Icon name="phone" size={19} />
      </motion.button>
    </div>
  );
}
