import { useEffect, type ReactNode } from 'react';
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

export function SettingsTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-fg-strong">{children}</h2>;
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
