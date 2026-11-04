import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icon';
import { spring } from '@/lib/motion';

// ---------------- Modal ----------------
export function Modal({ onClose, children, className, title, subtitle, footer, wide }: { onClose: () => void; children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.gentle}
        className={clsx('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-side shadow-float', wide ? 'max-w-2xl' : 'max-w-md', className)}
      >
        {title && (
          <div className="relative px-6 pb-2 pt-6">
            <h2 className="text-xl font-extrabold tracking-tight text-fg-strong">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
            <button className="icon-btn absolute right-4 top-4" onClick={onClose} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="scroll-thin overflow-y-auto px-6 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line/[0.06] bg-line/[0.02] px-6 py-4">{footer}</div>}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ---------------- Popover / context menu ----------------
export function Popover({ x, y, onClose, children, align = 'start' }: { x: number; y: number; onClose: () => void; children: ReactNode; align?: 'start' | 'end' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = align === 'end' ? x - r.width : x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left: Math.max(8, left), top });
  }, [x, y, align]);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => window.addEventListener('mousedown', down));
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return createPortal(
    <motion.div
      ref={ref}
      className="fixed z-[60]"
      style={{ ...pos, transformOrigin: `${x - pos.left}px ${y - pos.top}px` }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.snappy}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  icon?: Parameters<typeof Icon>[0]['name'];
  hidden?: boolean;
  checked?: boolean;
  separator?: boolean;
}

const MenuCtx = createContext<(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => void>(() => {});
export const useContextMenu = () => useContext(MenuCtx);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = useCallback((e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => {
    e.preventDefault?.();
    setMenu({ x: e.clientX, y: e.clientY, items: items.filter((i) => !i.hidden) });
  }, []);
  const close = useCallback(() => setMenu(null), []);
  return (
    <MenuCtx.Provider value={open}>
      {children}
      {menu && (
        <Popover x={menu.x} y={menu.y} onClose={close}>
          <div className="menu">
            {menu.items.map((it, i) =>
              it.separator ? (
                <div key={i} className="mx-1 my-1 h-px bg-line/[0.07]" />
              ) : (
                <button
                  key={i}
                  className={it.danger ? 'menu-item-danger' : 'menu-item'}
                  onClick={() => {
                    close();
                    it.onClick?.();
                  }}
                >
                  <span>{it.label}</span>
                  {it.checked !== undefined ? (
                    <span className={clsx('flex h-4 w-4 items-center justify-center rounded-sm border', it.checked ? 'border-brand bg-brand text-white' : 'border-fg-muted')}>
                      {it.checked && <Icon name="check" size={12} strokeWidth={3} />}
                    </span>
                  ) : (
                    it.icon && <Icon name={it.icon} size={16} />
                  )}
                </button>
              ),
            )}
          </div>
        </Popover>
      )}
    </MenuCtx.Provider>
  );
}

// ---------------- Toasts ----------------
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let tid = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++tid;
  useToasts.setState((s) => ({ list: [...s.list, { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), 4500);
}
export function toastError(err: unknown) {
  toast((err as Error)?.message ?? 'Erro inesperado', 'error');
}
export function Toasts() {
  const list = useToasts((s) => s.list);
  return createPortal(
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={spring.responsive}
            className={clsx(
              'pointer-events-auto flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-float',
              t.kind === 'error'
                ? 'border-danger/40 bg-[rgb(40_12_20)] text-[rgb(255_190_200)]'
                : t.kind === 'success'
                  ? 'border-ok/40 bg-[rgb(10_32_20)] text-[rgb(170_240_200)]'
                  : 'border-line/10 bg-bg-float text-fg-strong',
            )}
          >
            <span className={clsx('h-2 w-2 shrink-0 rounded-full', t.kind === 'error' ? 'bg-danger' : t.kind === 'success' ? 'bg-ok' : 'grad')} />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ---------------- Tooltip ----------------
export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  return (
    <span className="contents" onMouseEnter={(e) => setRect((e.currentTarget.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null)} onMouseLeave={() => setRect(null)}>
      {children}
      {rect &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80] max-w-xs animate-pop whitespace-nowrap rounded-md bg-bg-float px-3 py-1.5 text-sm font-semibold text-fg-strong shadow-xl ring-1 ring-black/30"
            style={
              side === 'right'
                ? { left: rect.right + 12, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' }
                : side === 'bottom'
                  ? { left: rect.left + rect.width / 2, top: rect.bottom + 8, transform: 'translateX(-50%)' }
                  : { left: rect.left + rect.width / 2, top: rect.top - 8, transform: 'translate(-50%, -100%)' }
            }
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

// ---------------- Confirm dialog ----------------
interface ConfirmReq {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
const useConfirm = create<{ req: ConfirmReq | null }>(() => ({ req: null }));
export function confirmDialog(o: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ req: { ...o, resolve } }));
}
export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  if (!req) return null;
  const done = (v: boolean) => {
    req.resolve(v);
    useConfirm.setState({ req: null });
  };
  return (
    <Modal
      onClose={() => done(false)}
      title={req.title}
      footer={
        <>
          <button className="btn-ghost" onClick={() => done(false)}>
            Cancelar
          </button>
          <button className={req.danger ? 'btn-danger' : 'btn-primary'} onClick={() => done(true)} autoFocus>
            {req.confirm}
          </button>
        </>
      }
    >
      <div className="pb-2 text-fg">{req.body}</div>
    </Modal>
  );
}
