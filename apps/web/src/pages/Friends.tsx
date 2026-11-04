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
import { activityLine } from '@/lib/activity';
import { motion } from 'motion/react';
import { spring, greeting } from '@/lib/motion';

/** Home header: greeting, clock and live stats (all real data). */
function Greeting() {
  const me = useStore((s) => s.me)!;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const friendsOnline = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'friend' && (s.presences[r.userId]?.status ?? 'offline') !== 'offline').length);
  const inVoice = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 'friend' && s.voiceStates[r.userId]).length);
  const mentions = useStore((s) => Object.values(s.readStates).reduce((a, r) => a + r.mentionCount, 0));
  const servers = useStore((s) => s.serverOrder.length);
  const greet = greeting(now);
  const stats: Array<[string, number, Parameters<typeof Icon>[0]['name'], string]> = [
    ['Amigos online', friendsOnline, 'users', 'text-ok bg-ok/15'],
    ['Amigos em call', inVoice, 'speaker', 'text-sky-400 bg-sky-400/15'],
    ['Menções', mentions, 'at', 'text-brand bg-brand/15'],
    ['Servidores', servers, 'globe', 'text-amber-400 bg-amber-400/15'],
  ];
  return (
    <div className="shrink-0 px-6 pb-5 pt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-fg-strong">
            {greet}, <span className="grad-text">{me.displayName}</span>
          </h1>
          <p className="mt-1 text-sm text-fg-muted">Veja quem está por aí, suas conversas e o que está rolando agora.</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold tabular-nums tracking-tight text-fg-strong">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-xs text-fg-muted">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value, icon, tint], i) => (
          <motion.div
            key={label}
            data-glow
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: i * 0.04 }}
            className="card flex items-center gap-3 p-4 transition-colors hover:border-line/[0.12]"
          >
            <span className={clsx('tile h-10 w-10', tint)}>
              <Icon name={icon} size={18} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-fg-muted">{label}</div>
              <div className="text-2xl font-extrabold tabular-nums leading-tight text-fg-strong">{value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

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
    <button onClick={() => setTab(t)} className={clsx('relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors', tab === t ? 'text-white' : 'text-fg-muted hover:text-fg-strong')}>
      {tab === t && <motion.span layoutId="friends-tab" transition={spring.responsive} className="grad absolute inset-0 rounded-lg shadow-[0_6px_18px_-8px_rgb(var(--brand))]" />}
      <span className="relative flex items-center gap-1.5">
        {label}
        {extra}
      </span>
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <Greeting />
      <header className="mx-6 flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-line/[0.07] bg-line/[0.03] p-1">
        {tabBtn('online', 'Disponível')}
        {tabBtn('all', 'Todos')}
        {tabBtn('pending', 'Pendente', pendingCount > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{pendingCount}</span>)}
        {tabBtn('blocked', 'Bloqueado')}
        {tabBtn('saved', 'Salvas')}
        <span className="flex-1" />
        <button onClick={() => setTab('add')} className={clsx('btn px-3 py-1.5', tab === 'add' ? 'bg-ok/15 text-ok' : 'btn-primary')}>
          <Icon name="plus" size={15} strokeWidth={2.5} /> Adicionar amigo
        </button>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-4">
        {tab === 'add' ? (
          <AddFriend />
        ) : tab === 'saved' ? (
          <SavedMessages />
        ) : (
          <>
            <div className="eyebrow mb-2">
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
      data-glow
      className="group mb-1 flex cursor-pointer items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-line/[0.07] hover:bg-line/[0.03]"
      onClick={async () => type === 'friend' && nav(`/channels/@me/${await openDm(userId)}`)}
      onContextMenu={(e) => menu(e, items())}
    >
      <Avatar userId={userId} size={32} showStatus={type === 'friend'} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-fg-strong">
          {user.displayName} <span className="hidden text-sm font-normal text-fg-muted group-hover:inline">{user.username}</span>
        </div>
        <div className="truncate text-xs text-fg-muted">
          {type === 'incoming'
            ? 'Solicitação de amizade recebida'
            : type === 'outgoing'
              ? 'Solicitação de amizade enviada'
              : type === 'blocked'
                ? 'Bloqueado'
                : activityLine(presence?.activity) || presence?.customStatus || STATUS_LABEL[presence?.status ?? 'offline']}
        </div>
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {type === 'friend' && (
          <>
            <Tooltip label="Mensagem">
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-line/[0.07] text-fg-muted transition-transform active:scale-90 hover:text-fg-strong" onClick={async () => nav(`/channels/@me/${await openDm(userId)}`)}>
                <Icon name="reply" size={18} />
              </button>
            </Tooltip>
            <Tooltip label="Chamada de voz">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-line/[0.07] text-fg-muted transition-transform active:scale-90 hover:text-fg-strong"
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
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-line/[0.07] text-fg-muted transition-transform active:scale-90 hover:text-ok" onClick={() => act('PUT', { type: 'friend' })}>
              <Icon name="check" size={18} />
            </button>
          </Tooltip>
        )}
        {(type === 'incoming' || type === 'outgoing' || type === 'blocked') && (
          <Tooltip label={type === 'blocked' ? 'Desbloquear' : type === 'incoming' ? 'Recusar' : 'Cancelar'}>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-line/[0.07] text-fg-muted transition-transform active:scale-90 hover:text-danger" onClick={() => act('DELETE')}>
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
