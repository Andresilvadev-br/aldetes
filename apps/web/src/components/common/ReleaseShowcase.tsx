import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import type { DemoId, ExploreTarget, Highlight, Release } from '@/lib/changelog';
import { RELEASES } from '@/lib/changelog';
import { spring, dur, ease } from '@/lib/motion';
import { openSettings, openSwitcher } from '@/lib/ui';
import { get } from '@/store';
import { Icon, Logo } from './Icon';
import { toast } from './overlay';

/**
 * Release Experience (desktop): Hero → feature stories (each with a short live demo) → Explore.
 * Content comes ONLY from the release manifest (lib/changelog.ts) for the installed version — nothing hardcoded to
 * "1.0". Next/back/skip with buttons, ← → and Esc. Marked as seen when finished or skipped (by the caller).
 */
export function ReleaseShowcase({ rel, onClose }: { rel: Release; onClose: () => void }) {
  const stories = rel.highlights;
  const [step, setStep] = useState(0); // 0 = hero, 1..n = stories, n+1 = explore
  const last = stories.length + 1;
  const [dir, setDir] = useState(1);
  const nav = useNavigate();
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(Math.max(0, Math.min(last, n)));
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(step + 1);
      if (e.key === 'ArrowLeft') go(step - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [step]);

  const explore = (t: ExploreTarget) => {
    onClose();
    if (t === 'home') nav('/channels/@me');
    else if (t === 'profile') openSettings('profile');
    else if (t === 'appearance') openSettings('appearance');
    else if (t === 'voice') openSettings('voice');
    else if (t === 'desktop') openSettings(window.aldetesDesktop ? 'desktop' : 'appearance');
    else if (t === 'switcher') openSwitcher();
    else if (t === 'studio') {
      const st = get();
      const own = st.serverOrder.find((id) => st.servers[id]?.ownerId === st.me?.id);
      if (own) nav(`/channels/${own}`);
      toast(own ? 'Abra o menu do servidor → Configurações → Server Studio.' : 'O Server Studio fica nas configurações dos servidores que você gerencia.');
    }
  };

  const story = step >= 1 && step <= stories.length ? stories[step - 1]! : null;
  return (
    <motion.div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: dur.short } }}>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="whatsnew-title"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.short } }}
        transition={{ duration: dur.composition, ease: ease.out }}
        className="relative flex h-[min(640px,88vh)] w-[min(920px,94vw)] flex-col overflow-hidden rounded-[32px] border border-line/[0.08] bg-bg-side shadow-float"
      >
        <div className="cz" aria-hidden>
          <span className="-left-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-[rgb(var(--brand)/0.28)] blur-3xl" style={{ animation: 'cz-blob 16s ease-in-out infinite' }} />
          <span className="-bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-[rgb(var(--brand-2)/0.22)] blur-3xl" style={{ animation: 'cz-blob 20s ease-in-out infinite reverse' }} />
        </div>
        <button className="absolute right-4 top-4 z-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-fg-muted hover:bg-line/10 hover:text-fg-strong" onClick={onClose}>
          Pular
        </button>

        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40, transition: { duration: dur.short } }}
              transition={{ duration: dur.spatial, ease: ease.out }}
              className="absolute inset-0 flex flex-col p-10"
            >
              {step === 0 ? (
                <Hero rel={rel} />
              ) : story ? (
                <Story h={story} index={step} total={stories.length} onExplore={story.explore ? () => explore(story.explore!) : undefined} />
              ) : (
                <Explore rel={rel} onExplore={explore} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative flex items-center gap-3 border-t border-line/[0.06] px-8 py-4">
          <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>
            <Icon name="arrowLeft" size={15} /> Voltar
          </button>
          <div className="flex flex-1 items-center justify-center gap-1.5" role="tablist" aria-label="Etapas">
            {Array.from({ length: last + 1 }, (_, i) => (
              <button key={i} role="tab" aria-selected={i === step} aria-label={i === 0 ? 'Início' : i === last ? 'Explorar' : stories[i - 1]!.title} onClick={() => go(i)} className="p-1">
                <motion.span layout className={clsx('block h-1.5 rounded-full', i === step ? 'w-6 bg-brand' : 'w-1.5 bg-line/25 hover:bg-line/45')} transition={spring.responsive} />
              </button>
            ))}
          </div>
          {step < last ? (
            <motion.button whileTap={{ scale: 0.96 }} className="btn-primary h-11 px-6" onClick={() => go(step + 1)} autoFocus>
              {step === 0 ? 'Ver o que chegou' : 'Próximo'} <Icon name="chevronRight" size={15} />
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.96 }} className="btn-primary h-11 px-6" onClick={onClose} autoFocus>
              Começar
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Hero({ rel }: { rel: Release }) {
  const [major] = rel.version.split('.');
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <motion.span initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }} className="grad mb-6 flex h-20 w-20 items-center justify-center rounded-[26px] text-white shadow-glow">
        <Logo size={44} />
      </motion.span>
      <motion.div initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.32em' }} transition={{ duration: 0.6, ease: ease.out, delay: 0.1 }} className="mb-2 text-xs font-black uppercase text-fg-muted">
        Aldetes · versão {rel.version}
      </motion.div>
      <h2 id="whatsnew-title" className="flex overflow-hidden text-[64px] font-black leading-none tracking-[-0.045em] text-fg-strong">
        {rel.title.split('').map((c, i) => (
          <motion.span key={i} initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.42, ease: ease.out, delay: 0.18 + i * 0.03 }} className={clsx('inline-block whitespace-pre', c === major && i > 6 && 'grad-text')}>
            {c}
          </motion.span>
        ))}
      </h2>
      {rel.tagline && (
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: dur.spatial }} className="mt-4 max-w-lg text-[15px] text-fg-muted">
          {rel.tagline}
        </motion.p>
      )}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }} className="mt-6 text-xs text-fg-faint">
        {rel.highlights.length} novidades · {new Date(rel.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </motion.div>
    </div>
  );
}

