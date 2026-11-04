import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '@/store';
import { useVoice, sendReaction, REACTIONS, type LiveReaction } from '@/lib/voice';
import { trackVoiceLevel } from '@/lib/voiceLevel';
import { spring, dur } from '@/lib/motion';
import { usePrefs } from '@/lib/prefs';
import { Avatar } from '../common/Avatar';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/mobile';
import { Icon } from '../common/Icon';

const NONE: LiveReaction[] = [];

/** Reactions from one person, popping out of their avatar (grouped when repeated). */
export function ReactionBurst({ identity, size }: { identity: string; size: number }) {
  const list = useVoice((v) => (v.reactions.some((r) => r.from === identity) ? v.reactions : NONE));
  const mine = list.filter((r) => r.from === identity).slice(-3);
  return (
    <span className="pointer-events-none absolute inset-x-0 -top-1 flex justify-center" aria-hidden>
      <AnimatePresence>
        {mine.map((r, i) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0, y: 6, scale: 0.4 }}
            animate={{ opacity: 1, y: -size * 0.45 - i * 6, scale: 1, transition: { ...spring.snappy } }}
            exit={{ opacity: 0, y: -size * 0.75, transition: { duration: dur.short } }}
            className="absolute select-none drop-shadow-[0_4px_10px_rgb(0_0_0/0.5)]"
            style={{ fontSize: Math.max(18, size * 0.42), left: `calc(50% + ${(i - 1) * size * 0.22}px)`, translateX: '-50%' }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

/**
 * A person, not a static dot: real voice ring (smoothed), clear mute/deaf/live badges that don't depend on
 * color alone, and their reactions.
 */
export function LiveAvatar({ identity, size = 48, showBadges = true }: { identity: string; size?: number; showBadges?: boolean }) {
  const ring = useRef<HTMLSpanElement>(null);
  const vs = useStore((s) => s.voiceStates[identity]);
  const muted = !!(vs?.selfMute || vs?.serverMute);
  const deaf = !!(vs?.selfDeaf || vs?.serverDeaf);
  useEffect(() => (ring.current ? trackVoiceLevel(identity, ring.current) : undefined), [identity]);
  const badge = Math.max(16, Math.round(size * 0.34));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        ref={ring}
        className="pointer-events-none absolute -inset-[4px] rounded-full border-[2.5px] border-ok shadow-[0_0_18px_rgb(var(--ok)/0.55)] transition-[border-color] duration-150 will-change-transform"
        style={{ opacity: 0 }}
      />
      <span className={clsx('rounded-full transition-[filter,opacity] duration-200', muted && 'opacity-80 saturate-50')}>
        <Avatar userId={identity} size={size} />
      </span>
      {showBadges && (muted || deaf) && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring.snappy}
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-danger text-white ring-2 ring-bg-side"
          style={{ width: badge, height: badge }}
          title={deaf ? 'Sem áudio' : 'Microfone desligado'}
          aria-label={deaf ? 'Sem áudio' : 'Microfone desligado'}
        >
          <Icon name={deaf ? 'headphonesOff' : 'micOff'} size={Math.round(badge * 0.6)} strokeWidth={2.6} />
        </motion.span>
      )}
      {showBadges && vs?.streaming &&
        (size >= 64 ? (
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-danger px-1.5 text-[10px] font-black leading-[16px] tracking-wide text-white ring-2 ring-bg-side">AO VIVO</span>
        ) : (
          <span className="absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-danger ring-2 ring-bg-side" style={{ width: badge * 0.8, height: badge * 0.8 }} title="Transmitindo" aria-label="Transmitindo">
            <Icon name="screen" size={Math.round(badge * 0.46)} strokeWidth={2.6} className="text-white" />
          </span>
        ))}
      <ReactionBurst identity={identity} size={size} />
    </span>
  );
}

/** Reaction menu (opens above the dock button; Alt+1…8 also work). */
export function ReactionPicker({ onClose }: { onClose: () => void }) {
  const mobile = useIsMobile();
  if (mobile) return <ReactionSheet onClose={onClose} />;
  return <ReactionPopover onClose={onClose} />;
}

/** Phones: a bottom sheet with big targets (doesn't cover the video controls). */
function ReactionSheet({ onClose }: { onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  return createPortal(
    <motion.div className="fixed inset-0 z-[75] flex items-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="menu"
        aria-label="Reações"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: dur.short } }}
        transition={{ duration: dur.spatial, ease: [0.22, 1, 0.36, 1] }}
        className="w-full rounded-t-[26px] border border-line/10 bg-bg-float px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line/20" />
        <div className="grid grid-cols-4 gap-2">
          {REACTIONS.map((e) => (
            <motion.button
              key={e}
              role="menuitem"
              whileTap={{ scale: 0.85 }}
              transition={spring.snappy}
              aria-label={`Reagir com ${e}`}
              className="flex h-16 items-center justify-center rounded-2xl bg-line/[0.05] text-[30px] active:bg-line/[0.12]"
              onClick={async () => {
                const ok = await sendReaction(e);
                if (!ok) {
                  setBlocked(true);
                  setTimeout(() => setBlocked(false), 900);
                } else onClose();
              }}
            >
              {e}
            </motion.button>
          ))}
        </div>
        <div className="mt-2 h-4 text-center text-xs text-fg-faint">{blocked ? 'Calma! Espere um instante.' : ''}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ReactionPopover({ onClose }: { onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const enabled = usePrefs((p) => p.reactionsEnabled);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down));
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <motion.div
      ref={box}
      role="menu"
      aria-label="Reações"
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: dur.instant } }}
      transition={{ duration: dur.short, ease: [0.2, 0.9, 0.3, 1.2] }}
      style={{ transformOrigin: '50% 100%' }}
      className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-line/[0.1] bg-bg-float/95 p-1.5 shadow-float"
    >
      <div className="flex gap-0.5">
        {REACTIONS.map((e, i) => (
          <motion.button
            key={e}
            role="menuitem"
            whileHover={{ scale: 1.25, y: -3 }}
            whileTap={{ scale: 0.85 }}
            transition={spring.snappy}
            title={`Alt+${i + 1}`}
            aria-label={`Reagir com ${e} (Alt+${i + 1})`}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px] hover:bg-line/[0.08]"
            onClick={async () => {
              const ok = await sendReaction(e);
              if (!ok) {
                setBlocked(true);
                setTimeout(() => setBlocked(false), 900);
              }
            }}
          >
            {e}
          </motion.button>
        ))}
      </div>
      <div className="h-4 px-1 text-center text-[10.5px] text-fg-faint">{blocked ? 'Calma! Espere um instante.' : enabled ? 'Alt+1…8 também funciona' : 'Você desativou a exibição de reações'}</div>
    </motion.div>
  );
}
