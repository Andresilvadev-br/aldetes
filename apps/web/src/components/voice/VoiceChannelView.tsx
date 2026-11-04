import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, channelPermissions, displayName, useStoreShallow } from '@/store';
import { joinVoice, useVoice } from '@/lib/voice';
import { VoiceStage } from './VoiceStage';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';

export function VoiceChannelView({ channelId }: { channelId: string }) {
  const channel = useStore((s) => s.channels[channelId])!;
  const v = { channelId: useVoice((s) => s.channelId), state: useVoice((s) => s.state) };
  const states = useStoreShallow((s) => Object.values(s.voiceStates).filter((x) => x.channelId === channelId));
  const canConnect = hasPermission(channelPermissions(channelId), Permissions.CONNECT);
  const inThis = v.channelId === channelId && v.state !== 'idle';
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/[0.06] px-5">
        <span className="tile h-8 w-8 bg-ok/15 text-ok"><Icon name="speaker" size={17} /></span>
        <h1 className="text-[15px] font-extrabold tracking-tight text-fg-strong">{channel.name}</h1>
        {states.length > 0 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">{states.length} na voz</span>}
      </header>
      {inThis && v.state !== 'connecting' ? (
        <VoiceStage channelId={channelId} />
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
