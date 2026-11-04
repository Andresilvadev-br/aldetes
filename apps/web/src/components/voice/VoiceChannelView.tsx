import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, channelPermissions, displayName, useStoreShallow } from '@/store';
import { joinVoice, useVoice } from '@/lib/voice';
import { VoiceStage } from './VoiceStage';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { motion } from 'motion/react';
import { MobileBack } from '../layout/MobileBack';
import { dur, ease } from '@/lib/motion';

/** Honest connection state: never "conectado" before the server confirms. */
function ConnChip({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    connecting: ['Conectando…', 'bg-warn/15 text-warn'],
    connected: ['Conectado', 'bg-ok/15 text-ok'],
    reconnecting: ['Reconectando…', 'bg-warn/15 text-warn'],
    failed: ['Sem conexão', 'bg-danger/15 text-danger'],
  };
  const [label, cls] = map[state] ?? ['', ''];
  if (!label) return null;
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${state !== 'connected' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

export function VoiceChannelView({ channelId }: { channelId: string }) {
  const channel = useStore((s) => s.channels[channelId])!;
  const v = { channelId: useVoice((s) => s.channelId), state: useVoice((s) => s.state) };
  const states = useStoreShallow((s) => Object.values(s.voiceStates).filter((x) => x.channelId === channelId));
  const canConnect = hasPermission(channelPermissions(channelId), Permissions.CONNECT);
  const inThis = v.channelId === channelId && v.state !== 'idle';
  const live = states.filter((x) => x.streaming).length;
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/[0.06] px-3 sm:px-5">
        <MobileBack />
        <span className="tile h-8 w-8 bg-ok/15 text-ok"><Icon name="speaker" size={17} /></span>
        <h1 className="text-[15px] font-extrabold tracking-tight text-fg-strong">{channel.name}</h1>
        {inThis && <ConnChip state={v.state} />}
        {states.length > 0 && (
          <span className="truncate text-xs text-fg-muted">
            {states.length} {states.length === 1 ? 'pessoa' : 'pessoas'}
            {live > 0 && ` · ${live} ${live === 1 ? 'transmissão' : 'transmissões'}`}
          </span>
        )}
        <span className="flex-1" />
        {live > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-[11px] font-black tracking-wide text-white shadow-[0_0_16px_rgb(var(--danger)/0.5)]">
            <span className="rec-dot h-1.5 w-1.5 rounded-full bg-white" /> AO VIVO
          </span>
        )}
      </header>
      {inThis && v.state !== 'connecting' ? (
        <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.structural, ease: ease.out }}>
          <VoiceStage channelId={channelId} />
        </motion.div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-fg-strong">
          <div className="flex -space-x-3">
            {states.slice(0, 6).map((s) => (
              <Avatar key={s.userId} userId={s.userId} size={56} className="rounded-full ring-4 ring-bg-main" />
            ))}
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">{channel.name}</h2>
          <p className="text-fg-muted">{states.length ? `${states.map((s) => displayName(s.userId, channel.serverId)).slice(0, 3).join(', ')}${states.length > 3 ? ` e mais ${states.length - 3}` : ''} na voz` : 'Ninguém está na voz no momento.'}</p>
          <button className="btn-primary rounded-full px-7 py-3 text-[15px]" disabled={!canConnect || v.state === 'connecting'} onClick={() => void joinVoice(channelId)}>
            {v.state === 'connecting' && v.channelId === channelId ? 'Conectando…' : canConnect ? 'Entrar na voz' : 'Sem permissão para conectar'}
          </button>
        </div>
      )}
    </div>
  );
}
