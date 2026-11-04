import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import type { Attachment } from '@aldetes/shared';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const SPEEDS = [1, 1.5, 2] as const;
let current: HTMLAudioElement | null = null; // only one voice message plays at a time

/** WhatsApp-style voice message: play/pause, real waveform (tap/drag to seek), time, 1x / 1,5x / 2x. */
export function VoiceMessage({ a }: { a: Attachment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // 0..1
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [dur, setDur] = useState(a.durationMs ?? 0);
  const bars = a.waveform?.length ? a.waveform : Array.from({ length: 48 }, (_, i) => 60 + ((i * 37) % 90));

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (el.duration && Number.isFinite(el.duration)) setPos(el.currentTime / el.duration);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (current && current !== el) current.pause();
      current = el;
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    const onEnd = () => {
      onPause();
      setPos(0);
    };
    const onMeta = () => Number.isFinite(el.duration) && el.duration > 0 && setDur(el.duration * 1000);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  const toggle = () => {
    const el = audio.current!;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  const seek = (clientX: number, box: DOMRect) => {
    const el = audio.current!;
    const p = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    if (el.duration && Number.isFinite(el.duration)) el.currentTime = p * el.duration;
    setPos(p);
  };

  return (
    <div className="flex w-full max-w-[360px] items-center gap-3 rounded-2xl border border-line/[0.07] bg-line/[0.03] py-2 pl-2 pr-3" role="group" aria-label="Mensagem de voz">
      <audio ref={audio} src={a.url} preload="metadata" />
      <motion.button
        whileTap={{ scale: 0.88 }}
        transition={spring.snappy}
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Ouvir'}
        className="grad flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-glow"
      >
        <Icon name={playing ? 'pause' : 'play'} size={18} strokeWidth={0} fill="currentColor" />
      </motion.button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-8 cursor-pointer touch-none items-center gap-[2px]"
          role="slider"
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos * 100)}
          tabIndex={0}
          onKeyDown={(e) => {
            const el = audio.current!;
            if (e.key === 'ArrowRight') el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
            if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5);
            if (e.key === ' ' || e.key === 'Enter') (e.preventDefault(), toggle());
          }}
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            seek(e.clientX, box);
            const move = (ev: PointerEvent) => seek(ev.clientX, box);
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          {bars.map((b, i) => {
            const on = i / bars.length < pos;
            return <span key={i} className={clsx('w-[3px] min-w-[2px] flex-1 rounded-full transition-colors duration-150', on ? 'bg-brand' : 'bg-fg-faint/45')} style={{ height: `${Math.max(12, (b / 255) * 100)}%` }} />;
          })}
        </div>
        <div className="mt-0.5 flex items-center text-[11px] tabular-nums text-fg-muted">
          {fmt(playing || pos > 0 ? pos * dur : dur)}
          <span className="flex-1" />
          <button
            className="rounded-md bg-line/[0.08] px-1.5 py-0.5 text-[10.5px] font-bold text-fg hover:bg-line/[0.14]"
            aria-label={`Velocidade ${speed}x`}
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
              setSpeed(next);
              if (audio.current) audio.current.playbackRate = next;
            }}
          >
            {String(speed).replace('.', ',')}x
          </button>
        </div>
      </div>
    </div>
  );
}
