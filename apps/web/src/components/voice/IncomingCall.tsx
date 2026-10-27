import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onGateway } from '@/lib/gateway';
import { useStore, displayName } from '@/store';
import { joinVoice, useVoice } from '@/lib/voice';
import { playSound } from '@/lib/sounds';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { desktop } from '@/lib/desktop';

export function IncomingCall() {
  const [call, setCall] = useState<{ channelId: string; from: string } | null>(null);
  const nav = useNavigate();
  const myStatus = useStore((s) => s.me?.status);
  useEffect(
    () =>
      onGateway('call:ring', (d: { channelId: string; from: string }) => {
        if (useVoice.getState().channelId === d.channelId || myStatus === 'dnd') return;
        setCall(d);
        desktop?.notify('Chamada recebida', `${displayName(d.from)} está te chamando`, `call-${d.channelId}`);
      }),
    [myStatus],
  );
  useEffect(() => {
    if (!call) return;
    playSound('ring');
    const t = setInterval(() => playSound('ring'), 2500);
    const stop = setTimeout(() => setCall(null), 30000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [call]);
  // stop ringing if caller left
  const callerStillThere = useStore((s) => (call ? s.voiceStates[call.from]?.channelId === call.channelId : false));
  useEffect(() => {
    if (call && !callerStillThere) {
      const t = setTimeout(() => setCall(null), 1500);
      return () => clearTimeout(t);
    }
  }, [call, callerStillThere]);
  if (!call) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-64 animate-slideUp flex-col items-center gap-3 rounded-xl bg-bg-float p-5 shadow-2xl ring-1 ring-black/30">
      <Avatar userId={call.from} size={80} />
      <div className="text-center">
        <div className="font-bold text-fg-strong">{displayName(call.from)}</div>
        <div className="text-sm text-fg-muted">Chamada recebida…</div>
      </div>
      <div className="flex gap-6">
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white" onClick={() => setCall(null)} title="Recusar">
          <Icon name="hangup" />
        </button>
        <button
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ok text-white"
          title="Atender"
          onClick={() => {
            const c = call;
            setCall(null);
            nav(`/channels/@me/${c.channelId}`);
            void joinVoice(c.channelId);
          }}
        >
          <Icon name="phone" />
        </button>
      </div>
    </div>
  );
}
