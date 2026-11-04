import { useState } from 'react';
import clsx from 'clsx';
import { useStore, set } from '@/store';
import { Avatar, StatusDot, STATUS_LABEL } from '../common/Avatar';
import { Icon, type IconName } from '../common/Icon';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { Popover, Tooltip, toastError } from '../common/overlay';
import { toggleDeaf, toggleMute, useVoice } from '@/lib/voice';
import { emit } from '@/lib/gateway';
import { api } from '@/lib/api';
import { openSettings } from '@/lib/ui';
import type { PresenceStatus } from '@aldetes/shared';

export function UserPanel() {
  const me = useStore((s) => s.me)!;
  const selfMute = useVoice((v) => v.selfMute);
  const selfDeaf = useVoice((v) => v.selfDeaf);
  const pttMode = useVoice((v) => v.pttActive);
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number } | null>(null);

  const [customOpen, setCustomOpen] = useState(false);

  const setStatus = (status: PresenceStatus) => {
    emit('presence:set', { status });
    set((s) => ({ me: s.me ? { ...s.me, status } : s.me }));
    setStatusMenu(null);
  };

  return (
    <div className="panel relative flex h-[60px] shrink-0 items-center gap-1 overflow-hidden px-2">
      <span className="pointer-events-none absolute -left-10 top-1/2 h-24 w-32 -translate-y-1/2 rounded-full bg-brand/15 blur-2xl" />
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={spring.snappy}
        className="group relative flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-line/[0.06]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setStatusMenu({ x: r.left, y: r.top - 8 });
        }}
      >
        <motion.span whileHover={{ scale: 1.07, rotate: -4 }} transition={spring.snappy}>
          <Avatar userId={me.id} size={38} showStatus />
        </motion.span>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold leading-tight text-fg-strong">{me.displayName}</div>
          <div className="relative h-4 overflow-hidden text-xs leading-4">
            <span className="grad-text block truncate font-semibold transition-transform duration-300 group-hover:-translate-y-4">{me.customStatus || (pttMode ? 'Transmitindo…' : me.username)}</span>
            <span className="absolute inset-x-0 top-4 block truncate text-fg-muted transition-transform duration-300 group-hover:-translate-y-4">Mudar status</span>
          </div>
        </div>
      </motion.button>
      <Tooltip label={selfMute ? 'Ativar microfone' : 'Silenciar'}>
        <PanelBtn on={selfMute || selfDeaf} icon={selfMute || selfDeaf ? 'micOff' : 'mic'} onClick={() => void toggleMute()} label="Microfone" />
      </Tooltip>
      <Tooltip label={selfDeaf ? 'Desativar surdez' : 'Ensurdecer'}>
        <PanelBtn on={selfDeaf} icon={selfDeaf ? 'headphonesOff' : 'headphones'} onClick={() => void toggleDeaf()} label="Fones" />
      </Tooltip>
      <Tooltip label="Configurações de usuário">
        <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.85 }} transition={spring.gentle} className="icon-btn relative h-9 w-9 rounded-xl" onClick={() => openSettings('account')} aria-label="Configurações">
          <Icon name="settings" size={19} />
        </motion.button>
      </Tooltip>
      {statusMenu && (
        <Popover x={statusMenu.x} y={statusMenu.y - 230} onClose={() => setStatusMenu(null)}>
          <div className="menu w-60">
            {(['online', 'idle', 'dnd', 'invisible'] as const).map((s) => (
              <button key={s} className="menu-item justify-start" onClick={() => setStatus(s)}>
                <StatusDot status={s} className="h-2.5 w-2.5" />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {me.status === s && <Icon name="check" size={14} />}
              </button>
            ))}
            <div className="my-1 h-px bg-line/10" />
            <button
              className="menu-item justify-start"
              onClick={() => {
                setStatusMenu(null);
                openSettings('profile');
              }}
            >
              <Icon name="edit" size={16} /> Editar perfil
            </button>
            <button
              className="menu-item justify-start"
              onClick={() => {
                setStatusMenu(null);
                setCustomOpen(true);
              }}
            >
              <Icon name="smile" size={16} /> Definir status personalizado
            </button>
          </div>
        </Popover>
      )}
      {customOpen && <CustomStatusPrompt onClose={() => setCustomOpen(false)} initial={me.customStatus ?? ''} />}
    </div>
  );
}

function PanelBtn({ on, icon, onClick, label }: { on: boolean; icon: IconName; onClick: () => void; label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.82 }}
      transition={spring.snappy}
      onClick={onClick}
      aria-label={label}
      className={clsx('relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-200', on ? 'bg-danger/20 text-danger shadow-[0_0_16px_-4px_rgb(var(--danger)/0.8)]' : 'text-fg-muted hover:bg-line/[0.08] hover:text-fg-strong')}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={icon} initial={{ scale: 0.3, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.3, rotate: 40, opacity: 0 }} transition={spring.snappy} className="flex">
          <Icon name={icon} size={19} />
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function CustomStatusPrompt({ onClose, initial }: { onClose: () => void; initial: string }) {
  const [v, setV] = useState(initial);
  const save = (val: string | null) =>
    api('PATCH', '/users/@me', { customStatus: val })
      .then(onClose)
      .catch(toastError);
  return (
    <Popover x={16} y={window.innerHeight - 220} onClose={onClose}>
      <div className="menu w-72 p-3">
        <label className="label">Status personalizado</label>
        <input className="input" value={v} maxLength={128} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save(v || null)} placeholder="O que está rolando?" />
        <div className="mt-3 flex justify-between">
          <button className="btn-ghost px-0 text-sm" onClick={() => save(null)}>
            Limpar
          </button>
          <button className="btn-primary" onClick={() => save(v || null)}>
            Salvar
          </button>
        </div>
      </div>
    </Popover>
  );
}
