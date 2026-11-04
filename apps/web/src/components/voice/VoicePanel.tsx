import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useStore } from '@/store';
import { leaveVoice, toggleCamera, stopScreenShare, useVoice, ConnectionQuality } from '@/lib/voice';
import { Icon } from '../common/Icon';
import { Tooltip } from '../common/overlay';
import { motion } from 'motion/react';
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

export function VoicePanel() {
  const v = useVoice();
  const channel = useStore((s) => (v.channelId ? s.channels[v.channelId] : undefined));
  const server = useStore((s) => (channel?.serverId ? s.servers[channel.serverId] : undefined));
  const me = useStore((s) => s.me);
  const nav = useNavigate();
  const [share, setShare] = useState(false);
  if (!v.channelId || v.state === 'idle') return null;
  const label = v.state === 'connected' ? 'Voz conectada' : v.state === 'connecting' ? 'Conectando…' : v.state === 'reconnecting' ? 'Reconectando…' : 'Falha na conexão';
  const color = v.state === 'connected' ? 'text-ok' : v.state === 'failed' ? 'text-danger' : 'text-warn';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} className="panel overflow-hidden px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className={clsx('flex items-center gap-1.5 text-sm font-semibold', color)}>
            <QualityBars q={me ? v.quality[me.id] : undefined} />
            {label}
            {v.pingMs !== null && v.state === 'connected' && <span className="text-xs font-normal text-fg-faint">{v.pingMs} ms</span>}
          </div>
          <button
            className="block max-w-full truncate text-xs text-fg-muted hover:underline"
            onClick={() => channel && nav(channel.serverId ? `/channels/${channel.serverId}/${channel.id}` : `/channels/@me/${channel.id}`)}
          >
            {channel ? (channel.serverId ? `${channel.name} / ${server?.name ?? ''}` : dmName(channel)) : ''}
          </button>
        </div>
        <Tooltip label="Desconectar">
          <button className="icon-btn hover:text-danger" onClick={() => void leaveVoice()} aria-label="Desconectar">
            <Icon name="hangup" />
          </button>
        </Tooltip>
      </div>
      {v.state === 'connected' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            disabled={!v.canVideo}
            className={clsx('btn h-8 px-2 text-[13px]', v.camera ? 'bg-ok/15 text-ok' : 'bg-line/[0.06] text-fg hover:bg-line/[0.1]')}
            onClick={() => void toggleCamera()}
            title={v.canVideo ? 'Câmera' : 'Sem permissão de vídeo'}
          >
            <Icon name={v.camera ? 'camera' : 'cameraOff'} size={18} /> Câmera
          </button>
          <button
            disabled={!v.canVideo}
            className={clsx('btn h-8 px-2 text-[13px]', v.screen ? 'bg-danger/15 text-danger' : 'bg-line/[0.06] text-fg hover:bg-line/[0.1]')}
            onClick={() => (v.screen ? void stopScreenShare() : setShare(true))}
            title={v.canVideo ? 'Compartilhar tela' : 'Sem permissão de vídeo'}
          >
            <Icon name={v.screen ? 'screenOff' : 'screen'} size={18} /> {v.screen ? 'Parar' : 'Tela'}
          </button>
        </div>
      )}
      {share && <ScreenShareModal onClose={() => setShare(false)} />}
    </motion.div>
  );
}
