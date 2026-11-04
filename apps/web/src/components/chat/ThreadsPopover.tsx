import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel } from '@aldetes/shared';
import { api } from '@/lib/api';
import { Icon } from '../common/Icon';
import { toastError } from '../common/overlay';

export function ThreadsPopover({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [threads, setThreads] = useState<Array<Channel & { messageCount: number; archived: boolean }> | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    api<Array<Channel & { messageCount: number; archived: boolean }>>('GET', `/channels/${channelId}/threads`).then(setThreads, toastError);
  }, [channelId]);
  return (
    <div className="absolute right-4 top-2 z-30 flex max-h-[70vh] w-[380px] animate-pop flex-col overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-float shadow-float">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-extrabold tracking-tight text-fg-strong">Threads</h3>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="scroll-thin overflow-y-auto p-2 pt-0">
        {threads?.length === 0 && <p className="p-6 text-center text-sm text-fg-muted">Nenhuma thread ainda. Use "Criar thread" no menu de uma mensagem.</p>}
        {threads?.map((t) => (
          <button key={t.id} className="flex w-full items-center gap-3 rounded p-2 text-left hover:bg-fg/10" onClick={() => (onClose(), nav(`/channels/${t.serverId}/${t.id}`))}>
            <Icon name="thread" className="text-fg-muted" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-fg-strong">{t.name}</div>
              <div className="text-xs text-fg-muted">{t.messageCount} mensagens</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
