import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from '../common/Icon';

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
    <div className="fixed inset-0 z-40 flex animate-fade bg-bg-main">
      <div className="scroll-thin flex flex-[1_0_218px] justify-end overflow-y-auto bg-bg-side">
        <nav className="w-[218px] px-2 py-14">
          {sections.map((s) => {
            const header = s.group !== lastGroup ? s.group : undefined;
            lastGroup = s.group;
            return (
              <div key={s.id}>
                {header && <div className="px-2.5 pb-1.5 pt-4 text-xs font-bold uppercase text-fg-muted first:pt-0">{header}</div>}
                <button
                  onClick={() => (s.onClick ? s.onClick() : onSelect(s.id))}
                  className={clsx('mb-0.5 w-full rounded px-2.5 py-1.5 text-left', s.danger ? 'text-danger hover:bg-fg/10' : active === s.id ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10 hover:text-fg')}
                >
                  {s.label}
                </button>
              </div>
            );
          })}
        </nav>
      </div>
      <div className="scroll-thin flex flex-[1_1_800px] overflow-y-auto">
        <div className="w-full max-w-[740px] px-10 py-14">{children}</div>
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
  return <h2 className="mb-5 text-xl font-bold text-fg-strong">{children}</h2>;
}

export function Toggle({ checked, onChange, label, desc, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-start justify-between gap-4 border-b border-line/5 py-4', disabled && 'cursor-not-allowed opacity-50')}>
      <div>
        <div className="font-medium text-fg-strong">{label}</div>
        {desc && <div className="mt-1 text-sm text-fg-muted">{desc}</div>}
      </div>
      <span className={clsx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-fg-faint/60')}>
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </label>
  );
}
