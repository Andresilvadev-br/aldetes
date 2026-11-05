import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, useStoreShallow, get, displayName, serverPermissions } from '@/store';
import { Avatar, STATUS_LABEL } from './Avatar';
import { Popover, useContextMenu, confirmDialog, toastError, toast, Modal, type MenuItem } from './overlay';
import { api, upload } from '@/lib/api';
import { openSettings } from '@/lib/ui';
import { elapsed } from '@/lib/activity';
import { ProfileBanner, ProfileEffect, AvatarDecoration, ProfileEntrance } from '../profile/Cosmetics';
import { Icon } from './Icon';
import { openDm } from '@/lib/actions';
import { setLocalMute, setUserVolume, joinVoice, useVoice } from '@/lib/voice';
import { usePrefs } from '@/lib/prefs';

export function UserPopout({ userId, serverId, x, y, onClose }: { userId: string; serverId?: string | null; x: number; y: number; onClose: () => void }) {
  const user = useStore((s) => s.users[userId]);
  const presence = useStore((s) => s.presences[userId]);
  const member = useStore((s) => (serverId ? s.members[serverId]?.[userId] : undefined));
  const roles = useStore((s) => (serverId ? s.roles[serverId] : undefined));
  const rel = useStore((s) => s.relationships[userId]);
  const me = useStore((s) => s.me)!;
  const nav = useNavigate();
  const menu = useContextMenu();
  const items = useMemberMenu(userId, serverId ?? null);
  const [msg, setMsg] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  if (!user) return null;
  const isMe = userId === me.id;
  const memberRoles = member ? member.roleIds.map((r) => roles?.[r]).filter(Boolean).sort((a, b) => b!.position - a!.position) : [];
  const status = isMe && me.status === 'invisible' ? 'invisible' : (presence?.status ?? 'offline');
  const act = presence?.activity;

  const dm = async () => {
    try {
      onClose();
      nav(`/channels/@me/${await openDm(userId)}`);
    } catch (e) {
      toastError(e);
    }
  };
  // Real call state: where they are, and whether I'm in a server voice channel they could join
  const theirRaw = useStoreShallow((s) => {
    const v = s.voiceStates[userId];
    const ch = v ? s.channels[v.channelId] : undefined;
    return { id: ch?.serverId ? ch.id : null, name: ch?.name ?? '', serverId: ch?.serverId ?? null };
  });
  const theirCall = theirRaw.id && theirRaw.serverId ? { id: theirRaw.id, name: theirRaw.name, serverId: theirRaw.serverId } : null;
  const myCallId = useVoice((v) => (v.state === 'connected' ? v.channelId : null));
  const myCall = useStore((s) => (myCallId && s.channels[myCallId]?.serverId ? s.channels[myCallId] : null));
  const [inviting, setInviting] = useState<'idle' | 'busy' | 'done'>('idle');
  const joinTheirs = () => {
    if (!theirCall) return;
    onClose();
    nav(`/channels/${theirCall.serverId}/${theirCall.id}`);
    void joinVoice(theirCall.id);
  };
  const inviteToMine = async () => {
    if (!myCall) return;
    setInviting('busy');
    try {
      await api('POST', `/voice/${myCall.id}/invite`, { userId });
      setInviting('done');
      toast(`Chamando para ${myCall.name}…`, 'success');
    } catch (e) {
      setInviting('idle');
      toastError(e);
    }
  };
  const call = async () => {
    try {
      onClose();
      const id = await openDm(userId);
      nav(`/channels/@me/${id}`);
      await joinVoice(id);
    } catch (e) {
      toastError(e);
    }
  };
  const friendBtn = () => {
    if (rel?.type === 'friend') return { label: 'Amigos', icon: 'check' as const, onClick: undefined };
    if (rel?.type === 'outgoing') return { label: 'Pendente', icon: 'moreH' as const, onClick: undefined };
    if (rel?.type === 'incoming') return { label: 'Aceitar', icon: 'plus' as const, onClick: () => api('PUT', `/relationships/${userId}`, { type: 'friend' }).catch(toastError) };
    if (rel?.type === 'blocked') return null;
    return { label: 'Adicionar', icon: 'plus' as const, onClick: () => api('POST', '/relationships', { username: user.username }).then(() => toast('Solicitação enviada', 'success'), toastError) };
  };
  const fb = friendBtn();
  const uploadAvatar = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    await upload('/users/@me/avatar', fd).catch(toastError);
  };

  return (
    <Popover x={x} y={y} onClose={onClose}>
      <div className="relative w-[340px] overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-float shadow-float">
        <ProfileEntrance id={user.profileEntrance} />
        <ProfileEffect id={user.profileEffect} behind />
        <div className="relative">
          {isMe ? (
            <button className="group/banner relative block w-full" title="Mudar banner" onClick={() => (onClose(), openSettings('profile'))}>
              <ProfileBanner user={user} height={110} />
              <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 text-xs font-bold text-white opacity-0 transition-opacity group-hover/banner:opacity-100">
                <Icon name="edit" size={14} /> Mudar banner
              </span>
            </button>
          ) : (
            <ProfileBanner user={user} height={110} />
          )}
          <div className="relative px-4 pb-4">
            <div className="-mt-11 mb-2 flex items-end justify-between">
              {isMe ? (
                <button className="deco-host group/av relative w-fit rounded-full border-[6px] border-bg-float" title="Mudar avatar" onClick={() => avatarInput.current?.click()}>
                  <AvatarDecoration id={user.avatarDecoration} size={84} />
                  <Avatar userId={userId} size={84} showStatus />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover/av:opacity-100">Mudar</span>
                  <input ref={avatarInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                </button>
              ) : (
                <div className="deco-host relative w-fit rounded-full border-[6px] border-bg-float">
                  <AvatarDecoration id={user.avatarDecoration} size={84} />
                  <Avatar userId={userId} size={84} showStatus />
                </div>
              )}
              {!isMe && (
                <button className="icon-btn mb-1 bg-line/[0.06]" title="Mais opções" onClick={(e) => menu(e, items())}>
                  <Icon name="moreH" size={18} />
                </button>
              )}
            </div>
            <div className="text-xl font-extrabold tracking-tight text-fg-strong">{member?.nickname ?? user.displayName}</div>
            <div className="text-sm text-fg-muted">
              {user.username}
              {user.pronouns ? ` · ${user.pronouns}` : ''} · {STATUS_LABEL[status]}
            </div>
            {presence?.customStatus && <div className="mt-1 text-sm text-fg">{presence.customStatus}</div>}

            {/* actions */}
            {isMe ? (
              <button className="btn-primary mt-3 w-full" onClick={() => (onClose(), openSettings('profile'))}>
                <Icon name="edit" size={16} /> Editar perfil
              </button>
            ) : (
              <div className="mt-3 flex gap-2">
                <button className="btn-primary flex-1" onClick={dm}>
                  <Icon name="reply" size={16} /> Mensagem
                </button>
                <button className="btn-secondary px-3" title="Ligar" onClick={call}>
                  <Icon name="phone" size={16} />
                </button>
                {fb && (
                  <button className={clsx('btn-secondary px-3', !fb.onClick && 'pointer-events-none opacity-70')} title={fb.label} onClick={fb.onClick}>
                    <Icon name={fb.icon} size={16} /> <span className="text-xs">{fb.label}</span>
                  </button>
                )}
              </div>
            )}

            {/* contextual call actions (only real ones: based on the live voice state) */}
            {!isMe && (theirCall && theirCall.id !== myCallId ? (
              <button className="btn mt-2 w-full bg-ok/15 text-ok hover:bg-ok/25" onClick={joinTheirs}>
                <Icon name="speaker" size={16} /> Entrar na call · {theirCall.name}
              </button>
            ) : myCall && theirCall?.id !== myCall.id ? (
              <button className="btn-secondary mt-2 w-full" disabled={inviting !== 'idle'} onClick={() => void inviteToMine()}>
                <Icon name="phone" size={16} /> {inviting === 'done' ? 'Chamado!' : inviting === 'busy' ? 'Chamando…' : `Chamar para ${myCall.name}`}
              </button>
            ) : null)}

            {/* activity */}
            {act && (
              <div className="mt-3 rounded-2xl border border-line/[0.07] bg-line/[0.03] p-3">
                <div className="eyebrow mb-2">{act.type === 'playing' ? 'Jogando' : `Ouvindo no ${act.name}`}</div>
                <div className="flex items-center gap-3">
                  <span className={clsx('tile h-12 w-12', act.type === 'playing' ? 'grad text-white shadow-glow' : 'bg-ok/15 text-ok')}>
                    <Icon name={act.type === 'playing' ? 'signal' : 'volume'} size={22} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-fg-strong">{act.type === 'playing' ? act.name : act.details}</div>
                    <div className="text-xs text-fg-muted">{elapsed(act.startedAt)}</div>
                  </div>
                </div>
              </div>
            )}

            {user.bio && (
              <>
                <div className="eyebrow mb-1 mt-3">Sobre mim</div>
                <p className="whitespace-pre-wrap text-sm text-fg">{user.bio}</p>
              </>
            )}
            {!!user.profileLinks?.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.profileLinks.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" title={l.url} className="flex max-w-full items-center gap-1 rounded-lg border border-line/[0.08] bg-line/[0.04] px-2 py-1 text-xs font-semibold text-sky-400 hover:border-sky-400/40">
                    <Icon name="link" size={12} /> <span className="truncate">{l.label}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="eyebrow mb-1 mt-3">Membro desde</div>
            <p className="text-sm text-fg">{new Date(user.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            {memberRoles.length > 0 && (
              <>
                <div className="eyebrow mb-1 mt-3">Cargos</div>
                <div className="flex flex-wrap gap-1">
                  {memberRoles.map((r) => (
                    <span key={r!.id} className="flex items-center gap-1 rounded-lg bg-line/[0.06] px-2 py-0.5 text-xs text-fg">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r!.color ?? '#99aab5' }} />
                      {r!.name}
                    </span>
                  ))}
                </div>
              </>
            )}
            {!isMe && (
              <input
                className="input mt-4 py-2 text-sm"
                placeholder={`Mensagem para @${user.username}`}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !msg.trim()) return;
                  try {
                    const id = await openDm(userId);
                    await api('POST', `/channels/${id}/messages`, { content: msg.trim() });
                    onClose();
                    nav(`/channels/@me/${id}`);
                  } catch (err) {
                    toastError(err);
                  }
                }}
              />
            )}
          </div>
        </div>
        <ProfileEffect id={user.profileEffect} />
      </div>
    </Popover>
  );
}

