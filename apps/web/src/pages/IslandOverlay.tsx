import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { desktop, type IslandSnapshot } from '@/lib/desktop';
import { useMedia, installMediaBridge } from '@/lib/media';
import { spring } from '@/lib/motion';
import { usePrefs, setPrefs } from '@/lib/prefs';
import { Icon, Logo } from '@/components/common/Icon';
import { MusicCompact, MusicPanel, ResizeGrip, Art, useTicker } from '@/components/island/parts';
import { LeaveBtn } from '@/components/island/LiveIsland';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

function Face({ p, size = 22 }: { p: { name: string; avatarUrl: string | null; color: string; speaking?: boolean }; size?: number }) {
  return (
    <span className={clsx('rounded-full ring-2 ring-black', p.speaking && 'speaking')}>
      {p.avatarUrl ? (
        <img src={p.avatarUrl} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <span className="flex items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: p.color, fontSize: size * 0.42 }}>
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * Floating Live Island (desktop): a transparent always-on-top window at the top of the screen.
 * It has no login or socket of its own — the main window sends it a snapshot and receives commands.
 */
export function IslandOverlay() {
  const [s, setS] = useState<IslandSnapshot | null>(null);
  const np = useMedia((m) => m.np);
  const [open, setOpen] = useState(false);
  const savedWidth = usePrefs((p) => p.islandWidth);
  const [width, setWidth] = useState(savedWidth);
  const leaveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const now = useTicker(!!s?.call);
  const wrap = useRef<HTMLDivElement>(null);

  // Tell the main process our size so the window hugs the capsule (+ room for the glow)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.target.getBoundingClientRect();
      desktop?.setIslandSize(r.width + 28, r.height + 18);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    installMediaBridge();
    return desktop?.onIslandState((st) => {
      setS(st);
      if (st.accent.a) document.documentElement.style.setProperty('--brand', st.accent.a);
      if (st.accent.b) document.documentElement.style.setProperty('--brand-2', st.accent.b);
    });
  }, []);

  const cmd = (type: Parameters<NonNullable<typeof desktop>['sendIslandCommand']>[0]['type'], arg?: string) => desktop?.sendIslandCommand({ type, arg });
  const call = s?.call ?? null;
  const ring = s?.ring ?? null;
  const [auto, setAuto] = useState(false);
  const big = !!ring || open || auto;
  const hovered = useRef(false);

  // Auto-layout: expands by itself for a moment when a call connects, a stream starts or someone rings;
  // closes again on its own (or when the pointer leaves after you interacted).
  const callKey = call ? `${call.name}|${call.state}` : '';
  const prev = useRef({ callKey: '', screen: false });
  useEffect(() => {
    const p = prev.current;
    const started = (!!callKey && callKey !== p.callKey && call?.state === 'connected') || (!!call?.screen && !p.screen);
    prev.current = { callKey, screen: !!call?.screen };
    if (!started || hovered.current) return;
    setAuto(true);
    const t = setTimeout(() => !hovered.current && setAuto(false), 3800);
    return () => clearTimeout(t);
  }, [callKey, call?.screen]);

  // Drag by the surface (not by a tiny grip). The main process moves the window following the real cursor,
  // clamps it to the monitor's work area and snaps magnetically when released. A press without movement is a click.
  const drag = useRef<{ x: number; y: number; on: boolean; raf: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const canDrag = !!desktop?.islandDrag;
  const onDown = (e: React.PointerEvent) => {
    if (!canDrag || e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role=separator]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, on: false, raf: 0 };
    desktop!.islandDrag!('press'); // the main process notes the real cursor now: no pixel of the drag is lost
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 4) {
      d.on = true;
      setDragging(true);
      clearTimeout(leaveT.current); // no hover-expand while it's being dragged
    }
    if (d.on && !d.raf)
      d.raf = requestAnimationFrame(() => {
        if (drag.current) drag.current.raf = 0;
        desktop!.islandDrag!('move');
      });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.on) {
      cancelAnimationFrame(d.raf);
      desktop!.islandDrag!('end');
      setDragging(false);
    } else if (d) desktop!.islandDrag!('cancel');
  };
  const SIZES: Array<[string, number]> = [
    ['Compacta', 340],
    ['Normal', 420],
    ['Grande', 560],
  ];

  return (
    <div className="flex h-screen w-screen justify-center overflow-hidden bg-transparent pt-1.5 text-white">
      <div
        ref={wrap}
        onMouseEnter={() => {
          hovered.current = true;
          clearTimeout(leaveT.current);
          if (!dragging) leaveT.current = setTimeout(() => setOpen(true), 160);
        }}
        onMouseLeave={() => {
          hovered.current = false;
          clearTimeout(leaveT.current);
          if (drag.current?.on) return;
          leaveT.current = setTimeout(() => (setOpen(false), setAuto(false)), 280);
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={clsx('group/island relative h-fit', !canDrag && 'pl-7', canDrag && (dragging ? 'cursor-grabbing' : 'cursor-grab'))}
        data-testid="island-overlay"
      >
        {/* older desktop apps (no surface drag): keep the native grip */}
        {!canDrag && (
          <span className="drag absolute left-0 top-1.5 flex h-6 w-6 cursor-grab items-center justify-center rounded-md bg-black/70 text-white/50 opacity-0 transition-opacity group-hover/island:opacity-100" title="Arraste para mover a ilha">
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              {[2, 7, 12].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}
            </svg>
          </span>
        )}
        <motion.div
          layout="size"
          transition={spring.island}
          animate={{ scale: dragging ? 1.03 : 1 }}
          style={big ? { borderRadius: 26, width: ring ? 400 : width } : { borderRadius: 22 }}
          className={clsx('overflow-hidden border bg-black shadow-[0_14px_40px_-10px_rgb(0_0_0/0.8)]', call || ring ? 'border-brand/45 shadow-glow' : 'border-white/10', !big && 'min-w-[170px] max-w-[480px]', dragging && 'shadow-[0_22px_50px_-12px_rgb(0_0_0/0.9)]')}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={ring ? 'ring' : big ? 'open' : call ? 'call' : 'music'} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.18 }}>
              {ring ? (
                <div className="flex items-center gap-3 p-3.5">
                  <motion.span animate={{ rotate: [0, -8, 8, -6, 6, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 1.1 }}>
                    <Face p={ring} size={44} />
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">{ring.name}</div>
                    <div className="text-xs text-white/60">está te chamando</div>
                  </div>
                  <button onClick={() => cmd('decline', ring.id)} className="flex h-11 w-11 items-center justify-center rounded-full bg-danger active:scale-90" aria-label="Recusar">
                    <Icon name="hangup" size={19} />
                  </button>
                  <button onClick={() => cmd('accept', ring.id)} className="flex h-11 w-11 items-center justify-center rounded-full bg-ok active:scale-90" aria-label="Atender">
                    <Icon name="phone" size={19} />
                  </button>
                </div>
              ) : big ? (
                <div className="p-4 pb-0">
                  {call && (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="tile grad text-white">
                          <Icon name="speaker" size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold">{call.name}</div>
                          <div className="truncate text-xs text-white/55">
                            {call.server ?? 'Chamada privada'} · <span className="tabular-nums">{call.connectedAt ? fmt(now - call.connectedAt) : '—'}</span>
                          </div>
                        </div>
                        <button className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20" onClick={() => cmd('open')}>
                          Abrir app
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {call.participants.map((p) => (
                          <span key={p.id} className={clsx('flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs', p.speaking ? 'bg-ok/20' : 'bg-white/[0.07] text-white/75')}>
                            <Face p={p} size={20} />
                            <span className="max-w-[90px] truncate font-medium">{p.name}</span>
                            {p.muted && <Icon name="micOff" size={11} className="text-danger" />}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-2.5">
                        <Ctl icon={call.selfMute ? 'micOff' : 'mic'} label="Microfone" active={call.selfMute} onClick={() => cmd('mute')} />
                        <Ctl icon={call.selfDeaf ? 'headphonesOff' : 'headphones'} label="Fones" active={call.selfDeaf} onClick={() => cmd('deaf')} />
                        <span className="w-1" />
                        <LeaveBtn onLeave={() => cmd('leave')} />
                      </div>
                    </>
                  )}
                  {np && (
                    <div className={clsx(call && 'mt-3 border-t border-white/[0.08] pt-3')}>
                      <MusicPanel np={np} onCmd={(c) => cmd('media', c)} compact={!!call} />
                    </div>
                  )}
                  {!call && !np && (
                    <div className="flex items-center gap-2 pb-3 text-sm text-white/60">
                      <Logo size={16} /> Nada acontecendo agora
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                    {SIZES.map(([label, w]) => (
                      <button key={label} aria-pressed={Math.abs(width - w) < 8} className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', Math.abs(width - w) < 8 ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20')} onClick={() => (setWidth(w), setPrefs({ islandWidth: w }))}>
                        {label}
                      </button>
                    ))}
                    <span className="w-1" />
                    <button className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/20" onClick={() => cmd('resetPos')}>
                      <Icon name="arrowLeft" size={12} className="rotate-90" /> Centralizar no topo
                    </button>
                  </div>
                  <ResizeGrip width={width} onWidth={setWidth} onCommit={(w) => setPrefs({ islandWidth: w })} />
                </div>
              ) : call ? (
                <div className="flex h-9 items-center gap-2.5 whitespace-nowrap px-3.5">
                  <span className={clsx('h-2 w-2 rounded-full', call.state === 'connected' ? 'bg-ok shadow-[0_0_10px_rgb(var(--ok))]' : 'animate-pulse bg-warn')} />
                  <span className="max-w-[140px] truncate text-[13px] font-semibold">{call.name}</span>
                  <span className="flex -space-x-1.5">
                    {[...call.participants]
                      .sort((a, b) => Number(b.speaking) - Number(a.speaking))
                      .slice(0, 3)
                      .map((p) => (
                        <Face key={p.id} p={p} size={20} />
                      ))}
                  </span>
                  {call.selfMute && <Icon name="micOff" size={14} className="text-danger" />}
                  <span className="text-[12px] tabular-nums text-white/60">{call.connectedAt ? fmt(now - call.connectedAt) : ''}</span>
                  {np && (
                    <>
                      <span className="h-5 w-px bg-white/15" />
                      <Art np={np} size={20} />
                    </>
                  )}
                </div>
              ) : np ? (
                <div className="flex h-9 items-center px-3.5">
                  <MusicCompact np={np} />
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function Ctl({ icon, label, onClick, active, danger }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={spring.snappy}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx('flex h-11 w-11 items-center justify-center rounded-full transition-colors', danger ? 'bg-danger hover:bg-danger/85' : active ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
    >
      <Icon name={icon} size={19} />
    </motion.button>
  );
}
