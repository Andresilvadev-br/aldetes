import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { desktop, type UpdateState } from '@/lib/desktop';
import { useVoice } from '@/lib/voice';
import { spring } from '@/lib/motion';
import { Icon, Logo } from './Icon';

const mb = (b: number) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const eta = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);
const RESTART_IN = 4;

/**
 * Desktop update flow, start to finish:
 * popup "nova versão" → full-screen download with live progress → countdown → the app restarts itself.
 * "Depois" downloads quietly (small pill in the corner) and installs when the app closes.
 */
export function UpdateCenter() {
  const [s, setS] = useState<UpdateState | null>(null);
  const notes = useRef<string[]>([]);
  useEffect(() => {
    if (!desktop?.onUpdate) return;
    void desktop.getUpdateState?.().then(setS);
    return desktop.onUpdate(setS);
  }, []);
  if (s?.phase === 'available') notes.current = s.notes;
  if (!s || !desktop?.downloadUpdate) return null;

  const fg = (s.phase === 'downloading' || s.phase === 'ready') && !s.background;
  return createPortal(
    <>
      <AnimatePresence>{s.phase === 'available' && <UpdatePopup key="popup" s={s} />}</AnimatePresence>
      <AnimatePresence>{(fg || s.phase === 'installing') && <UpdateScreen key="screen" s={s} notes={notes.current} />}</AnimatePresence>
      <AnimatePresence>{(s.phase === 'downloading' || s.phase === 'ready') && s.background && <UpdatePill key="pill" s={s} />}</AnimatePresence>
      <AnimatePresence>{s.phase === 'error' && <UpdateError key="err" s={s} />}</AnimatePresence>
    </>,
    document.body,
  );
}

