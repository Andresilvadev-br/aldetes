import { useEffect, useState, type ReactNode } from 'react';
import { useIsMobile, useBackToClose } from '@/lib/mobile';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from '../common/Icon';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';

export interface SettingsSection {
  id: string;
  label: string;
  group?: string;
  danger?: boolean;
  onClick?: () => void;
}

export function SettingsLayout({ sections, active, onSelect, onClose, children }: { sections: SettingsSection[]; active: string; onSelect: (id: string) => void; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const mobile = useIsMobile();
  if (mobile) return <MobileSettings sections={sections} active={active} onSelect={onSelect} onClose={onClose}>{children}</MobileSettings>;
  let lastGroup: string | undefined;
  return createPortal(
    <div className="haze fixed inset-0 z-40 flex animate-fade bg-bg-main">
      <div className="scroll-thin flex flex-[1_0_218px] justify-end overflow-y-auto border-r border-line/[0.06] bg-bg-side">
        <nav className="w-[218px] px-2 py-14">
          {sections.map((s) => {
            const header = s.group !== lastGroup ? s.group : undefined;
            lastGroup = s.group;
            return (
              <div key={s.id}>
                {header && <div className="eyebrow px-3 pb-1.5 pt-5 first:pt-0">{header}</div>}
                <button
                  onClick={() => (s.onClick ? s.onClick() : onSelect(s.id))}
                  className={clsx(
                    'relative mb-0.5 w-full rounded-xl px-3 py-2 text-left font-medium transition-colors',
                    s.danger ? 'text-danger hover:bg-danger/10' : active === s.id ? 'text-fg-strong' : 'text-fg-muted hover:bg-line/[0.05] hover:text-fg',
                  )}
                >
                  {active === s.id && !s.danger && (
                    <motion.span layoutId="settings-active" transition={spring.responsive} className="nav-active absolute inset-0 -z-10 rounded-xl border">
                      <span className="grad absolute -left-px bottom-2 top-2 w-[3px] rounded-full" />
                    </motion.span>
                  )}
                  <span className="relative">{s.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </div>
      <div className="scroll-thin flex flex-[1_1_800px] overflow-y-auto">
        <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} className="w-full max-w-[740px] px-10 py-14">
          {children}
        </motion.div>
        <div className="pt-14">
          <button className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-fg-muted text-fg-muted hover:border-fg-strong hover:text-fg-strong" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
          <div className="mt-1 text-center text-xs font-semibold text-fg-muted">ESC</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Phones: settings as a stack — the section list, then the section on its own screen with a back button
 * (and Android back / iOS swipe closing it). Opening straight into a section (e.g. "Editar perfil") is supported.
 */
function MobileSettings({ sections, active, onSelect, onClose, children }: { sections: SettingsSection[]; active: string; onSelect: (id: string) => void; onClose: () => void; children: ReactNode }) {
  const [view, setView] = useState<'list' | 'section'>('section');
  useBackToClose(onClose);
  const current = sections.find((s) => s.id === active);
  let lastGroup: string | undefined;
  return createPortal(
    <div className="fixed inset-x-0 z-40 flex flex-col overflow-hidden bg-bg-main" style={{ top: 'var(--vv-top, 0px)', height: 'var(--app-h, 100dvh)', paddingTop: 'env(safe-area-inset-top)' }} role="dialog" aria-modal aria-label="Configurações">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line/[0.06] px-2">
        <button className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-strong active:bg-line/10" onClick={() => (view === 'section' ? setView('list') : onClose())} aria-label={view === 'section' ? 'Voltar para as configurações' : 'Fechar configurações'}>
          <Icon name={view === 'section' ? 'arrowLeft' : 'x'} size={21} />
        </button>
        <h1 className="flex-1 truncate text-[17px] font-extrabold text-fg-strong">{view === 'section' ? current?.label : 'Configurações'}</h1>
        {view === 'section' && (
          <button className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-muted active:bg-line/10" onClick={onClose} aria-label="Fechar configurações">
            <Icon name="x" size={19} />
          </button>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <motion.nav
          className="scroll-thin absolute inset-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
          animate={{ x: view === 'list' ? 0 : -40, opacity: view === 'list' ? 1 : 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: view === 'list' ? undefined : 'none' }}
          aria-hidden={view !== 'list' || undefined}
        >
          {sections.map((s) => {
            const header = s.group !== lastGroup ? s.group : undefined;
            lastGroup = s.group;
            return (
              <div key={s.id}>
                {header?.trim() && <div className="eyebrow px-2 pb-1.5 pt-5">{header}</div>}
                <button
                  onClick={() => (s.onClick ? s.onClick() : (onSelect(s.id), setView('section')))}
                  className={clsx('mb-1 flex h-12 w-full items-center rounded-xl px-3 text-left text-[15px] font-semibold active:bg-line/[0.07]', s.danger ? 'mt-4 text-danger' : 'text-fg-strong')}
                >
                  <span className="flex-1">{s.label}</span>
                  {!s.danger && <Icon name="chevronRight" size={16} className="text-fg-faint" />}
                </button>
              </div>
            );
          })}
        </motion.nav>
        <motion.div
          className="scroll-thin absolute inset-0 overflow-y-auto bg-bg-main px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
          animate={{ x: view === 'section' ? 0 : '100%' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden={view !== 'section' || undefined}
        >
          <div className="mobile-settings">{children}</div>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}

export function SettingsTitle({ children }: { children: ReactNode }) {
  return <h2 className="settings-title mb-6 text-2xl font-extrabold tracking-tight text-fg-strong">{children}</h2>;
}

export function Toggle({ checked, onChange, label, desc, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-start justify-between gap-4 border-b border-line/[0.06] py-4', disabled && 'cursor-not-allowed opacity-50')}>
      <div>
        <div className="font-medium text-fg-strong">{label}</div>
        {desc && <div className="mt-1 text-sm text-fg-muted">{desc}</div>}
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

/** Pill switch: gradient track, thumb moves with a spring and keeps inertia when toggled quickly. */
export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <span
      className={clsx('relative mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200', checked ? 'grad shadow-[0_6px_18px_-6px_rgb(var(--brand))]' : 'bg-line/[0.12]')}
      style={{ justifyContent: checked ? 'flex-end' : 'flex-start' }}
    >
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <motion.span layout transition={spring.snappy} className="h-5 w-5 rounded-full bg-white shadow" />
    </span>
  );
}

/** Segmented control with a sliding selection. */
export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; id: string }) {
  return (
    <div className="inline-flex rounded-xl border border-line/[0.08] bg-line/[0.03] p-1">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={clsx('relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors', value === v ? 'text-white' : 'text-fg-muted hover:text-fg-strong')}>
          {value === v && <motion.span layoutId={`seg-${id}`} transition={spring.responsive} className="grad absolute inset-0 rounded-lg shadow-[0_6px_18px_-8px_rgb(var(--brand))]" />}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}
