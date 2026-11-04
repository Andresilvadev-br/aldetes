import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useStore, useStoreShallow } from '@/store';
import { Avatar } from '../common/Avatar';
import { leaveVoice, toggleCamera, stopScreenShare, useVoice, ConnectionQuality } from '@/lib/voice';
import { Icon, type IconName } from '../common/Icon';
import { Tooltip } from '../common/overlay';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { ScreenShareModal } from './ScreenShareModal';
import { dmName } from '../layout/HomeSidebar';

export function QualityBars({ q, className }: { q: ConnectionQuality | undefined; className?: string }) {
  const level = q === ConnectionQuality.Excellent ? 3 : q === ConnectionQuality.Good ? 2 : q === ConnectionQuality.Poor ? 1 : q === ConnectionQuality.Lost ? 0 : 3;
  const color = level >= 3 ? 'bg-ok' : level === 2 ? 'bg-warn' : 'bg-danger';
  return (
    <span className={clsx('inline-flex items-end gap-[2px]', className)} title={`Qualidade: ${['perdida', 'ruim', 'boa', 'excelente'][level]}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={clsx('w-[3px] rounded-sm', i <= level ? color : 'bg-fg-faint/40')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

function useClock(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

const NO_STATES: string[] = [];

/** "You're in a call" card: status, timer, who's here (talking ring), and big round controls. */
export function VoicePanel() {
  const v = useVoice();
  const channel = useStore((s) => (v.channelId ? s.channels[v.channelId] : undefined));
  const server = useStore((s) => (channel?.serverId ? s.servers[channel.serverId] : undefined));
  const me = useStore((s) => s.me);
  const people = useStoreShallow((s) => (v.channelId ? Object.values(s.voiceStates).filter((x) => x.channelId === v.channelId).map((x) => x.userId) : NO_STATES));
  const nav = useNavigate();
  const [share, setShare] = useState(false);
  const now = useClock(v.state === 'connected');
  const connected = v.state === 'connected';
  const label = connected ? 'Voz conectada' : v.state === 'connecting' ? 'Conectando…' : v.state === 'reconnecting' ? 'Reconectando…' : 'Falha na conexão';
  const color = connected ? 'text-ok' : v.state === 'failed' ? 'text-danger' : 'text-warn';
  const goto = () => channel && nav(channel.serverId ? `/channels/${channel.serverId}/${channel.id}` : `/channels/@me/${channel.id}`);

  return (
    <AnimatePresence>
      {v.channelId && v.state !== 'idle' && (
        <motion.div
          key="voice-panel"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={spring.gentle}
          className={clsx('panel relative overflow-hidden p-3', connected ? 'border-ok/25' : 'border-warn/25')}
        >
          {/* living backdrop: accent glow + a shimmer line that runs while connected */}
          <span className={clsx('pointer-events-none absolute -top-16 left-1/2 h-32 w-56 -translate-x-1/2 rounded-full blur-3xl', connected ? 'bg-ok/20' : 'bg-warn/20')} />
          {connected && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
              <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-ok to-transparent" style={{ animation: 'cz-drift 2.8s linear infinite' }} />
            </span>
          )}
          <div className="relative flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className={clsx('flex items-center gap-1.5 text-[13px] font-extrabold', color)}>
                <QualityBars q={me ? v.quality[me.id] : undefined} />
                {label}
                {v.pingMs !== null && connected && <span className="rounded-md bg-line/[0.06] px-1.5 text-[10.5px] font-semibold tabular-nums text-fg-muted">{v.pingMs} ms</span>}
              </div>
              <button className="mt-0.5 block max-w-full truncate text-left text-[12.5px] font-semibold text-fg-strong hover:underline" onClick={goto}>
                {channel ? (channel.serverId ? channel.name : dmName(channel)) : ''}
                {server && <span className="font-normal text-fg-muted"> · {server.name}</span>}
              </button>
            </div>
            {connected && v.connectedAt && <span className="rounded-lg bg-line/[0.06] px-2 py-1 text-[11px] font-bold tabular-nums text-fg-muted">{fmtTime(now - v.connectedAt)}</span>}
          </div>

          {people.length > 0 && (
            <button onClick={goto} className="relative mt-2.5 flex items-center gap-2" title="Abrir a call">
              <span className="flex -space-x-2">
                <AnimatePresence initial={false}>
                  {people.slice(0, 6).map((id) => (
                    <motion.span key={id} layout initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring.snappy} className={clsx('rounded-full ring-2 ring-bg-side', v.speaking[id] && 'speaking')}>
                      <Avatar userId={id} size={24} />
                    </motion.span>
                  ))}
                </AnimatePresence>
              </span>
              {people.length > 6 && <span className="text-[11px] font-bold text-fg-muted">+{people.length - 6}</span>}
              <span className="text-[11px] text-fg-muted">{people.length === 1 ? 'só você por aqui' : `${people.length} pessoas`}</span>
            </button>
          )}

          {connected && (
            <div className="relative mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
              <CallBtn on={v.camera} disabled={!v.canVideo} onClick={() => void toggleCamera()} icon={v.camera ? 'camera' : 'cameraOff'} label="Câmera" tone="ok" />
              <CallBtn on={v.screen} disabled={!v.canVideo} onClick={() => (v.screen ? void stopScreenShare() : setShare(true))} icon={v.screen ? 'screenOff' : 'screen'} label={v.screen ? 'Parar' : 'Tela'} tone="danger" />
              <Tooltip label="Desconectar">
                <motion.button whileHover={{ rotate: 12 }} whileTap={{ scale: 0.85 }} transition={spring.snappy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger text-white shadow-[0_8px_20px_-8px_rgb(var(--danger)/0.9)] hover:bg-danger/85" onClick={() => void leaveVoice()} aria-label="Desconectar">
                  <Icon name="hangup" size={18} />
                </motion.button>
              </Tooltip>
            </div>
          )}
          {share && <ScreenShareModal onClose={() => setShare(false)} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CallBtn({ on, disabled, onClick, icon, label, tone }: { on: boolean; disabled?: boolean; onClick: () => void; icon: IconName; label: string; tone: 'ok' | 'danger' }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={spring.snappy}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Sem permissão de vídeo' : label}
      className={clsx(
        'relative flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-xl text-[12.5px] font-bold transition-colors disabled:opacity-40',
        on ? (tone === 'ok' ? 'bg-ok/15 text-ok ring-1 ring-ok/30' : 'bg-danger/15 text-danger ring-1 ring-danger/30') : 'bg-line/[0.06] text-fg hover:bg-line/[0.11]',
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={icon} initial={{ scale: 0.4, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring.snappy} className="flex">
          <Icon name={icon} size={16} />
        </motion.span>
      </AnimatePresence>
      {label}
    </motion.button>
  );
}
