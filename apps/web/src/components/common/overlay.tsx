import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icon';
import { useIsMobile, useBackToClose } from '@/lib/mobile';
import { spring } from '@/lib/motion';

// ---------------- Modal ----------------
export function Modal({ onClose, children, className, title, subtitle, footer, wide }: { onClose: () => void; children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const mobile = useIsMobile();
  useBackToClose(onClose);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <motion.div
      className={clsx('fixed inset-0 z-50 flex justify-center bg-black/70', mobile ? 'items-end p-0' : 'items-center p-4')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal
        initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 12 }}
        animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        transition={mobile ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] } : spring.gentle}
        className={clsx(
          'flex w-full flex-col overflow-hidden border border-line/[0.08] bg-bg-side shadow-float',
          mobile ? 'max-h-[92dvh] rounded-t-[26px] border-b-0 pb-[env(safe-area-inset-bottom)]' : clsx('max-h-[90vh] rounded-3xl', wide ? 'max-w-2xl' : 'max-w-md'),
          className,
        )}
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
export function Popover(props: { x: number; y: number; onClose: () => void; children: ReactNode; align?: 'start' | 'end' }) {
  const mobile = useIsMobile();
  return mobile ? <Sheet onClose={props.onClose}>{props.children}</Sheet> : <FloatingPopover {...props} />;
}

/**
 * Phones: menus, profile cards, pickers and status menus open as a bottom sheet — always inside the screen,
 * above the keyboard/safe area, closable by tapping outside, dragging down, Esc or the system back gesture.
 */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useBackToClose(onClose);
  const y0 = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <motion.div className="fixed inset-0 z-[60] flex items-end bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        data-sheet
        role="dialog"
        aria-modal
        initial={{ y: '100%' }}
        animate={{ y: dy }}
        transition={dy ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="scroll-thin max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-[26px] border border-b-0 border-line/[0.08] bg-bg-float pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="sticky top-0 z-10 flex h-6 cursor-grab touch-none items-center justify-center bg-bg-float"
          onPointerDown={(e) => {
            y0.current = e.clientY;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => y0.current !== null && setDy(Math.max(0, e.clientY - y0.current))}
          onPointerUp={() => {
            if (dy > 90) onClose();
            y0.current = null;
            setDy(0);
          }}
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-line/25" />
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function FloatingPopover({ x, y, onClose, children, align = 'start' }: { x: number; y: number; onClose: () => void; children: ReactNode; align?: 'start' | 'end' }) {
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
    <div className="toasts pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
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
    // pointer (not mouse) events: touch screens fire a fake "mouseenter" with no "mouseleave", which left tooltips stuck
    <span
      className="contents"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setRect((e.currentTarget.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null)}
      onPointerLeave={() => setRect(null)}
      onPointerDown={() => setRect(null)}
    >
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

// ---------------- Prompt dialog (one text field) ----------------
interface PromptReq {
  title: string;
  label: string;
  initial?: string;
  confirm: string;
  maxLength?: number;
  resolve: (v: string | null) => void;
}
const usePrompt = create<{ req: PromptReq | null }>(() => ({ req: null }));
export function promptDialog(o: Omit<PromptReq, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ req: { ...o, resolve } }));
}
export function PromptHost() {
  const req = usePrompt((s) => s.req);
  const [v, setV] = useState('');
  useEffect(() => setV(req?.initial ?? ''), [req]);
  if (!req) return null;
  const done = (val: string | null) => {
    req.resolve(val?.trim() ? val.trim() : null);
    usePrompt.setState({ req: null });
  };
  return (
    <Modal
      onClose={() => done(null)}
      title={req.title}
      footer={
        <>
          <button className="btn-ghost" onClick={() => done(null)}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!v.trim()} onClick={() => done(v)}>
            {req.confirm}
          </button>
        </>
      }
    >
      <label className="block pb-2">
        <span className="label">{req.label}</span>
        <input className="input" autoFocus value={v} maxLength={req.maxLength ?? 64} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && done(v)} />
      </label>
    </Modal>
  );
}
