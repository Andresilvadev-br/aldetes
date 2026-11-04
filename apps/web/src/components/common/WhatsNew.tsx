import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '@/store';
import { useVoice } from '@/lib/voice';
import { usePrefs, setPrefs, getPrefs, HAD_PREFS } from '@/lib/prefs';
import { desktop } from '@/lib/desktop';
import { RELEASES, releaseFor, type Release } from '@/lib/changelog';
import { useIsMobile } from '@/lib/mobile';
import { spring, dur, ease } from '@/lib/motion';
import { Icon } from './Icon';

/** The version really running: the installed desktop app, or the web build. */
export const runningVersion = () => (desktop?.version && desktop.version !== '0.0.0' ? desktop.version : __APP_VERSION__);

const useWhatsNew = create<{ open: Release | null; history: boolean }>()(() => ({ open: null, history: false }));
/** Settings → Sobre → "Ver novidades" */
export const openWhatsNew = (history = false) => useWhatsNew.setState({ open: releaseFor(runningVersion()) ?? RELEASES[0] ?? null, history });

/**
 * "O Aldetes evoluiu!" — shown ONCE per user and device after a version that really changed, only when the
 * app is ready and never during a call/stream (it waits for a safe moment). Dismissing records lastSeen.
 */
export function WhatsNew() {
  const me = useStore((s) => s.me);
  const inCall = useVoice((v) => !!v.channelId);
  const seen = usePrefs((p) => (me ? p.seenRelease[me.id] : undefined));
  const { open, history } = useWhatsNew();
  const version = runningVersion();

  useEffect(() => {
    if (!me || open || inCall || seen === version) return;
    const rel = releaseFor(version);
    const firstUse = !HAD_PREFS || Date.now() - new Date(me.createdAt).getTime() < 24 * 3600_000;
    // First install / brand-new account: no changelog of things the person never had — just remember the version.
    if (!rel || firstUse) {
      setPrefs({ seenRelease: { ...getPrefs().seenRelease, [me.id]: version } });
      return;
    }
    const t = setTimeout(() => !useVoice.getState().channelId && useWhatsNew.setState({ open: rel, history: false }), 1400);
    return () => clearTimeout(t);
  }, [me, inCall, seen, version, open]);

  const close = () => {
    if (me) setPrefs({ seenRelease: { ...getPrefs().seenRelease, [me.id]: version } });
    useWhatsNew.setState({ open: null, history: false });
  };
  return createPortal(<AnimatePresence>{open && <Panel key={open.version} rel={open} history={history} onClose={close} />}</AnimatePresence>, document.body);
}

function Panel({ rel, history, onClose }: { rel: Release; history: boolean; onClose: () => void }) {
  const mobile = useIsMobile();
  const [showAll, setShowAll] = useState(history);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/65 sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: dur.short } }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="whatsnew-title"
        initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 18 }}
        animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        exit={mobile ? { y: '100%', transition: { duration: dur.spatial, ease: ease.inOut } } : { opacity: 0, scale: 0.97, transition: { duration: dur.short } }}
        transition={{ duration: dur.spatial, ease: ease.out }}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden border border-line/[0.08] bg-bg-side shadow-float max-sm:rounded-t-[28px] max-sm:pb-[env(safe-area-inset-bottom)] sm:max-w-[520px] sm:rounded-[28px]"
      >
        <div className="relative overflow-hidden px-7 pb-5 pt-7">
          <div className="cz">
            <span className="-left-16 -top-24 h-64 w-64 rounded-full bg-[rgb(var(--brand)/0.35)] blur-3xl" style={{ animation: 'cz-blob 12s ease-in-out infinite' }} />
            <span className="-right-10 -top-16 h-56 w-56 rounded-full bg-[rgb(var(--brand-2)/0.3)] blur-3xl" style={{ animation: 'cz-blob 15s ease-in-out infinite reverse' }} />
          </div>
          <button className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-fg-muted hover:bg-line/10 hover:text-fg-strong" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
          <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: dur.short }} className="grad relative inline-block rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-glow">
            Versão {rel.version}
          </motion.span>
          <motion.h2 id="whatsnew-title" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: dur.spatial, ease: ease.out }} className="relative mt-3 text-[28px] font-black tracking-tight text-fg-strong">
            {rel.title}
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative text-sm text-fg-muted">
            Veja o que mudou nesta atualização.
          </motion.p>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          <ol className="space-y-2">
            {rel.highlights.map((h, i) => (
              <motion.li key={h.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: 0.24 + i * 0.06 }} className="flex gap-3 rounded-2xl border border-line/[0.06] bg-line/[0.025] p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-[12px] font-black tabular-nums text-brand">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-fg-strong">{h.title}</span>
                  <span className="block text-[13px] text-fg-muted">{h.body}</span>
                </span>
              </motion.li>
            ))}
          </ol>
          {rel.fixes && rel.fixes.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-1.5">Melhorias e correções</div>
              <ul className="space-y-1 text-[13px] text-fg">
                {rel.fixes.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" strokeWidth={3} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AnimatePresence initial={false}>
            {showAll && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: dur.spatial }} className="overflow-hidden">
                <div className="eyebrow mb-1.5 mt-5">Histórico de versões</div>
                {RELEASES.map((r) => (
                  <div key={r.version} className="border-t border-line/[0.06] py-2 text-[13px]">
                    <b className="text-fg-strong">v{r.version}</b> <span className="text-fg-faint">· {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    <div className="text-fg-muted">{r.highlights.map((h) => h.title).join(' · ')}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-3 border-t border-line/[0.06] px-7 py-4">
          <button className="text-sm text-fg-muted hover:text-fg-strong" onClick={onClose}>
            Ver depois
          </button>
          <span className="text-fg-faint">·</span>
          <button className="text-sm text-fg-muted hover:text-fg-strong" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll}>
            {showAll ? 'Ocultar histórico' : 'Notas completas'}
          </button>
          <span className="flex-1" />
          <motion.button whileTap={{ scale: 0.96 }} className="btn-primary h-11 px-6" onClick={onClose} autoFocus>
            Começar
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