/** Wraps a user element: left click → profile popout; right click → member context menu. */
export function UserPopoutTrigger({ userId, serverId, children }: { userId: string; serverId?: string | null; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menu = useContextMenu();
  const items = useMemberMenu(userId, serverId ?? null);
  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: r.right + 8 > window.innerWidth - 310 ? r.left - 310 : r.right + 8, y: r.top });
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          menu(e, items());
        }}
      >
        {children}
      </div>
      {pos && <UserPopout userId={userId} serverId={serverId} x={pos.x} y={pos.y} onClose={() => setPos(null)} />}
    </>
  );
}

export function useMemberMenu(userId: string, serverId: string | null) {
  const nav = useNavigate();
  return (): MenuItem[] => {
    const st = get();
    const me = st.me!;
    const isMe = userId === me.id;
    const rel = st.relationships[userId];
    const prefs = usePrefs.getState();
    const voice = st.voiceStates[userId];
    const myVoice = st.voiceStates[me.id];
    const inMyCall = !!voice && voice.channelId === myVoice?.channelId && !isMe;
    const perms = serverId ? serverPermissions(serverId) : 0n;
    const server = serverId ? st.servers[serverId] : null;
    const items: MenuItem[] = [
      {
        label: 'Enviar mensagem',
        hidden: isMe,
        onClick: async () => {
          try {
            nav(`/channels/@me/${await openDm(userId)}`);
          } catch (e) {
            toastError(e);
          }
        },
      },
      {
        label: 'Iniciar chamada',
        hidden: isMe,
        onClick: async () => {
          try {
            const id = await openDm(userId);
            nav(`/channels/@me/${id}`);
            await joinVoice(id);
          } catch (e) {
            toastError(e);
          }
        },
      },
      { label: 'Adicionar amigo', hidden: isMe || !!rel, onClick: () => api('POST', '/relationships', { username: st.users[userId]?.username }).then(() => toast('Solicitação enviada'), toastError) },
      { label: 'Remover amizade', hidden: rel?.type !== 'friend', danger: true, onClick: () => api('DELETE', `/relationships/${userId}`).catch(toastError) },
    ];
    if (inMyCall) {
      items.push(
        { separator: true, label: '' },
        { label: `Volume: ${Math.round((prefs.userVolumes[userId] ?? 1) * 100)}%`, onClick: () => promptVolume(userId) },
        { label: 'Silenciar para mim', checked: !!prefs.localMutes[userId], onClick: () => setLocalMute(userId, !prefs.localMutes[userId]) },
      );
    }
    if (server && !isMe) {
      const canMod = (flag: bigint) => hasPermission(perms, flag) && userId !== server.ownerId;
      items.push({ separator: true, label: '' });
      if (voice?.serverId === serverId) {
        items.push(
          { label: voice.serverMute ? 'Remover silêncio do servidor' : 'Silenciar no servidor', hidden: !canMod(Permissions.MUTE_MEMBERS), onClick: () => api('POST', `/servers/${serverId}/members/${userId}/voice`, { mute: !voice.serverMute }).catch(toastError) },
          { label: voice.serverDeaf ? 'Remover surdez do servidor' : 'Ensurdecer no servidor', hidden: !canMod(Permissions.DEAFEN_MEMBERS), onClick: () => api('POST', `/servers/${serverId}/members/${userId}/voice`, { deaf: !voice.serverDeaf }).catch(toastError) },
          { label: 'Desconectar da voz', danger: true, hidden: !canMod(Permissions.MOVE_MEMBERS), onClick: () => api('POST', `/servers/${serverId}/members/${userId}/voice`, { disconnect: true }).catch(toastError) },
        );
      }
      items.push(
        { label: 'Alterar apelido', hidden: !canMod(Permissions.MANAGE_NICKNAMES), onClick: () => promptNickname(serverId!, userId) },
        {
          label: 'Castigo (silenciar)',
          hidden: !canMod(Permissions.MODERATE_MEMBERS),
          onClick: () => promptTimeout(serverId!, userId),
        },
        {
          label: `Expulsar ${displayName(userId, serverId)}`,
          danger: true,
          hidden: !canMod(Permissions.KICK_MEMBERS),
          onClick: async () => {
            if (await confirmDialog({ title: 'Expulsar membro', body: `Expulsar ${displayName(userId, serverId)}? A pessoa poderá voltar com um novo convite.`, confirm: 'Expulsar', danger: true }))
              api('DELETE', `/servers/${serverId}/members/${userId}`, {}).catch(toastError);
          },
        },
        {
          label: `Banir ${displayName(userId, serverId)}`,
          danger: true,
          hidden: !canMod(Permissions.BAN_MEMBERS),
          onClick: async () => {
            if (await confirmDialog({ title: 'Banir membro', body: `Banir ${displayName(userId, serverId)}? As mensagens das últimas 24h também serão removidas.`, confirm: 'Banir', danger: true }))
              api('PUT', `/servers/${serverId}/bans/${userId}`, { deleteMessageSeconds: 86400 }).catch(toastError);
          },
        },
      );
      if (hasPermission(perms, Permissions.MANAGE_ROLES)) {
        const roles = Object.values(st.roles[serverId!] ?? {})
          .filter((r) => !r.isEveryone)
          .sort((a, b) => b.position - a.position);
        const member = st.members[serverId!]?.[userId];
        if (roles.length && member) {
          items.push({ separator: true, label: '' });
          for (const r of roles) {
            const has = member.roleIds.includes(r.id);
            items.push({
              label: r.name,
              checked: has,
              onClick: () => api(has ? 'DELETE' : 'PUT', `/servers/${serverId}/members/${userId}/roles/${r.id}`).catch(toastError),
            });
          }
        }
      }
    }
    items.push({ separator: true, label: '' }, { label: 'Copiar ID do usuário', onClick: () => navigator.clipboard.writeText(userId) });
    if (!isMe)
      items.push(
        rel?.type === 'blocked'
          ? { label: 'Desbloquear', onClick: () => api('DELETE', `/relationships/${userId}`).catch(toastError) }
          : { label: 'Bloquear', danger: true, onClick: () => api('PUT', `/relationships/${userId}`, { type: 'blocked' }).catch(toastError) },
      );
    return items;
  };
}

