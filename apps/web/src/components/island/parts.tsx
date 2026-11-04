import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import type { NowPlaying } from '@/lib/desktop';
import { fmtMs, mediaPosition } from '@/lib/media';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';

export function useTicker(active: boolean, every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

export function Art({ np, size = 22, rounded = 'rounded-md' }: { np: NowPlaying; size?: number; rounded?: string }) {
  return np.art ? (
    <img src={np.art} alt="" className={clsx('shrink-0 object-cover', rounded, np.playing ? '' : 'opacity-70 grayscale-[30%]')} style={{ width: size, height: size }} />
  ) : (
    <span className={clsx('grad flex shrink-0 items-center justify-center text-white', rounded)} style={{ width: size, height: size }}>
      <Icon name="volume" size={Math.round(size * 0.55)} />
    </span>
  );
}

/** Compact: cover + title, play state. */
export function MusicCompact({ np }: { np: NowPlaying }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Art np={np} />
      <span className="max-w-[220px] truncate text-[13px] font-semibold">{np.title}</span>
      {np.artist && <span className="hidden max-w-[120px] truncate text-[12px] text-white/50 sm:inline">{np.artist}</span>}
      <Icon name={np.playing ? 'volume' : 'volumeOff'} size={14} className={np.playing ? 'text-brand' : 'text-white/40'} />
    </span>
  );
}

function MediaBtn({ icon, label, onClick, big, disabled }: { icon: Parameters<typeof Icon>[0]['name'] | 'play' | 'pause'; label: string; onClick: () => void; big?: boolean; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      transition={spring.snappy}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx('flex items-center justify-center rounded-full transition-colors disabled:opacity-30', big ? 'h-11 w-11 bg-white text-black hover:bg-white/90' : 'h-9 w-9 text-white hover:bg-white/10')}
    >
      {icon === 'play' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
      ) : icon === 'pause' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1.2" />
          <rect x="14" y="5" width="4" height="14" rx="1.2" />
        </svg>
      ) : (
        <Icon name={icon} size={18} />
      )}
    </motion.button>
  );
}

const SkipIcon = ({ dir }: { dir: 'next' | 'prev' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={dir === 'prev' ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83L15 13v4.8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V6.2a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1V11L6.55 5.37A1 1 0 0 0 5 6.2Z" />
  </svg>
);

/** Expanded: big cover, title/artist/app, progress and prev/play/next. */
export function MusicPanel({ np, onCmd, compact }: { np: NowPlaying; onCmd: (c: 'toggle' | 'next' | 'prev') => void; compact?: boolean }) {
  const now = useTicker(np.playing, 500);
  const pos = mediaPosition(np, now);
  return (
    <div className={clsx('flex items-center gap-3', compact ? 'p-0' : 'p-1')}>
      <Art np={np} size={compact ? 40 : 56} rounded="rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold">{np.title}</div>
        <div className="truncate text-[12px] text-white/55">
          {np.artist || 'Artista desconhecido'} · {np.app}
        </div>
        {pos !== null && np.durationMs ? (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] tabular-nums text-white/45">
            <span>{fmtMs(pos)}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <span className="grad block h-full rounded-full transition-[width] duration-500 ease-linear" style={{ width: `${(pos / np.durationMs) * 100}%` }} />
            </span>
            <span>{fmtMs(np.durationMs)}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center">
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 disabled:opacity-30" disabled={!np.canPrev} aria-label="Anterior" onClick={() => onCmd('prev')}>
          <SkipIcon dir="prev" />
        </button>
        <MediaBtn big icon={np.playing ? 'pause' : 'play'} label={np.playing ? 'Pausar' : 'Tocar'} onClick={() => onCmd('toggle')} />
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 disabled:opacity-30" disabled={!np.canNext} aria-label="Próxima" onClick={() => onCmd('next')}>
          <SkipIcon dir="next" />
        </button>
      </div>
    </div>
  );
}

/** Drag handle under the expanded island: drag sideways to resize (symmetrically). */
export function ResizeGrip({ width, onWidth, onCommit }: { width: number; onWidth: (w: number) => void; onCommit: (w: number) => void }) {
  return (
    <div
      role="separator"
      aria-label="Redimensionar a Live Island"
      title="Arraste para os lados para redimensionar"
      className="group flex h-4 cursor-ew-resize items-center justify-center"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const start = width;
        let w = start;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          w = Math.round(Math.min(640, Math.max(340, start + (ev.clientX - startX) * 2)));
          onWidth(w);
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          onCommit(w);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    >
      <span className="h-1 w-10 rounded-full bg-white/20 transition-all group-hover:w-14 group-hover:bg-white/45" />
    </div>
  );
}
