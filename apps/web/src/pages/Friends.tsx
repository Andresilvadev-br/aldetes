import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Message } from '@aldetes/shared';
import { useStore, useStoreShallow } from '@/store';
import { api } from '@/lib/api';
import { openDm } from '@/lib/actions';
import { Avatar, STATUS_LABEL } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { Tooltip, toastError, useContextMenu } from '@/components/common/overlay';
import { useMemberMenu } from '@/components/common/UserPopout';
import { MiniMessage } from '@/components/chat/MiniMessage';
import { joinVoice } from '@/lib/voice';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add' | 'saved';

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>('online');
  const rels = useStoreShallow((s) => Object.values(s.relationships));
  const presences = useStore((s) => s.presences);
  const pendingCount = rels.filter((r) => r.type === 'incoming').length;
  const list = rels.filter((r) =>
    tab === 'online' ? r.type === 'friend' && (presences[r.userId]?.status ?? 'offline') !== 'offline' : tab === 'all' ? r.type === 'friend' : tab === 'pending' ? r.type === 'incoming' || r.type === 'outgoing' : r.type === 'blocked',
  );
  const tabBtn = (t: Tab, label: string, extra?: React.ReactNode) => (
    <button onClick={() => setTab(t)} className={clsx('flex items-center gap-1 rounded px-2 py-0.5', tab === t ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10 hover:text-fg')}>
      {label}
      {extra}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-black/30 px-4 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-fg-strong">
          <Icon name="users" className="text-fg-muted" /> Amigos
        </div>
        <div className="h-6 w-px bg-line/10" />
        {tabBtn('online', 'Disponível')}
        {tabBtn('all', 'Todos')}
        {tabBtn('pending', 'Pendente', pendingCount > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pendingCount}</span>)}
        {tabBtn('blocked', 'Bloqueado')}
        {tabBtn('saved', 'Salvas')}
        <button onClick={() => setTab('add')} className={clsx('rounded px-2 py-0.5 font-medium', tab === 'add' ? 'text-ok' : 'bg-ok text-white')}>
          Adicionar amigo
        </button>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-4">
        {tab === 'add' ? (
          <AddFriend />
        ) : tab === 'saved' ? (
          <SavedMessages />
        ) : (
          <>
            <div className="mb-2 text-xs font-semibold uppercase text-fg-muted">
              {{ online: 'Disponível', all: 'Todos os amigos', pending: 'Pendente', blocked: 'Bloqueados' }[tab]} — {list.length}
            </div>
            {list.map((r) => (
              <FriendRow key={r.userId} userId={r.userId} type={r.type} />
            ))}
            {!list.length && <p className="py-16 text-center text-fg-muted">{tab === 'online' ? 'Nenhum amigo disponível no momento.' : 'Nada por aqui.'}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function FriendRow({ userId, type }: { userId: string; type: string }) {
  const user = useStore((s) => s.users[userId] ?? s.relationships[userId]?.user);
  const presence = useStore((s) => s.presences[userId]);
  const nav = useNavigate();
  const menu = useContextMenu();
  const items = useMemberMenu(userId, null);
  if (!user) return null;
  const act = (method: string, body?: unknown) => api(method, `/relationships/${userId}`, body).catch(toastError);
  return (
    <div
      className="group flex cursor-pointer items-center gap-3 border-t border-line/5 px-2 py-3 hover:rounded-lg hover:bg-fg/5"
      onClick={async () => type === 'friend' && nav(`/channels/@me/${await openDm(userId)}`)}
      onContextMenu={(e) => menu(e, items())}
    >
      <Avatar userId={userId} size={32} showStatus={type === 'friend'} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-fg-strong">
          {user.displayName} <span className="hidden text-sm font-normal text-fg-muted group-hover:inline">{user.username}</span>
        </div>
        <div className="truncate text-xs text-fg-muted">
          {type === 'incoming' ? 'Solicitação de amizade recebida' : type === 'outgoing' ? 'Solicitação de amizade enviada' : type === 'blocked' ? 'Bloqueado' : presence?.customStatus || STATUS_LABEL[presence?.status ?? 'offline']}
        </div>
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {type === 'friend' && (
          <>
            <Tooltip label="Mensagem">
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-side text-fg-muted hover:text-fg-strong" onClick={async () => nav(`/channels/@me/${await openDm(userId)}`)}>
                <Icon name="reply" size={18} />
              </button>
            </Tooltip>
            <Tooltip label="Chamada de voz">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-side text-fg-muted hover:text-fg-strong"
                onClick={async () => {
                  const id = await openDm(userId);
                  nav(`/channels/@me/${id}`);
                  void joinVoice(id);
                }}
              >
                <Icon name="phone" size={18} />
              </button>
            </Tooltip>
          </>
        )}
        {type === 'incoming' && (
          <Tooltip label="Aceitar">
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-side text-fg-muted hover:text-ok" onClick={() => act('PUT', { type: 'friend' })}>
              <Icon name="check" size={18} />
            </button>
          </Tooltip>
        )}
        {(type === 'incoming' || type === 'outgoing' || type === 'blocked') && (
          <Tooltip label={type === 'blocked' ? 'Desbloquear' : type === 'incoming' ? 'Recusar' : 'Cancelar'}>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-side text-fg-muted hover:text-danger" onClick={() => act('DELETE')}>
              <Icon name="x" size={18} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function AddFriend() {
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async () => {
    try {
      await api('POST', '/relationships', { username: username.trim() });
      setMsg({ ok: true, text: `Sucesso! Sua solicitação de amizade para ${username} foi enviada.` });
      setUsername('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <div>
      <h2 className="mb-1 font-bold uppercase text-fg-strong">Adicionar amigo</h2>
      <p className="mb-4 text-sm text-fg-muted">Você pode adicionar amigos com o nome de usuário deles.</p>
      <div className={clsx('flex items-center rounded-lg bg-bg-rail p-2 ring-1', msg ? (msg.ok ? 'ring-ok' : 'ring-danger') : 'ring-black/20 focus-within:ring-brand')}>
        <input className="flex-1 bg-transparent px-2 text-fg-strong outline-none" placeholder="Digite um nome de usuário" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && username && submit()} />
        <button className="btn-primary py-1.5" disabled={!username.trim()} onClick={submit}>
          Enviar solicitação
        </button>
      </div>
      {msg && <p className={clsx('mt-2 text-sm', msg.ok ? 'text-ok' : 'text-danger')}>{msg.text}</p>}
    </div>
  );
}

function SavedMessages() {
  const [list, setList] = useState<Message[] | null>(null);
  const load = () => api<Message[]>('GET', '/users/@me/saved').then(setList, toastError);
  useEffect(() => void load(), []);
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 font-bold text-fg-strong">Mensagens salvas</h2>
      {list?.length === 0 && <p className="text-fg-muted">Use "Salvar mensagem" no menu de uma mensagem para guardá-la aqui.</p>}
      <div className="flex flex-col gap-2">
        {list?.map((m) => (
          <div key={m.id} className="relative">
            <MiniMessage m={m} serverId={useStore.getState().channels[m.channelId]?.serverId ?? null} />
            <button className="absolute right-2 top-2 icon-btn hover:text-danger" title="Remover" onClick={() => api('DELETE', `/users/@me/saved/${m.id}`).then(load, toastError)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
