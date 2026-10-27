import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useStoreShallow } from '@/store';
import { Modal, toastError } from '../common/overlay';
import { Avatar } from '../common/Avatar';
import { api } from '@/lib/api';

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const friends = useStoreShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'friend'));
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const create = async () => {
    try {
      const c = await api<{ id: string }>('POST', '/users/@me/channels', { recipientIds: sel });
      onClose();
      nav(`/channels/@me/${c.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal
      onClose={onClose}
      title="Selecionar amigos"
      subtitle={`Você pode adicionar mais ${9 - sel.length} amigo(s).`}
      footer={
        <button className="btn-primary w-full" disabled={!sel.length} onClick={create}>
          {sel.length > 1 ? 'Criar DM em grupo' : 'Criar DM'}
        </button>
      }
    >
      <input className="input mb-3" placeholder="Digite o nome de usuário de um amigo" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-72 overflow-y-auto">
        {friends
          .filter((f) => f.user.username.includes(q.toLowerCase()) || f.user.displayName.toLowerCase().includes(q.toLowerCase()))
          .map((f) => (
            <label key={f.userId} className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-fg/10">
              <Avatar userId={f.userId} size={32} showStatus />
              <span className="flex-1 text-fg-strong">
                {f.user.displayName} <span className="text-sm text-fg-muted">{f.user.username}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand"
                checked={sel.includes(f.userId)}
                disabled={!sel.includes(f.userId) && sel.length >= 9}
                onChange={(e) => setSel(e.target.checked ? [...sel, f.userId] : sel.filter((x) => x !== f.userId))}
              />
            </label>
          ))}
        {!friends.length && <p className="p-4 text-center text-sm text-fg-muted">Adicione amigos para criar um grupo.</p>}
      </div>
    </Modal>
  );
}
