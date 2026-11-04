import { useStore, useStoreShallow } from '@/store';
import { joinVoice, useVoice } from '@/lib/voice';
import { VoiceStage } from './VoiceStage';
import { Avatar } from '../common/Avatar';

/** Call area on top of a DM conversation. */
export function CallStage({ channelId }: { channelId: string }) {
  const inCall = useVoice((v) => v.channelId === channelId && v.state !== 'idle');
  const connecting = useVoice((v) => v.channelId === channelId && v.state === 'connecting');
  const states = useStoreShallow((s) => Object.values(s.voiceStates).filter((x) => x.channelId === channelId));
  if (inCall && !connecting) return <VoiceStage channelId={channelId} compact />;
  return (
    <div className="flex h-56 shrink-0 flex-col items-center justify-center gap-3 border-b border-line/[0.06] bg-black/30">
      <div className="flex -space-x-3">
        {states.map((s) => (
          <Avatar key={s.userId} userId={s.userId} size={64} className="rounded-full ring-4 ring-bg-main" />
        ))}
      </div>
      <button className="btn rounded-full bg-ok px-6 text-white shadow-[0_10px_28px_-10px_rgb(var(--ok))] hover:bg-ok/85" disabled={connecting} onClick={() => void joinVoice(channelId)}>
        {connecting ? 'Conectando…' : 'Entrar na chamada'}
      </button>
    </div>
  );
}
