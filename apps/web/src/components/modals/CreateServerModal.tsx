import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, toastError } from '../common/overlay';
import { api } from '@/lib/api';
import { useStore } from '@/store';

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState(`Servidor de ${me.displayName}`);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const create = async () => {
    setBusy(true);
    try {
      const s = await api<{ id: string }>('POST', '/servers', { name });
      onClose();
      nav(`/channels/${s.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    const code = invite.trim().split('/').pop()!;
    setBusy(true);
    try {
      const s = await api<{ id: string }>('POST', `/invites/${encodeURIComponent(code)}`);
      onClose();
      nav(`/channels/${s.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return mode === 'create' ? (
    <Modal
      onClose={onClose}
      title="Crie seu servidor"
      subtitle="Seu servidor é onde você e seus amigos se encontram. Crie o seu e comece a conversar."
      footer={
        <div className="flex w-full items-center justify-between">
          <button className="btn-ghost px-0" onClick={() => setMode('join')}>
            Já tem um convite?
          </button>
          <button className="btn-primary" disabled={busy || name.trim().length < 2} onClick={create}>
            Criar
          </button>
        </div>
      }
    >
      <label className="label">Nome do servidor</label>
      <input className="input" aria-label="Nome do servidor" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && create()} />
      <p className="mt-2 pb-2 text-xs text-fg-faint">Você poderá alterar o ícone e as configurações depois.</p>
    </Modal>
  ) : (
    <Modal
      onClose={onClose}
      title="Entrar em um servidor"
      subtitle="Insira um convite abaixo para entrar em um servidor existente."
      footer={
        <div className="flex w-full items-center justify-between">
          <button className="btn-ghost px-0" onClick={() => setMode('create')}>
            Voltar
          </button>
          <button className="btn-primary" disabled={busy || !invite.trim()} onClick={join}>
            Entrar no servidor
          </button>
        </div>
      }
    >
      <label className="label">Link do convite</label>
      <input className="input" placeholder="https://…/#/invite/AbCd2345 ou AbCd2345" value={invite} onChange={(e) => setInvite(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && join()} />
    </Modal>
  );
}
