import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel, Message } from '@aldetes/shared';
import { api } from '@/lib/api';
import { get } from '@/store';
import { MiniMessage } from './MiniMessage';
import { Icon } from '../common/Icon';
import { toastError } from '../common/overlay';

export function SearchPanel({ channel, initial, onClose }: { channel: Channel; initial: string; onClose: () => void }) {
  const [q, setQ] = useState(initial);
  const [scope, setScope] = useState<'channel' | 'server'>(channel.serverId ? 'server' : 'channel');
  const [has, setHas] = useState<'' | 'attachment' | 'image' | 'link'>('');
  const [res, setRes] = useState<{ total: number; messages: Message[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const nav = useNavigate();

  useEffect(() => setQ(initial), [initial]);
  useEffect(() => {
    const p = new URLSearchParams({ q, offset: String(offset) });
    if (scope === 'server' && channel.serverId) p.set('serverId', channel.serverId);
    else p.set('channelId', channel.id);
    if (has) p.set('has', has);
    let alive = true;
    api<{ total: number; messages: Message[] }>('GET', `/search/messages?${p}`).then((r) => alive && setRes(r), toastError);
    return () => {
      alive = false;
    };
  }, [q, scope, has, offset, channel]);

  return (
    <aside className="flex w-[420px] shrink-0 animate-slideUp flex-col border-l border-line/[0.06] bg-line/[0.015]">
      <div className="flex items-center gap-2 p-3">
        <input className="input py-1.5 text-sm" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
        <button className="icon-btn" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
        {channel.serverId && (
          <select className="rounded bg-bg-rail px-2 py-1 text-fg" value={scope} onChange={(e) => (setScope(e.target.value as 'channel' | 'server'), setOffset(0))}>
            <option value="server">Todo o servidor</option>
            <option value="channel">Este canal</option>
          </select>
        )}
        <select className="rounded bg-bg-rail px-2 py-1 text-fg" value={has} onChange={(e) => (setHas(e.target.value as typeof has), setOffset(0))}>
          <option value="">Qualquer conteúdo</option>
          <option value="attachment">Com anexo</option>
          <option value="image">Com imagem</option>
          <option value="link">Com link</option>
        </select>
        <span className="ml-auto self-center text-fg-muted">{res ? `${res.total} resultado(s)` : 'Buscando…'}</span>
      </div>
      <div className="scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto p-3 pt-0">
        {res?.messages.map((m) => (
          <div key={m.id}>
            <div className="mb-1 text-xs text-fg-muted">#{get().channels[m.channelId]?.name ?? '?'}</div>
            <MiniMessage
              m={m}
              serverId={channel.serverId}
              onJump={() => {
                const c = get().channels[m.channelId];
                if (c) nav(c.serverId ? `/channels/${c.serverId}/${c.id}` : `/channels/@me/${c.id}`);
              }}
            />
          </div>
        ))}
        {res && res.total > offset + 25 && (
          <button className="btn-secondary" onClick={() => setOffset(offset + 25)}>
            Mais resultados
          </button>
        )}
      </div>
    </aside>
  );
}
