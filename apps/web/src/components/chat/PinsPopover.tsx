import { useEffect, useState } from 'react';
import type { Message } from '@aldetes/shared';
import { api } from '@/lib/api';
import { onGateway } from '@/lib/gateway';
import { useStore } from '@/store';
import { MiniMessage } from './MiniMessage';
import { Icon } from '../common/Icon';
import { toastError } from '../common/overlay';

export function PinsPopover({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [pins, setPins] = useState<Message[] | null>(null);
  const serverId = useStore((s) => s.channels[channelId]?.serverId ?? null);
  useEffect(() => {
    const load = () => api<Message[]>('GET', `/channels/${channelId}/pins`).then(setPins, toastError);
    load();
    return onGateway('pin:update', (d: { channelId: string }) => d.channelId === channelId && load());
  }, [channelId]);
  return (
    <div className="absolute right-4 top-2 z-30 flex max-h-[70vh] w-[420px] animate-pop flex-col overflow-hidden rounded-lg bg-bg-float shadow-2xl ring-1 ring-black/30">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-semibold text-fg-strong">Mensagens fixadas</h3>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="scroll-thin flex flex-col gap-2 overflow-y-auto p-3 pt-0">
        {pins === null && <p className="p-4 text-center text-fg-muted">Carregando…</p>}
        {pins?.length === 0 && <p className="p-6 text-center text-fg-muted">Este canal não tem mensagens fixadas.</p>}
        {pins?.map((m) => (
          <MiniMessage key={m.id} m={m} serverId={serverId} onJump={() => document.querySelector(`[data-message-id="${m.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        ))}
      </div>
    </div>
  );
}