// Small prompts rendered imperatively
import { createRoot } from 'react-dom/client';
function mountPrompt(render: (close: () => void) => ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
  };
  root.render(render(close));
}

function promptVolume(userId: string) {
  mountPrompt((close) => <VolumeModal userId={userId} onClose={close} />);
}
function VolumeModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [v, setV] = useState((usePrefs.getState().userVolumes[userId] ?? 1) * 100);
  return (
    <Modal onClose={onClose} title={`Volume de ${displayName(userId)}`}>
      <input
        type="range"
        min={0}
        max={200}
        value={v}
        className="w-full accent-brand"
        onChange={(e) => {
          setV(+e.target.value);
          setUserVolume(userId, +e.target.value / 100);
        }}
      />
      <div className="mb-2 text-center text-sm text-fg-muted">{v}%</div>
    </Modal>
  );
}

function promptNickname(serverId: string, userId: string) {
  mountPrompt((close) => <NicknameModal serverId={serverId} userId={userId} onClose={close} />);
}
function NicknameModal({ serverId, userId, onClose }: { serverId: string; userId: string; onClose: () => void }) {
  const [v, setV] = useState(get().members[serverId]?.[userId]?.nickname ?? '');
  const save = () => api('PATCH', `/servers/${serverId}/members/${userId}`, { nickname: v || null }).then(onClose, toastError);
  return (
    <Modal onClose={onClose} title="Alterar apelido" footer={<button className="btn-primary" onClick={save}>Salvar</button>}>
      <input className="input" value={v} maxLength={32} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
    </Modal>
  );
}

function promptTimeout(serverId: string, userId: string) {
  mountPrompt((close) => (
    <Modal onClose={close} title={`Castigo para ${displayName(userId, serverId)}`} subtitle="A pessoa não poderá enviar mensagens, reagir ou falar em canais de voz.">
      <div className="grid grid-cols-2 gap-2 pb-2">
        {[
          ['60 segundos', 60],
          ['5 minutos', 300],
          ['10 minutos', 600],
          ['1 hora', 3600],
          ['1 dia', 86400],
          ['1 semana', 604800],
          ['Remover castigo', 0],
        ].map(([label, secs]) => (
          <button key={label} className={secs ? 'btn-secondary' : 'btn-danger'} onClick={() => api('PUT', `/servers/${serverId}/members/${userId}/timeout`, { durationSeconds: secs }).then(close, toastError)}>
            {label}
          </button>
        ))}
      </div>
    </Modal>
  ));
}