function UpdatePopup({ s }: { s: Extract<UpdateState, { phase: 'available' }> }) {
  const inCall = useVoice((v) => !!v.channelId);
  return (
    <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        role="dialog"
        aria-modal
        aria-label="Atualização disponível"
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={spring.gentle}
        className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border border-line/[0.08] bg-bg-side shadow-float"
      >
        {/* hero */}
        <div className="relative flex h-40 items-center justify-center overflow-hidden">
          <div className="cz">
            <span className="left-[-10%] top-[-50%] h-[160%] w-[60%] rounded-full bg-[rgb(var(--brand)/0.55)] blur-3xl" style={{ animation: 'cz-blob 9s ease-in-out infinite' }} />
            <span className="right-[-10%] top-[-30%] h-[150%] w-[60%] rounded-full bg-[rgb(var(--brand-2)/0.5)] blur-3xl" style={{ animation: 'cz-blob 12s ease-in-out infinite reverse' }} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg-side" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute h-20 w-20 rounded-full border border-white/30" style={{ animation: `cz-pulse-ring 2.4s ease-out ${i * 0.8}s infinite` }} />
          ))}
          <motion.span initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.gentle, delay: 0.1 }} className="relative flex h-20 w-20 items-center justify-center rounded-[26px] bg-black/60 shadow-glow backdrop-blur">
            <Logo size={44} />
          </motion.span>
        </div>
        <div className="relative px-7 pb-7">
          <div className="flex items-center justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-line/[0.07] px-2.5 py-1 tabular-nums text-fg-muted">v{s.current}</span>
            <Icon name="chevronRight" size={14} className="text-fg-faint" />
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.snappy, delay: 0.25 }} className="grad rounded-full px-2.5 py-1 tabular-nums text-white shadow-glow">
              v{s.version}
            </motion.span>
          </div>
          <h2 className="mt-3 text-center text-[24px] font-black tracking-tight text-fg-strong">Nova versão chegou!</h2>
          <p className="mt-1 text-center text-sm text-fg-muted">
            Leva só alguns instantes{s.sizeMB ? ` (${s.sizeMB} MB)` : ''}. O Aldetes reinicia sozinho quando terminar.
          </p>
          {s.notes.length > 0 && (
            <ul className="scroll-thin mt-5 max-h-40 space-y-1.5 overflow-y-auto rounded-2xl border border-line/[0.07] bg-line/[0.03] p-3.5">
              {s.notes.map((n, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: 0.2 + i * 0.05 }} className="flex gap-2 text-[13px] text-fg">
                  <span className="grad mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  {n}
                </motion.li>
              ))}
            </ul>
          )}
          {inCall && (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
              <Icon name="phone" size={14} /> Você está numa call: ela cai durante a reinicialização (uns 10 segundos).
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <motion.button whileTap={{ scale: 0.97 }} className="btn-primary h-12 text-[15px]" onClick={() => desktop!.downloadUpdate!(false)} autoFocus>
              <Icon name="download" size={18} /> Atualizar agora
            </motion.button>
            <button className="btn-ghost h-10 text-sm text-fg-muted" onClick={() => desktop!.downloadUpdate!(true)} title="Baixa em segundo plano e instala quando você fechar o app">
              Depois (instala quando eu fechar o app)
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Progress ring around the logo; the number counts smoothly instead of jumping. */
function Ring({ percent, done }: { percent: number; done: boolean }) {
  const R = 88;
  const C = 2 * Math.PI * R;
  const mv = useMotionValue(0);
  const dash = useTransform(mv, (p) => C - (C * p) / 100);
  const label = useTransform(mv, (p) => `${Math.floor(p)}`);
  useEffect(() => {
    const c = animate(mv, done ? 100 : percent, { type: 'spring', stiffness: 60, damping: 18 });
    return () => c.stop();
  }, [percent, done, mv]);
  return (
    <div className="relative h-[220px] w-[220px]">
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90 overflow-visible">
        <defs>
          <linearGradient id="upd-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" />
            <stop offset="100%" stopColor="rgb(var(--brand-2))" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--line) / 0.08)" strokeWidth="8" />
        <motion.circle cx="100" cy="100" r={R} fill="none" stroke="url(#upd-grad)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} style={{ strokeDashoffset: dash, filter: 'drop-shadow(0 0 10px rgb(var(--brand) / 0.7))' }} />
      </svg>
      {!done && <span className="absolute inset-[18px] rounded-full border-2 border-dashed border-line/10" style={{ animation: 'cz-spin 14s linear infinite' }} />}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {done ? (
            <motion.span key="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={spring.snappy} className="flex h-20 w-20 items-center justify-center rounded-full bg-ok text-black shadow-[0_0_40px_rgb(var(--ok)/0.6)]">
              <Icon name="check" size={40} strokeWidth={3} />
            </motion.span>
          ) : (
            <motion.div key="pct" exit={{ scale: 0.6, opacity: 0 }} className="flex flex-col items-center">
              <Logo size={34} />
              <span className="mt-2 flex items-baseline text-[44px] font-black tabular-nums leading-none text-fg-strong">
                <motion.span>{label}</motion.span>
                <span className="ml-0.5 text-xl text-fg-muted">%</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function UpdateScreen({ s, notes }: { s: UpdateState; notes: string[] }) {
  const ready = s.phase === 'ready';
  const installing = s.phase === 'installing';
  const [left, setLeft] = useState(RESTART_IN);
  const [tip, setTip] = useState(0);
  const version = 'version' in s ? s.version : '';

  // Countdown → restart into the new version.
  useEffect(() => {
    if (!ready) return;
    setLeft(RESTART_IN);
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [ready]);
  useEffect(() => {
    if (ready && left <= 0) desktop?.installUpdate?.();
  }, [ready, left]);
  // Rotate through what's new while waiting.
  useEffect(() => {
    if (notes.length < 2) return;
    const t = setInterval(() => setTip((i) => (i + 1) % notes.length), 3500);
    return () => clearInterval(t);
  }, [notes.length]);

  const d = s.phase === 'downloading' ? s : null;
  const pct = d ? d.percent : ready || installing ? 100 : 0;
  const status = installing ? 'Instalando… o Aldetes abre sozinho em seguida' : ready ? `Tudo pronto! Reiniciando em ${Math.max(0, left)}…` : d && d.total ? 'Baixando a nova versão' : 'Preparando o download…';

  return (
    <motion.div className="fixed inset-0 z-[95] flex flex-col items-center justify-center overflow-hidden bg-bg-rail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} role="dialog" aria-label="Atualização em andamento">
      <div className="cz">
        <span className="left-[5%] top-[10%] h-[60vh] w-[60vh] rounded-full bg-[rgb(var(--brand)/0.18)] blur-[100px]" style={{ animation: 'cz-blob 16s ease-in-out infinite' }} />
        <span className="bottom-[0%] right-[5%] h-[55vh] w-[55vh] rounded-full bg-[rgb(var(--brand-2)/0.16)] blur-[100px]" style={{ animation: 'cz-blob 20s ease-in-out infinite reverse' }} />
      </div>
      {/* the draggable strip keeps the frameless window movable */}
      <div className="drag absolute inset-x-0 top-0 h-10" />

      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.gentle} className="relative flex flex-col items-center px-6 text-center">
        <span className="eyebrow mb-6 rounded-full border border-line/10 bg-line/[0.04] px-3 py-1 !text-fg-muted">
          Atualizando para <b className="grad-text">v{version}</b>
        </span>
        <Ring percent={pct} done={ready || installing} />
        <AnimatePresence mode="wait">
          <motion.h2 key={status.replace(/\d/g, '')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="mt-8 text-[22px] font-black tracking-tight text-fg-strong">
            {status}
          </motion.h2>
        </AnimatePresence>
        <p className="mt-1.5 h-5 text-sm tabular-nums text-fg-muted">
          {d && d.total > 0 && (
            <>
              {mb(d.transferred)} de {mb(d.total)} MB
              {d.bytesPerSecond > 0 && ` · ${mb(d.bytesPerSecond)} MB/s · faltam ~${eta((d.total - d.transferred) / d.bytesPerSecond)}`}
            </>
          )}
        </p>
        {/* linear bar with a running shimmer */}
        <div className="relative mt-5 h-1.5 w-[320px] max-w-[80vw] overflow-hidden rounded-full bg-line/[0.08]">
          <motion.div className="grad absolute inset-y-0 left-0 rounded-full" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
          {!ready && !installing && <span className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" style={{ animation: 'cz-drift 1.6s linear infinite' }} />}
        </div>

        {notes.length > 0 && (
          <div className="mt-8 h-12 w-[420px] max-w-[85vw]">
            <div className="eyebrow mb-1">Novidades</div>
            <AnimatePresence mode="wait">
              <motion.p key={tip} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.gentle} className="truncate text-sm text-fg">
                {notes[tip % notes.length]}
              </motion.p>
            </AnimatePresence>
          </div>
        )}

        <div className="mt-8 flex h-10 gap-2">
          {ready && (
            <motion.button initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy} className="btn-primary" onClick={() => desktop?.installUpdate?.()}>
              Reiniciar agora
            </motion.button>
          )}
          {!installing && (
            <button className="btn-ghost text-sm text-fg-muted" onClick={() => desktop?.downloadUpdate?.(true)}>
              {ready ? 'Reiniciar depois' : 'Continuar usando o app'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Background download: a small ring in the corner; click to bring the full view back. */
function UpdatePill({ s }: { s: Extract<UpdateState, { phase: 'downloading' | 'ready' }> }) {
  const ready = s.phase === 'ready';
  const pct = s.phase === 'downloading' ? s.percent : 100;
  const C = 2 * Math.PI * 9;
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }} transition={spring.gentle} className="fixed bottom-4 right-4 z-[80]">
      <div className={clsx('flex items-center gap-3 rounded-2xl border bg-bg-float/95 py-2 pl-2.5 pr-2 shadow-float', ready ? 'border-ok/30' : 'border-line/10')}>
        <button className="flex items-center gap-2.5 text-left" onClick={() => desktop?.showUpdateProgress?.()} title="Ver o progresso">
          <svg width="26" height="26" viewBox="0 0 24 24" className="-rotate-90">
            <circle cx="12" cy="12" r="9" fill="none" stroke="rgb(var(--line) / 0.12)" strokeWidth="3" />
            <motion.circle cx="12" cy="12" r="9" fill="none" stroke={ready ? 'rgb(var(--ok))' : 'rgb(var(--brand))'} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} animate={{ strokeDashoffset: C - (C * pct) / 100 }} />
          </svg>
          <span className="leading-tight">
            <span className="block text-[13px] font-bold text-fg-strong">{ready ? `v${s.version} pronta` : `Baixando v${s.version}`}</span>
            <span className="block text-[11px] text-fg-muted">{ready ? 'instala quando você fechar o app' : `${Math.floor(pct)}%`}</span>
          </span>
        </button>
        {ready && (
          <button className="btn-primary h-8 px-3 text-xs" onClick={() => desktop?.installUpdate?.()}>
            Reiniciar
          </button>
        )}
      </div>
    </motion.div>
  );
}

function UpdateError({ s }: { s: Extract<UpdateState, { phase: 'error' }> }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={spring.gentle} className="fixed bottom-4 right-4 z-[96] w-[340px] rounded-2xl border border-danger/30 bg-bg-float/95 p-4 shadow-float" role="alert">
      <div className="flex items-start gap-3">
        <span className="tile bg-danger/15 text-danger">
          <Icon name="download" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-fg-strong">Não deu para atualizar</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{s.message}</div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary h-8 px-3 text-xs" onClick={() => desktop?.downloadUpdate?.(false)}>
              Tentar de novo
            </button>
            <button className="btn-ghost h-8 px-3 text-xs" onClick={() => setHidden(true)}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
