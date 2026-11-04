import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, get, displayName, serverPermissions } from '@/store';
import { Avatar, STATUS_LABEL, colorFor } from './Avatar';
import { Popover, useContextMenu, confirmDialog, toastError, toast, Modal, type MenuItem } from './overlay';
import { api } from '@/lib/api';
import { openDm } from '@/lib/actions';
import { setLocalMute, setUserVolume, joinVoice } from '@/lib/voice';
import { usePrefs } from '@/lib/prefs';

export function UserPopout({ userId, serverId, x, y, onClose }: { userId: string; serverId?: string | null; x: number; y: number; onClose: () => void }) {
  const user = useStore((s) => s.users[userId]);
  const presence = useStore((s) => s.presences[userId]);
  const member = useStore((s) => (serverId ? s.members[serverId]?.[userId] : undefined));
  const roles = useStore((s) => (serverId ? s.roles[serverId] : undefined));
  const me = useStore((s) => s.me)!;
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  if (!user) return null;
  const memberRoles = member ? member.roleIds.map((r) => roles?.[r]).filter(Boolean).sort((a, b) => b!.position - a!.position) : [];
  const status = presence?.status ?? 'offline';
  return (
    <Popover x={x} y={y} onClose={onClose}>
      <div className="w-[320px] overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-float shadow-float">
        <div className="h-[84px]" style={{ background: user.bannerUrl ? `center/cover url(${user.bannerUrl})` : (user.accentColor ?? colorFor(user.id)) }} />
        <div className="relative px-4 pb-4">
          <div className="-mt-10 mb-2 w-fit rounded-full border-[6px] border-bg-float">
            <Avatar userId={userId} size={80} showStatus />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-fg-strong">{member?.nickname ?? user.displayName}</div>
          <div className="text-sm text-fg-muted">
            {user.username} · {STATUS_LABEL[status]}
          </div>
          {presence?.customStatus && <div className="mt-1 text-sm text-fg">{presence.customStatus}</div>}
          <div className="my-3 h-px bg-line/10" />
          {user.bio && (
            <>
              <div className="label mb-1">Sobre mim</div>
              <p className="mb-3 whitespace-pre-wrap text-sm text-fg">{user.bio}</p>
            </>
          )}
          <div className="label mb-1">Membro do Aldetes desde</div>
          <p className="mb-3 text-sm text-fg">{new Date(user.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          {memberRoles.length > 0 && (
            <>
              <div className="label mb-1">Cargos</div>
              <div className="mb-3 flex flex-wrap gap-1">
                {memberRoles.map((r) => (
                  <span key={r!.id} className="flex items-center gap-1 rounded bg-bg-input/60 px-2 py-0.5 text-xs text-fg">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r!.color ?? '#99aab5' }} />
                    {r!.name}
                  </span>
                ))}
              </div>
            </>
          )}
          {userId !== me.id && (
            <input
              className="input text-sm"
              placeholder={`Conversar com @${user.username}`}
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
