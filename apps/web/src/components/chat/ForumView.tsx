import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Permissions, hasPermission, type Channel } from '@aldetes/shared';
import { api } from '@/lib/api';
import { useStore, channelPermissions } from '@/store';
import { Icon } from '../common/Icon';
import { Modal, toastError } from '../common/overlay';
import { onGateway } from '@/lib/gateway';

type Post = Channel & { messageCount: number; archived: boolean };

export function ForumView({ channelId }: { channelId: string }) {
  const channel = useStore((s) => s.channels[channelId])!;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const canPost = hasPermission(channelPermissions(channelId), Permissions.CREATE_THREADS);
  useEffect(() => {
    const load = () => api<Post[]>('GET', `/channels/${channelId}/threads`).then(setPosts, toastError);
    load();
    return onGateway('channel:create', (c: Channel) => c.parentId === channelId && load());
  }, [channelId]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/[0.06] px-5">
        <span className="tile h-8 w-8 bg-brand/15 text-brand"><Icon name="forum" size={17} /></span>
        <h1 className="text-[15px] font-extrabold tracking-tight text-fg-strong">{channel.name}</h1>
        {channel.topic && <p className="ml-2 truncate text-sm text-fg-muted">{channel.topic}</p>}
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {canPost && (
            <button className="btn-primary mb-4" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> Nova postagem
            </button>
          )}
          {posts?.length === 0 && <p className="py-12 text-center text-fg-muted">Ainda não há postagens. Seja a primeira pessoa a publicar!</p>}
          <div className="flex flex-col gap-2">
            {posts?.map((p) => (
              <button key={p.id} data-glow onClick={() => nav(`/channels/${p.serverId}/${p.id}`)} className="card p-4 text-left transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand/30">
                <div className="text-lg font-semibold text-fg-strong">{p.name}</div>
                <div className="mt-1 flex items-center gap-1 text-sm text-fg-muted">
                  <Icon name="forum" size={14} /> {Math.max(0, p.messageCount)} mensagens · {new Date(Number((BigInt(p.id) >> 22n) + 1735689600000n)).toLocaleDateString('pt-BR')}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {creating && <NewPost channelId={channelId} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewPost({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const nav = useNavigate();
  const submit = async () => {
    try {
      const t = await api<Channel>('POST', `/channels/${channelId}/threads`, { name, content });
      onClose();
      nav(`/channels/${t.serverId}/${t.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal onClose={onClose} title="Nova postagem" footer={<button className="btn-primary" disabled={!name.trim() || !content.trim()} onClick={submit}>Publicar</button>}>
      <label className="label">Título</label>
      <input className="input mb-3" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      <label className="label">Mensagem</label>
      <textarea className="input min-h-[120px]" value={content} maxLength={4000} onChange={(e) => setContent(e.target.value)} />
    </Modal>
  );
}
