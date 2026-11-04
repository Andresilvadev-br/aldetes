import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useStore, useStoreShallow, get, displayName } from '@/store';
import { useIsland, dismissIsland, setIslandExpanded, pushIsland, type IslandEvent } from '@/lib/island';
import { useVoice, toggleMute, toggleDeaf, toggleCamera, leaveVoice, stopScreenShare, joinVoice, focusStream } from '@/lib/voice';
import { onGateway } from '@/lib/gateway';
import { playSound } from '@/lib/sounds';
import { desktop } from '@/lib/desktop';
import { spring, greeting } from '@/lib/motion';
import { Avatar } from '../common/Avatar';
import { Icon, Logo } from '../common/Icon';
import { ScreenShareModal } from '../voice/ScreenShareModal';
import { useMedia, mediaCommand } from '@/lib/media';
import { usePrefs, setPrefs } from '@/lib/prefs';
import type { NowPlaying } from '@/lib/desktop';
import { Art, MusicCompact, MusicPanel, ResizeGrip } from './parts';
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
  const v = useVoice(useShallow((s) => ({ channelId: s.channelId, screen: s.screen, state: s.state })));
  const connection = useStore((s) => s.connection);
  const [share, setShare] = useState(false);
  const [hovering, setHovering] = useState(false);
  const np = useMedia((s) => s.np);
  const hoverOpen = usePrefs((p) => p.islandHover);
  const savedWidth = usePrefs((p) => p.islandWidth);
  const [width, setWidth] = useState(savedWidth);
  useEffect(() => setWidth(savedWidth), [savedWidth]);
  const pinned = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const inCall = !!v.channelId && v.state !== 'idle';
  const upload = Object.values(uploads)[0];
  const event = events[0];

  // Incoming calls (gateway) become island events
  useEffect(
    () =>
      onGateway('call:ring', (d: { channelId: string; from: string }) => {
        if (useVoice.getState().channelId === d.channelId || get().me?.status === 'dnd') return;
        const ch = get().channels[d.channelId];
        pushIsland({ kind: 'ring', title: displayName(d.from), body: ch?.serverId ? `te chamou para ${ch.name}` : 'está te chamando', userId: d.from, channelId: d.channelId, ttl: 30000 });
        desktop?.notify('Chamada recebida', `${displayName(d.from)} está te chamando`, d.channelId);
      }),
    [],
  );

  // Someone in my call goes live → "Fulano está ao vivo · Assistir"
  const myChannel = v.channelId;
  const streamers = useStoreShallow((st) => (myChannel ? Object.values(st.voiceStates).filter((x) => x.channelId === myChannel && x.streaming && x.userId !== st.me?.id).map((x) => x.userId) : []));
  const prevStreamers = useRef<string[]>([]);
  useEffect(() => {
    for (const id of prevStreamers.current)
      if (!streamers.includes(id) && useVoice.getState().channelId === myChannel) pushIsland({ kind: 'info', title: `${displayName(id)} parou de transmitir`, userId: id, ttl: 1800, key: `unlive:${id}`, cooldown: 8000 });
    for (const id of streamers) {
      if (!prevStreamers.current.includes(id))
        pushIsland({ kind: 'info', title: `${displayName(id)} está ao vivo`, body: 'Começou a transmitir a tela', userId: id, channelId: myChannel ?? undefined, ttl: 7000, action: 'Assistir', watch: id, key: `live:${id}`, cooldown: 20000 });
    }
    prevStreamers.current = streamers;
  }, [streamers, myChannel]);

  // Entering a call: the island announces it (morphing out of the compact capsule), only after the real connection
  const prevState = useRef(v.state);
  useEffect(() => {
    if (v.state === 'connected' && prevState.current === 'connecting' && v.channelId) {
      const ch = get().channels[v.channelId];
      pushIsland({ kind: 'info', title: `Conectado · ${ch?.serverId ? ch.name : 'Chamada'}`, ttl: 1600, key: `connected:${v.channelId}`, cooldown: 5000 });
    }
    prevState.current = v.state;
  }, [v.state, v.channelId]);

  // Brief events (≈1.8 s): someone joins/leaves my call, someone stops streaming
  const members = useStoreShallow((st) => (myChannel ? Object.values(st.voiceStates).filter((x) => x.channelId === myChannel && x.userId !== st.me?.id).map((x) => x.userId) : []));
  const prevMembers = useRef<string[] | null>(null);
  useEffect(() => {
    if (!myChannel || v.state !== 'connected') {
      prevMembers.current = null;
      return;
    }
    if (prevMembers.current) {
      for (const id of members) if (!prevMembers.current.includes(id)) pushIsland({ kind: 'info', title: `${displayName(id)} entrou na call`, userId: id, ttl: 1800, key: `join:${id}`, cooldown: 8000 });
      for (const id of prevMembers.current) if (!members.includes(id)) pushIsland({ kind: 'info', title: `${displayName(id)} saiu da call`, userId: id, ttl: 1800, key: `leave:${id}`, cooldown: 8000 });
    }
    prevMembers.current = members;
  }, [members, myChannel, v.state]);
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

  // Hover opens (after a short intent delay); leaving closes unless the user clicked to pin it open.
  const onEnter = () => {
    setHovering(true);
    clearTimeout(hoverTimer.current);
    if (hoverOpen && !useIsland.getState().events.length) hoverTimer.current = setTimeout(() => setIslandExpanded(true), 220);
  };
  const onLeave = () => {
    setHovering(false);
    clearTimeout(hoverTimer.current);
    if (!pinned.current) hoverTimer.current = setTimeout(() => setIslandExpanded(false), 320);
  };
  const openPinned = () => {
    pinned.current = true;
    setIslandExpanded(true);
  };
  useEffect(() => {
    if (!expanded) pinned.current = false;
  }, [expanded]);

  type Mode = 'ring' | 'event' | 'expanded' | 'split' | 'call' | 'music' | 'upload' | 'reconnect' | 'idle';
  // An open (expanded) island keeps its controls: brief events wait instead of covering them.
  const mode: Mode = ring
    ? 'ring'
    : expanded
      ? 'expanded'
      : event
        ? 'event'
        : connection !== 'connected'
          ? 'reconnect'
          : inCall && (v.screen || np)
            ? 'split'
            : inCall
              ? 'call'
              : upload
                ? 'upload'
                : np
                  ? 'music'
                  : 'idle';

  const big = mode === 'ring' || mode === 'expanded';
  const accentEdge = mode === 'call' || mode === 'split' || mode === 'expanded' || mode === 'ring';

  const pos = usePrefs((p) => p.islandPos);
  const [dragPos, setDragPos] = useState<{ fx: number; fy: number } | null>(null);
  const livePos = dragPos ?? pos;
  const [, reflow] = useState(0);
  useEffect(() => {
    if (!pos) return;
    const r = () => reflow((x) => x + 1);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, [pos]);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const capsule = ref.current!.getBoundingClientRect();
    const grabDx = e.clientX - (capsule.left + capsule.width / 2);
    const grabDy = e.clientY - capsule.top;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let last: { fx: number; fy: number } | null = null;
    // Listen on window: the island re-mounts into a portal mid-drag, so element listeners would be lost.
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = Math.min(W - 60, Math.max(60, ev.clientX - grabDx));
      const top = Math.min(H - 40, Math.max(4, ev.clientY - grabDy));
      last = { fx: cx / W, fy: top / H };
      setDragPos(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved && last) setPrefs({ islandPos: last });
      setDragPos(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resetPos = () => setPrefs({ islandPos: null });

  const island = (
    <div
      className={clsx('no-drag group/island flex justify-center', livePos ? 'fixed z-[45] -translate-x-1/2' : 'relative')}
      style={livePos ? { left: livePos.fx * window.innerWidth, top: livePos.fy * window.innerHeight } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onDoubleClick={(e) => (e.target as HTMLElement).closest('[data-island-grip]') && resetPos()}
    >
      <span
        data-island-grip
        role="button"
        aria-label="Mover a Live Island (arraste) · duplo clique volta ao topo"
        title="Arraste para mover · duplo clique volta ao topo"
        onPointerDown={startDrag}
        className={clsx(
          'absolute -left-7 top-1.5 flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded-md text-fg-faint opacity-0 transition-opacity hover:bg-line/10 hover:text-fg-strong active:cursor-grabbing group-hover/island:opacity-100',
          dragPos && 'opacity-100',
        )}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          {[2, 7, 12].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}
        </svg>
      </span>
      <motion.div
        ref={ref}
        layout="size"
        transition={spring.island}
        style={big ? { borderRadius: 26, width: mode === 'ring' ? 400 : width } : { borderRadius: 22 }}
        data-testid="live-island"
        data-mode={mode}
        className={clsx(
          'relative overflow-hidden border bg-black text-white shadow-[0_14px_40px_-12px_rgb(0_0_0/0.9)]',
          accentEdge ? 'border-brand/40 shadow-glow' : 'border-white/[0.08]',
          big ? '' : 'min-w-[180px] max-w-[480px]',
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
                  if (event.watch) focusStream(event.watch);
                }}
              />
            )}
            {mode === 'expanded' && (
              <div>
                {inCall ? <CallExpanded onShare={() => setShare(true)} /> : !np && <IdleExpanded />}
                {np && (
                  <div className={clsx('px-4 pb-1', inCall ? 'border-t border-white/[0.08] pt-3' : 'pt-4')}>
                    <MusicPanel np={np} onCmd={mediaCommand} compact={inCall} />
                  </div>
                )}
                {pos && (
                  <div className="flex justify-center pt-1">
                    <button className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/20" onClick={resetPos}>
                      <Icon name="arrowLeft" size={12} className="rotate-90" /> Voltar ao topo
                    </button>
                  </div>
                )}
                <ResizeGrip width={width} onWidth={setWidth} onCommit={(w) => setPrefs({ islandWidth: w })} />
              </div>
            )}
            {mode === 'split' && <SplitCompact onClick={openPinned} np={v.screen ? null : np} />}
            {mode === 'call' && <CallCompact onClick={openPinned} />}
            {mode === 'music' && np && (
              <Row onClick={openPinned}>
                <MusicCompact np={np} />
              </Row>
            )}
            {mode === 'upload' && upload && <UploadCompact label={upload.label} progress={upload.progress} />}
            {mode === 'reconnect' && (
              <Row>
                <span className="h-2 w-2 animate-pulse rounded-full bg-warn" />
                <span className="text-[13px] font-semibold">Reconectando…</span>
              </Row>
            )}
            {mode === 'idle' && <IdleCompact onClick={openPinned} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {share && <ScreenShareModal onClose={() => setShare(false)} />}
    </div>
  );
  // Moved somewhere else: render on top of the app (outside the top bar)
  return livePos ? createPortal(island, document.body) : island;
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
  const v = useVoice(useShallow((s) => ({ connectedAt: s.connectedAt, selfDeaf: s.selfDeaf, selfMute: s.selfMute, state: s.state })));
  const now = useNow(true);
  const ok = v.state === 'connected';
  return (
    <Row onClick={onClick}>
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', ok ? 'bg-ok shadow-[0_0_10px_rgb(var(--ok))]' : 'animate-pulse bg-warn')} />
      <span className="max-w-[150px] truncate text-[13px] font-semibold">{name}</span>
      <SpeakingStack ids={participants} />
      <span className="flex-1" />
      <ReactionChip />
      {(v.selfMute || v.selfDeaf) && <Icon name="micOff" size={14} className="text-danger" />}
      <span className="text-[12px] font-semibold tabular-nums text-white/60">{ok && v.connectedAt ? fmt(now - v.connectedAt) : v.state === 'connecting' ? 'conectando' : 'reconectando'}</span>
    </Row>
  );
}

/** At most one reaction indicator at a time; repeated ones are grouped (×3). */
function ReactionChip() {
  const list = useVoice((v) => v.reactions);
  const last = list[list.length - 1];
  if (!last) return null;
  const same = list.filter((r) => r.emoji === last.emoji).length;
  return (
    <AnimatePresence mode="popLayout">
      <motion.span key={`${last.emoji}${same}`} initial={{ scale: 0.3, opacity: 0, y: 4 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={spring.snappy} className="flex items-center text-[15px] leading-none" aria-label={`Reação ${last.emoji}`}>
        {last.emoji}
        {same > 1 && <span className="ml-0.5 text-[10px] font-bold text-white/70">×{same}</span>}
      </motion.span>
    </AnimatePresence>
  );
}

function SplitCompact({ onClick, np }: { onClick: () => void; np: NowPlaying | null }) {
  const v = useVoice(useShallow((s) => ({ screenSince: s.screenSince })));
  const now = useNow(true);
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1">
        <CallCompact onClick={onClick} />
      </div>
      <motion.div layout className="my-1.5 w-px bg-white/10" />
      {np ? (
        <Row onClick={onClick} className="!w-auto max-w-[160px]">
          <Art np={np} size={20} />
          <span className="truncate text-[12px] font-semibold text-white/80">{np.title}</span>
        </Row>
      ) : (
        <Row onClick={onClick} className="!w-auto">
          <span className="rec-dot h-2 w-2 rounded-full bg-danger" />
          <span className="text-[12px] font-bold tracking-wide text-danger">AO VIVO</span>
          <span className="text-[12px] tabular-nums text-white/60">{v.screenSince ? fmt(now - v.screenSince) : ''}</span>
        </Row>
      )}
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

function CtrlBtn({ icon, label, active, danger, onClick, disabled, pending }: { icon: Parameters<typeof Icon>[0]['name']; label: string; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean; pending?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={spring.snappy}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'relative flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        danger ? 'bg-danger text-white hover:bg-danger/85' : active ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20',
      )}
      aria-busy={pending || undefined}
    >
      {pending && <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-current" style={{ animation: 'cz-spin 0.7s linear infinite' }} />}
      <Icon name={icon} size={19} />
    </motion.button>
  );
}

/** "Sair" needs a deliberate second tap (protects against accidental clicks). */
export function LeaveBtn({ onLeave }: { onLeave: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
      onClick={() => (armed ? onLeave() : setArmed(true))}
      aria-label={armed ? 'Confirmar: sair da call' : 'Sair da call'}
      title={armed ? 'Clique de novo para sair' : 'Sair da call'}
      className={clsx('flex h-11 items-center justify-center gap-1.5 rounded-full bg-danger text-white hover:bg-danger/85', armed ? 'px-4 shadow-[0_0_24px_rgb(var(--danger)/0.7)]' : 'w-11')}
    >
      <Icon name="hangup" size={19} />
      {armed && <span className="whitespace-nowrap text-[12px] font-bold">Sair?</span>}
    </motion.button>
  );
}

function CallExpanded({ onShare }: { onShare: () => void }) {
  const { name, server, participants, channel } = useCallInfo();
  const v = useVoice(useShallow((s) => ({ camera: s.camera, canVideo: s.canVideo, connectedAt: s.connectedAt, pending: s.pending, pingMs: s.pingMs, screen: s.screen, screenInfo: s.screenInfo, screenSince: s.screenSince, screenStats: s.screenStats, selfDeaf: s.selfDeaf, selfMute: s.selfMute })));
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
      {v.screen && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2">
          <span className="rec-dot h-2 w-2 rounded-full bg-danger" />
          <span className="text-[13px] font-bold">Você está ao vivo</span>
          <span className="truncate text-xs tabular-nums text-white/60">
            {v.screenSince ? fmt(now - v.screenSince) : ''}
            {v.screenStats?.height ? ` · ${v.screenStats.height}p · ${v.screenStats.fps} FPS` : v.screenInfo ? ` · ${v.screenInfo}` : ''}
          </span>
          <span className="flex-1" />
          <button className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20" onClick={onShare}>
            Trocar
          </button>
          <button className="rounded-full bg-danger px-2.5 py-1 text-[11px] font-semibold hover:bg-danger/85" onClick={() => void stopScreenShare()}>
            Parar
          </button>
        </div>
      )}
      <div className="mt-4 flex items-center justify-center gap-2.5">
        <CtrlBtn icon={v.selfMute || v.selfDeaf ? 'micOff' : 'mic'} label="Microfone" active={v.selfMute || v.selfDeaf} pending={v.pending.mic} onClick={() => void toggleMute()} />
        <CtrlBtn icon={v.selfDeaf ? 'headphonesOff' : 'headphones'} label="Fones" active={v.selfDeaf} onClick={() => void toggleDeaf()} />
        <CtrlBtn icon={v.camera ? 'camera' : 'cameraOff'} label="Câmera" active={v.camera} disabled={!v.canVideo || v.pending.cam} pending={v.pending.cam} onClick={() => void toggleCamera()} />
        <CtrlBtn icon={v.screen ? 'screenOff' : 'screen'} label="Tela" active={v.screen} disabled={!v.canVideo} onClick={() => (v.screen ? void stopScreenShare() : onShare())} />
        <span className="w-1" />
        <LeaveBtn onLeave={() => (setIslandExpanded(false), void leaveVoice())} />
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
      {ev.channelId && <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', ev.watch ? 'bg-danger text-white' : 'bg-white/10')}>{ev.action ?? 'Abrir'}</span>}
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
