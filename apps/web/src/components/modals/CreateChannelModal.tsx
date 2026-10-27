import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, type Channel } from '@aldetes/shared';
import { get } from '@/store';
import { Modal, toastError } from '../common/overlay';
import { Icon, type IconName } from '../common/Icon';
import { api } from '@/lib/api';

const TYPES: Array<{ type: Channel['type']; icon: IconName; label: string; desc: string }> = [
  { type: 'text', icon: 'hash', label: 'Texto', desc: 'Envie mensagens, imagens, GIFs, emoji, opiniões e piadas' },
  { type: 'voice', icon: 'speaker', label: 'Voz', desc: 'Converse com voz, vídeo e compartilhamento de tela' },
  { type: 'announcement', icon: 'megaphone', label: 'Anúncios', desc: 'Apenas moderadores publicam; todos leem' },
  { type: 'forum', icon: 'forum', label: 'Fórum', desc: 'Espaço organizado para discussões em postagens' },
];

export function CreateChannelModal({ serverId, parentId, initialType, onClose }: { serverId: string; parentId: string | null; initialType?: Channel['type']; onClose: () => void }) {
  const [type, setType] = useState<Channel['type']>(initialType ?? 'text');
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const nav = useNavigate();
  const isCat = type === 'category';
  const create = async () => {
    try {
      const c = await api<Channel>('POST', `/servers/${serverId}/channels`, { name, type, parentId });
      if (isPrivate) {
        const everyone = Object.values(get().roles[serverId] ?? {}).find((r) => r.isEveryone)!;
        await api('PUT', `/channels/${c.id}/permissions/role/${everyone.id}`, { allow: '0', deny: Permissions.VIEW_CHANNEL.toString() });
      }
      onClose();
      if (!isCat) nav(`/channels/${serverId}/${c.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal
      onClose={onClose}
      title={isCat ? 'Criar categoria' : 'Criar canal'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!name.trim()} onClick={create}>
            Criar
          </button>
        </>
      }
    >
      {!isCat && (
        <>
          <label className="label">Tipo de canal</label>
          <div className="mb-4 flex flex-col gap-2">
            {TYPES.map((t) => (
              <button key={t.type} onClick={() => setType(t.type)} className={clsx('flex items-center gap-3 rounded p-3 text-left', type === t.type ? 'bg-fg/15' : 'bg-bg-side hover:bg-fg/10')}>
                <Icon name={t.icon} size={24} className="text-fg-muted" />
                <div className="flex-1">
                  <div className="font-medium text-fg-strong">{t.label}</div>
                  <div className="text-xs text-fg-muted">{t.desc}</div>
                </div>
                <span className={clsx('h-5 w-5 rounded-full border-2', type === t.type ? 'border-[6px] border-brand' : 'border-fg-muted')} />
              </button>
            ))}
          </div>
        </>
      )}
      <label className="label">{isCat ? 'Nome da categoria' : 'Nome do canal'}</label>
      <input
        className="input"
        value={name}
        maxLength={100}
        placeholder={isCat ? 'Nova categoria' : 'novo-canal'}
        onChange={(e) => setName(type === 'voice' || isCat ? e.target.value : e.target.value.toLowerCase().replace(/\s/g, '-'))}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
      />
      <label className="mt-4 flex items-center justify-between pb-2 text-sm text-fg">
        <span className="flex items-center gap-2">
          <Icon name="lock" size={16} /> {isCat ? 'Categoria privada' : 'Canal privado'}
        </span>
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
      </label>
    </Modal>
  );
}