function Story({ h, index, total, onExplore }: { h: Highlight; index: number; total: number; onExplore?: () => void }) {
  return (
    <div className="grid flex-1 grid-cols-[1fr_1.1fr] items-center gap-10">
      <div>
        <div className="eyebrow mb-3">
          {String(index).padStart(2, '0')} / {String(total).padStart(2, '0')} {h.category ? `· ${h.category}` : ''}
        </div>
        <h3 id="whatsnew-title" className="text-[40px] font-black leading-[1.05] tracking-[-0.03em] text-fg-strong">
          {h.title}
        </h3>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">{h.body}</p>
        {onExplore && (
          <button className="btn-secondary mt-6" onClick={onExplore}>
            Experimentar agora <Icon name="chevronRight" size={14} />
          </button>
        )}
      </div>
      <div className="relative h-[300px] overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-rail" aria-hidden>
        {h.demo ? DEMOS[h.demo]() : <div className="flex h-full items-center justify-center text-fg-faint">—</div>}
      </div>
    </div>
  );
}

function Explore({ rel, onExplore }: { rel: Release; onExplore: (t: ExploreTarget) => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <h3 id="whatsnew-title" className="text-[34px] font-black tracking-[-0.03em] text-fg-strong">
        Explore a {rel.title.replace(/^Aldetes\s*/, '') || rel.version}
      </h3>
      <p className="mb-5 text-sm text-fg-muted">Vá direto para cada novidade. Você pode rever esta apresentação em Configurações → Sobre o Aldetes.</p>
      <div className="grid grid-cols-2 gap-2.5 overflow-y-auto pr-1 md:grid-cols-4">
        {rel.highlights.map((h, i) => (
          <motion.button
            key={h.id ?? h.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: i * 0.04 }}
            disabled={!h.explore}
            onClick={() => h.explore && onExplore(h.explore)}
            className="group rounded-2xl border border-line/[0.07] bg-line/[0.03] p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.06] disabled:opacity-60"
          >
            <div className="eyebrow mb-1">{h.category ?? 'Novidade'}</div>
            <div className="text-[14px] font-extrabold text-fg-strong">{h.title}</div>
            {h.explore && <div className="mt-2 text-[12px] font-semibold text-brand opacity-70 transition-opacity group-hover:opacity-100">Abrir →</div>}
          </motion.button>
        ))}
      </div>
      {rel.fixes && rel.fixes.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-1.5">Melhorias e correções</div>
          <ul className="grid gap-1 text-[13px] text-fg md:grid-cols-2">
            {rel.fixes.map((f) => (
              <li key={f} className="flex gap-2">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" strokeWidth={3} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-4 text-[11px] text-fg-faint">Versões anteriores: {RELEASES.filter((r) => r.version !== rel.version).map((r) => `v${r.version}`).join(' · ')}</div>
    </div>
  );
}

/* ---------------- short demos (pure UI, looped, transform/opacity only) ---------------- */
const loop = { repeat: Infinity, repeatDelay: 1.2 } as const;
function Frame({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-6">{children}</div>;
}
const Dot = ({ c = 'bg-line/20', w = 'w-24' }: { c?: string; w?: string }) => <span className={clsx('block h-2.5 rounded-full', c, w)} />;

export const DEMOS: Record<DemoId, () => ReactNode> = {
  pulse: () => (
    <Frame>
      <div className="grid w-full max-w-[340px] gap-2">
        <div className="text-[22px] font-black tracking-tight text-fg-strong">
          Sua galera. <span className="grad-text">Agora.</span>
        </div>
        {['Em call · 3 pessoas', 'Jogando · há 12 min', 'Rascunho: bora hoje?'].map((t, i) => (
          <motion.div key={t} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.2 + i * 0.12 }} className="flex items-center gap-2.5 rounded-2xl border border-line/[0.07] bg-line/[0.04] p-2.5">
            <span className={clsx('h-8 w-8 rounded-xl', ['bg-ok/30', 'bg-violet-500/30', 'bg-sky-400/30'][i])} />
            <span className="text-[13px] font-semibold text-fg">{t}</span>
          </motion.div>
        ))}
      </div>
    </Frame>
  ),
  island: () => (
    <Frame>
      <div className="relative h-full w-full rounded-2xl border border-line/[0.06] bg-black/30">
        <motion.div animate={{ x: [0, 120, 120, 0], y: [0, 0, 150, 0] }} transition={{ duration: 4.2, ease: 'easeInOut', ...loop }} className="absolute left-[calc(50%-90px)] top-3 flex h-9 w-[180px] items-center gap-2 rounded-full border border-brand/40 bg-black px-3 text-[12px] font-semibold text-white shadow-glow">
          <span className="h-2 w-2 rounded-full bg-ok" /> Geral · 3 · 12:04
        </motion.div>
        <span className="absolute inset-x-0 bottom-2 text-center text-[11px] text-fg-faint">arraste por qualquer parte · gruda nos cantos</span>
      </div>
    </Frame>
  ),
  studio: () => (
    <Frame>
      <div className="w-[260px] overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-side">
        <motion.div animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} className="h-20" style={{ background: 'linear-gradient(120deg,#ff2d78,#a855f7,#22d3ee,#ff2d78)', backgroundSize: '300% 100%' }} />
        <div className="-mt-6 flex items-end gap-2 px-3 pb-3">
          <motion.span animate={{ boxShadow: ['0 0 0 2px #22d3ee', '0 0 18px 3px #22d3ee', '0 0 0 2px #22d3ee'] }} transition={{ duration: 2.4, repeat: Infinity }} className="grad h-11 w-11 rounded-2xl" />
          <span className="pb-1 text-[14px] font-black text-fg-strong">Sua Base</span>
        </div>
        <div className="space-y-1.5 px-3 pb-3">
          <Dot w="w-full" c="bg-gradient-to-r from-brand/70 to-transparent h-[2px]" />
          <Dot w="w-40" />
          <Dot w="w-28" />
        </div>
      </div>
    </Frame>
  ),
  profile: () => (
    <Frame>
      <div className="relative w-[230px] overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-float">
        <div className="h-16" style={{ background: 'linear-gradient(135deg,#07021a,#1a0640 55%,#06142e)' }} />
        <div className="relative -mt-8 ml-4 h-16 w-16">
          <span className="deco deco-neon-current" style={{ position: 'absolute', inset: -5, borderRadius: '50%' }} />
          <span className="grad block h-16 w-16 rounded-full ring-4 ring-bg-float" />
        </div>
        <div className="space-y-1.5 p-4 pt-2">
          <Dot w="w-28" c="bg-fg-strong/70" />
          <Dot w="w-20" />
        </div>
        <motion.span initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 0.9, ...loop, repeatDelay: 2 }} className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.3)_50%,transparent_70%)]" />
      </div>
    </Frame>
  ),
  motion: () => (
    <Frame>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        {['Ultra', 'Equilibrado', 'Desempenho'].map((m, i) => (
          <div key={m} className="flex items-center gap-3">
            <span className="w-24 text-[12px] font-bold text-fg">{m}</span>
            <div className="relative h-8 flex-1 rounded-full bg-line/[0.06]">
              <motion.span
                animate={{ x: [0, 150, 150, 0, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.3, 0.5, 0.8, 1], ease: i === 0 ? 'backOut' : i === 1 ? 'easeInOut' : (p: number) => (p < 0.5 ? 0 : 1) }}
                className="absolute left-1 top-1 h-6 w-6 rounded-full bg-brand"
              />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  ),
  chat: () => (
    <Frame>
      <div className="w-full max-w-[320px] space-y-2">
        <motion.div animate={{ backgroundColor: ['rgb(var(--brand) / 0)', 'rgb(var(--brand) / 0.18)', 'rgb(var(--brand) / 0)'] }} transition={{ duration: 1.6, ...loop }} className="rounded-xl p-2 text-[13px] text-fg">
          <b className="text-fg-strong">ana</b> partiu ranked às 21h?
        </motion.div>
        <div className="rounded-xl p-2 text-[13px] text-fg">
          <span className="text-[11px] text-fg-faint">↳ respondendo ana</span>
          <br />
          <b className="text-fg-strong">você</b> bora!!
          <div className="mt-1.5 flex gap-1">
            <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 0.5, ...loop, repeatDelay: 1.6 }} className="rounded-lg border border-brand/60 bg-brand/15 px-2 py-0.5 text-[12px]">
              🔥 3
            </motion.span>
          </div>
        </div>
      </div>
    </Frame>
  ),
  audio: () => (
    <Frame>
      <div className="w-full max-w-[320px] space-y-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-fg">
          <Icon name="mic" size={14} /> Microfone · Headset USB
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line/[0.08]">
          <motion.div animate={{ scaleX: [0.15, 0.7, 0.35, 0.85, 0.2] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} className="h-full origin-left bg-gradient-to-r from-ok to-warn" />
        </div>
        <div className="rounded-xl border border-ok/30 bg-ok/10 p-2.5 text-[12px] text-ok">Som do PC na transmissão: sem as vozes da call</div>
      </div>
    </Frame>
  ),
  nav: () => (
    <Frame>
      <div className="w-full max-w-[340px] rounded-2xl border border-line/[0.08] bg-bg-float p-3">
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-line/[0.06] px-3 py-2 text-[13px] text-fg-muted">
          <Icon name="search" size={14} />
          <motion.span initial={{ width: 0 }} animate={{ width: 'auto' }} transition={{ duration: 0.9, ...loop, repeatDelay: 1.8 }} className="overflow-hidden whitespace-nowrap">
            &gt; modo foco
          </motion.span>
        </div>
        {['Modo foco · Ctrl+Shift+F', '#geral · Sua Base', 'ana — Jogando'].map((t, i) => (
          <div key={t} className={clsx('rounded-lg px-2.5 py-1.5 text-[12px]', i === 0 ? 'bg-fg/10 text-fg-strong' : 'text-fg-muted')}>
            {t}
          </div>
        ))}
      </div>
    </Frame>
  ),
};
