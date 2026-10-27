import { useState } from 'react';
import clsx from 'clsx';
import { useStore, set } from '@/store';
import { Avatar, StatusDot, STATUS_LABEL } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { Popover, Tooltip, toastError } from '../common/overlay';
import { toggleDeaf, toggleMute, useVoice } from '@/lib/voice';
import { emit } from '@/lib/gateway';
import { api } from '@/lib/api';
import { UserSettings } from '../settings/UserSettings';
import type { PresenceStatus } from '@aldetes/shared';

export function UserPanel() {
  const me = useStore((s) => s.me)!;
  const selfMute = useVoice((v) => v.selfMute);
  const selfDeaf = useVoice((v) => v.selfDeaf);
  const pttMode = useVoice((v) => v.pttActive);
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const setStatus = (status: PresenceStatus) => {
    emit('presence:set', { status });
    set((s) => ({ me: s.me ? { ...s.me, status } : s.me }));
    setStatusMenu(null);
  };

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-bg-rail/60 px-2">
      <button
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-fg/10"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setStatusMenu({ x: r.left, y: r.top - 8 });
        }}
      >
        <Avatar userId={me.id} size={32} showStatus />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-fg-strong">{me.displayName}</div>
          <div className="truncate text-xs leading-tight text-fg-muted">{me.customStatus || (pttMode ? 'Transmitindo…' : me.username)}</div>
        </div>
      </button>
      <Tooltip label={selfMute ? 'Ativar microfone' : 'Silenciar'}>
        <button className={clsx('icon-btn', (selfMute || selfDeaf) && 'text-danger')} onClick={() => void toggleMute()} aria-label="Microfone">
          <Icon name={selfMute || selfDeaf ? 'micOff' : 'mic'} size={19} />
        </button>
      </Tooltip>
      <Tooltip label={selfDeaf ? 'Desativar surdez' : 'Ensurdecer'}>
        <button className={clsx('icon-btn', selfDeaf && 'text-danger')} onClick={() => void toggleDeaf()} aria-label="Fones">
          <Icon name={selfDeaf ? 'headphonesOff' : 'headphones'} size={19} />
        </button>
      </Tooltip>
      <Tooltip label="Configurações de usuário">
        <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Configurações">
          <Icon name="settings" size={19} />
        </button>
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
                setCustomOpen(true);
              }}
            >
              <Icon name="smile" size={16} /> Definir status personalizado
            </button>
          </div>
        </Popover>
      )}
      {customOpen && <CustomStatusPrompt onClose={() => setCustomOpen(false)} initial={me.customStatus ?? ''} />}
      {settings && <UserSettings onClose={() => setSettings(false)} />}
    </div>
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
