import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { toast } from '../common/overlay';
import { Icon } from '../common/Icon';

const MAX_MS = 10 * 60_000;
const BARS = 64;
const MIME = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export interface VoiceClip {
  file: File;
  durationMs: number;
  waveform: string; // base64 of BARS bytes (0–255)
}

type Phase = 'idle' | 'holding' | 'locked';

/**
 * Records a voice message with the real microphone level as waveform.
 * Touch: hold to record · slide left to cancel · slide up to lock (then send/discard with buttons).
 * Mouse: click starts a locked recording.
 */
export function useVoiceRecorder(onClip: (c: VoiceClip) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState<number[]>([]);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; chunks: Blob[]; peaks: number[]; started: number; timer: ReturnType<typeof setInterval>; cancel: boolean } | null>(null);

  const cleanup = () => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => {});
    rec.current = null;
  };
  useEffect(() => cleanup, []);

  async function start(mode: Phase) {
    if (rec.current || typeof MediaRecorder === 'undefined') {
      if (typeof MediaRecorder === 'undefined') toast('Este navegador não grava áudio.', 'error');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      toast((e as Error).name === 'NotAllowedError' ? 'Permita o microfone para gravar áudio.' : 'Não foi possível usar o microfone.', 'error');
      return;
    }
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const r = { mr, stream, ctx, chunks: [] as Blob[], peaks: [] as number[], started: Date.now(), timer: 0 as unknown as ReturnType<typeof setInterval>, cancel: false };
    mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
    mr.onstop = () => {
      const durationMs = Date.now() - r.started;
      const type = mr.mimeType || mimeType || 'audio/webm';
      cleanup();
      setPhase('idle');
      setLevel([]);
      setElapsed(0);
      if (r.cancel) return;
      if (durationMs < 700) return toast('Segure o microfone para gravar.');
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(r.chunks, { type: type.split(';')[0] });
      // downsample the recorded peaks into BARS bars
      const out = new Uint8Array(BARS);
      const n = r.peaks.length || 1;
      const top = Math.max(0.04, ...r.peaks); // normalize to this recording's loudest moment
      for (let i = 0; i < BARS; i++) {
        const a = Math.floor((i * n) / BARS);
        const b = Math.max(a + 1, Math.floor(((i + 1) * n) / BARS));
        let m = 0;
        for (let j = a; j < b; j++) m = Math.max(m, r.peaks[j] ?? 0);
        out[i] = Math.round(Math.min(1, m / top) * 255);
      }
      const waveform = btoa(String.fromCharCode(...out));
      onClip({ file: new File([blob], `mensagem-de-voz.${ext}`, { type: blob.type }), durationMs, waveform });
    };
    r.timer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      r.peaks.push(peak);
      setLevel((l) => [...l.slice(-39), peak]);
      const t = Date.now() - r.started;
      setElapsed(t);
      if (t >= MAX_MS) stop(false);
    }, 100);
    rec.current = r;
    mr.start(250);
    setPhase(mode);
    navigator.vibrate?.(15);
  }

  function stop(cancel: boolean) {
    const r = rec.current;
    if (!r) return;
    r.cancel = cancel;
    if (r.mr.state !== 'inactive') r.mr.stop();
    else cleanup();
  }

  /** pointer handlers for the mic button */
  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return void start('locked');
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const sx = e.clientX;
      const sy = e.clientY;
      void start('holding');
      const move = (ev: PointerEvent) => {
        const dx = Math.min(0, ev.clientX - sx);
        const dy = Math.min(0, ev.clientY - sy);
        setDrag({ dx, dy });
        if (dx < -110) {
          stop(true);
          finish();
          navigator.vibrate?.([10, 40, 10]);
        } else if (dy < -80 && rec.current) {
          setPhase('locked');
          finish();
          navigator.vibrate?.(15);
        }
      };
      const up = () => {
        finish();
        // released while holding → send
        setPhase((p) => {
          if (p === 'holding') stop(false);
          return p;
        });
      };
      const finish = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setDrag({ dx: 0, dy: 0 });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  };

  return { phase, elapsed, level, drag, bind, send: () => stop(false), discard: () => stop(true) };
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The bar that replaces the text field while recording. */
export function RecordingBar({ r }: { r: ReturnType<typeof useVoiceRecorder> }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring.snappy} className="flex min-h-[44px] flex-1 items-center gap-3 py-1.5" role="status" aria-live="polite">
      <span className="rec-dot h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
      <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-fg-strong">{fmt(r.elapsed)}</span>
      <span className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
        {(() => {
          const top = Math.max(0.03, ...r.level);
          return r.level.map((v, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-danger/80 transition-[height] duration-100" style={{ height: `${Math.max(10, Math.min(100, (v / top) * 100))}%` }} />);
        })()}
      </span>
      <AnimatePresence mode="popLayout">
        {r.phase === 'holding' ? (
          <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1, x: r.drag.dx / 3 }} exit={{ opacity: 0 }} className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
            <Icon name="chevronDown" size={14} className="rotate-90" /> deslize para cancelar
          </motion.span>
        ) : (
          <motion.button key="trash" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.snappy} onClick={r.discard} aria-label="Descartar áudio" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/15">
            <Icon name="trash" size={19} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Mic ↔ send, like WhatsApp: empty field = mic (record), typing = send. */
export function SendOrMic({ canSend, onSend, recorder, canRecord }: { canSend: boolean; onSend: () => void; recorder: ReturnType<typeof useVoiceRecorder>; canRecord: boolean }) {
  const locked = recorder.phase === 'locked';
  const holding = recorder.phase === 'holding';
  const showSend = canSend || locked || !canRecord;
  return (
    <span className="relative mb-0.5 mt-auto flex shrink-0 items-center self-end">
      <AnimatePresence>
        {holding && (
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -6 + recorder.drag.dy / 4 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full border border-line/10 bg-bg-float px-2 py-2 text-fg-muted shadow-float" aria-hidden>
            <Icon name="lock" size={15} />
            <Icon name="chevronDown" size={14} className="rotate-180" />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        {showSend ? (
          <motion.button
            key="send"
            initial={{ scale: 0.4, rotate: -45, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.snappy}
            whileTap={{ scale: 0.88 }}
            disabled={!canSend && !locked}
            onClick={locked ? recorder.send : onSend}
            aria-label={locked ? 'Enviar áudio' : 'Enviar mensagem'}
            className="grad flex h-11 w-11 items-center justify-center rounded-full text-white shadow-glow disabled:opacity-40"
          >
            <Icon name="send" size={19} />
          </motion.button>
        ) : (
          <motion.button
            key="mic"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: holding ? 1.35 : 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.snappy}
            {...recorder.bind}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Gravar mensagem de voz (segure; no PC, clique)"
            title="Gravar áudio"
            className={clsx('flex h-11 w-11 touch-none select-none items-center justify-center rounded-full transition-colors', holding ? 'bg-danger text-white shadow-[0_0_24px_rgb(var(--danger)/0.6)]' : 'bg-line/[0.08] text-fg-muted hover:bg-brand/20 hover:text-brand')}
          >
            <Icon name="mic" size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </span>
  );
}
