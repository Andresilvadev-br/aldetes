import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Permissions, hasPermission, type PublicUser, type Role } from '@aldetes/shared';
import { useStore, get, displayName, useStoreShallow, EMPTY } from '@/store';
import { api, upload } from '@/lib/api';
import { SettingsLayout, SettingsTitle, Toggle } from './SettingsLayout';
import { RolePermissionList } from './PermissionEditor';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { toastError, toast, confirmDialog, useContextMenu } from '../common/overlay';
import { ServerIcon } from '../layout/ServerRail';
import { useMemberMenu } from '../common/UserPopout';
import { inviteLink } from '../modals/InviteModal';
import { loadServerEmojis } from '../chat/emojiData';
import { ServerStudio } from '../studio/ServerStudio';

export function ServerSettings({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const server = useStore((s) => s.servers[serverId]);
  const me = useStore((s) => s.me)!;
  const nav = useNavigate();
  const perms = BigInt(server?.myPermissions ?? '0');
  const can = (f: bigint) => hasPermission(perms, f);
  const [tab, setTab] = useState(can(Permissions.MANAGE_SERVER) ? 'overview' : can(Permissions.MANAGE_ROLES) ? 'roles' : 'audit');
  if (!server) return null;
  const isOwner = server.ownerId === me.id;
  const sections = [
    can(Permissions.MANAGE_SERVER) && { id: 'overview', label: 'Visão geral', group: server.name },
    can(Permissions.MANAGE_SERVER) && { id: 'studio', label: 'Worlds', group: server.name },
    can(Permissions.MANAGE_ROLES) && { id: 'roles', label: 'Cargos', group: server.name },
    can(Permissions.MANAGE_EMOJIS) && { id: 'emojis', label: 'Emojis', group: server.name },
    { id: 'members', label: 'Membros', group: 'Gerenciamento de membros' },
    can(Permissions.MANAGE_SERVER) && { id: 'invites', label: 'Convites', group: 'Gerenciamento de membros' },
    can(Permissions.BAN_MEMBERS) && { id: 'bans', label: 'Banimentos', group: 'Gerenciamento de membros' },
    can(Permissions.VIEW_AUDIT_LOG) && { id: 'audit', label: 'Registro de auditoria', group: 'Moderação' },
    isOwner && {
      id: 'delete',
      label: 'Excluir servidor',
      group: ' ',
      danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: `Excluir '${server.name}'`, body: 'Tem certeza? Todos os canais, mensagens e cargos serão apagados permanentemente.', confirm: 'Excluir servidor', danger: true })) {
          api('DELETE', `/servers/${serverId}`).then(() => {
            onClose();
            nav('/channels/@me');
          }, toastError);
        }
      },
    },
  ].filter(Boolean) as Array<{ id: string; label: string; group: string; danger?: boolean; onClick?: () => void }>;
  return (
    <SettingsLayout sections={sections} active={tab} onSelect={setTab} onClose={onClose}>
      {tab === 'overview' && <OverviewTab serverId={serverId} />}
      {tab === 'studio' && <ServerStudio serverId={serverId} />}
      {tab === 'roles' && <RolesTab serverId={serverId} />}
      {tab === 'emojis' && <EmojisTab serverId={serverId} />}
      {tab === 'members' && <MembersTab serverId={serverId} />}
      {tab === 'invites' && <InvitesTab serverId={serverId} />}
      {tab === 'bans' && <BansTab serverId={serverId} />}
      {tab === 'audit' && <AuditTab serverId={serverId} />}
    </SettingsLayout>
  );
}

function OverviewTab({ serverId }: { serverId: string }) {
  const s = useStore((st) => st.servers[serverId])!;
  const textChannels = useStoreShallow((st) => Object.values(st.channels).filter((c) => c.serverId === serverId && (c.type === 'text' || c.type === 'announcement')));
  const me = useStore((st) => st.me)!;
  const members = useStoreShallow((st) => Object.values(st.members[serverId] ?? {}));
  const [form, setForm] = useState({ name: s.name, description: s.description ?? '', isPublic: s.isPublic, welcomeChannelId: s.welcomeChannelId ?? '', rulesChannelId: s.rulesChannelId ?? '' });
  const iconInput = useRef<HTMLInputElement>(null);
  const [newOwner, setNewOwner] = useState('');
  return (
    <>
      <SettingsTitle>Visão geral do servidor</SettingsTitle>
      <div className="mb-6 flex items-center gap-6">
        <button className="group relative" onClick={() => iconInput.current?.click()} title="Alterar ícone">
          <ServerIcon name={s.name} iconUrl={s.iconUrl} size={100} active />
          <span className="absolute inset-0 hidden items-center justify-center rounded-2xl bg-black/50 text-xs font-bold uppercase text-white group-hover:flex">Alterar ícone</span>
        </button>
        <input
          ref={iconInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.append('file', f);
            await upload(`/servers/${serverId}/icon`, fd).catch(toastError);
          }}
        />
        <div className="flex-1">
          <label className="label">Nome do servidor</label>
          <input className="input" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
      </div>
      <label className="label">Descrição</label>
      <textarea className="input mb-4 min-h-[80px]" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <label>
          <span className="label">Canal de boas-vindas</span>
          <select className="input" value={form.welcomeChannelId} onChange={(e) => setForm({ ...form, welcomeChannelId: e.target.value })}>
            <option value="">Nenhum</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Canal de regras</span>
          <select className="input" value={form.rulesChannelId} onChange={(e) => setForm({ ...form, rulesChannelId: e.target.value })}>
            <option value="">Nenhum</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Toggle label="Servidor público" desc="Aparece em Explorar e qualquer pessoa pode entrar sem convite." checked={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} />
      <button
        className="btn-primary mt-4"
        onClick={() =>
          api('PATCH', `/servers/${serverId}`, {
            name: form.name,
            description: form.description || null,
            isPublic: form.isPublic,
            welcomeChannelId: form.welcomeChannelId || null,
            rulesChannelId: form.rulesChannelId || null,
          }).then(() => toast('Servidor atualizado', 'success'), toastError)
        }
      >
        Salvar alterações
      </button>
      {s.ownerId === me.id && (
        <div className="mt-10 rounded-lg border border-danger/40 p-4">
          <div className="mb-2 font-semibold text-fg-strong">Transferir posse</div>
          <div className="flex gap-2">
            <select className="input" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
              <option value="">Escolha um membro…</option>
              {members
                .filter((m) => m.userId !== me.id)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nickname ?? m.user.displayName} ({m.user.username})
                  </option>
                ))}
            </select>
            <button
              className="btn-danger"
              disabled={!newOwner}
              onClick={async () => {
                if (await confirmDialog({ title: 'Transferir posse', body: `Transferir o servidor para ${displayName(newOwner, serverId)}? Você deixará de ser dono.`, confirm: 'Transferir', danger: true }))
                  api('POST', `/servers/${serverId}/transfer`, { userId: newOwner }).then(() => toast('Posse transferida'), toastError);
              }}
            >
              Transferir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RolesTab({ serverId }: { serverId: string }) {
  const roles = useStoreShallow((s) => Object.values(s.roles[serverId] ?? {}).sort((a, b) => b.position - a.position));
  const [sel, setSel] = useState<string>(roles[0]?.id ?? '');
  const role = roles.find((r) => r.id === sel);
  const create = async () => {
    try {
      const r = await api<Role>('POST', `/servers/${serverId}/roles`, { name: 'novo cargo', color: '#99aab5' });
      setSel(r.id);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      <SettingsTitle>Cargos</SettingsTitle>
      <div className="flex gap-6">
        <div className="w-48 shrink-0">
          <button className="btn-primary mb-3 w-full" onClick={create}>
            Criar cargo
          </button>
          {roles.map((r, i) => (
            <div key={r.id} className={clsx('group mb-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-sm', sel === r.id ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10')}>
              <button className="flex flex-1 items-center gap-2 truncate text-left" onClick={() => setSel(r.id)}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color ?? '#99aab5' }} />
                <span className="truncate">{r.name}</span>
              </button>
              {!r.isEveryone && (
                <span className="hidden gap-0.5 group-hover:flex">
                  <button title="Subir" disabled={i === 0} onClick={() => api('PATCH', `/servers/${serverId}/roles/${r.id}`, { position: r.position + 1 }).catch(toastError)}>
                    <Icon name="chevronDown" size={14} className="rotate-180" />
                  </button>
                  <button title="Descer" disabled={r.position <= 1} onClick={() => api('PATCH', `/servers/${serverId}/roles/${r.id}`, { position: r.position - 1 }).catch(toastError)}>
                    <Icon name="chevronDown" size={14} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex-1">{role && <RoleEditor key={role.id} serverId={serverId} role={role} />}</div>
      </div>
    </>
  );
}

function RoleEditor({ serverId, role }: { serverId: string; role: Role }) {
  const [form, setForm] = useState({ name: role.name, color: role.color ?? '#99aab5', hoist: role.hoist, mentionable: role.mentionable, perms: BigInt(role.permissions) });
  const dirty = form.name !== role.name || form.color !== (role.color ?? '#99aab5') || form.hoist !== role.hoist || form.mentionable !== role.mentionable || form.perms !== BigInt(role.permissions);
  return (
    <div>
      {!role.isEveryone && (
        <>
          <label className="label">Nome do cargo</label>
          <input className="input mb-4" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="label">Cor do cargo</label>
          <input type="color" className="mb-4 h-10 w-20 cursor-pointer rounded bg-transparent" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <Toggle label="Exibir separadamente na lista de membros" checked={form.hoist} onChange={(v) => setForm({ ...form, hoist: v })} />
          <Toggle label="Permitir que qualquer pessoa @mencione este cargo" checked={form.mentionable} onChange={(v) => setForm({ ...form, mentionable: v })} />
          <div className="h-6" />
        </>
      )}
      {role.isEveryone && <p className="mb-4 text-sm text-fg-muted">Permissões padrão de todos os membros do servidor.</p>}
      <RolePermissionList value={form.perms} onChange={(p) => setForm({ ...form, perms: p })} />
      <div className="sticky bottom-4 flex items-center justify-between rounded-lg bg-bg-rail p-3 shadow-xl">
        {!role.isEveryone ? (
          <button
            className="btn-ghost text-danger"
            onClick={async () => {
              if (await confirmDialog({ title: 'Excluir cargo', body: `Excluir o cargo "${role.name}"?`, confirm: 'Excluir', danger: true }))
                api('DELETE', `/servers/${serverId}/roles/${role.id}`).catch(toastError);
            }}
          >
            Excluir cargo
          </button>
        ) : (
          <span />
        )}
        <button
          className="btn bg-ok text-white hover:bg-ok/80"
          disabled={!dirty}
          onClick={() =>
            api('PATCH', `/servers/${serverId}/roles/${role.id}`, {
              ...(role.isEveryone ? {} : { name: form.name, color: form.color, hoist: form.hoist, mentionable: form.mentionable }),
              permissions: form.perms.toString(),
            }).then(() => toast('Cargo salvo', 'success'), toastError)
          }
        >
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function EmojisTab({ serverId }: { serverId: string }) {
  const emojis = useStore((s) => s.emojis[serverId] ?? EMPTY);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => void loadServerEmojis(serverId), [serverId]);
  return (
    <>
      <SettingsTitle>Emojis</SettingsTitle>
      <p className="mb-4 text-sm text-fg-muted">Até 100 emojis personalizados. PNG, JPEG, GIF ou WebP de até 1 MB; nome com letras, números e _.</p>
      <div className="mb-6 flex gap-2">
        <input className="input" placeholder="nome_do_emoji" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
        <button className="btn-primary shrink-0" disabled={name.length < 2} onClick={() => input.current?.click()}>
          Enviar emoji
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const fd = new FormData();
            fd.append('file', f);
            try {
              await upload(`/servers/${serverId}/emojis?name=${encodeURIComponent(name)}`, fd);
              setName('');
              await loadServerEmojis(serverId, true);
            } catch (err) {
              toastError(err);
            }
          }}
        />
      </div>
      {emojis.map((e) => (
        <div key={e.id} className="flex items-center gap-4 border-b border-line/5 py-2">
          <img src={e.url} alt={e.name} className="h-8 w-8 object-contain" />
          <span className="flex-1 text-fg-strong">:{e.name}:</span>
          <button className="icon-btn hover:text-danger" onClick={() => api('DELETE', `/servers/${serverId}/emojis/${e.id}`).then(() => loadServerEmojis(serverId, true), toastError)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      ))}
    </>
  );
}

const NO_ROLES: Record<string, Role> = {};

function MembersTab({ serverId }: { serverId: string }) {
  const members = useStoreShallow((s) => Object.values(s.members[serverId] ?? {}));
  const roles = useStore((s) => s.roles[serverId] ?? NO_ROLES);
  const [q, setQ] = useState('');
  return (
    <>
      <SettingsTitle>Membros ({members.length})</SettingsTitle>
      <input className="input mb-4" placeholder="Buscar membros" value={q} onChange={(e) => setQ(e.target.value)} />
      {members
        .filter((m) => !q || m.user.username.includes(q.toLowerCase()) || (m.nickname ?? m.user.displayName).toLowerCase().includes(q.toLowerCase()))
        .slice(0, 200)
        .map((m) => (
          <MemberRowAdmin key={m.userId} serverId={serverId} userId={m.userId} roleNames={m.roleIds.map((r) => roles[r]).filter(Boolean) as Role[]} joinedAt={m.joinedAt} />
        ))}
    </>
  );
}

function MemberRowAdmin({ serverId, userId, roleNames, joinedAt }: { serverId: string; userId: string; roleNames: Role[]; joinedAt: string }) {
  const menu = useContextMenu();
  const items = useMemberMenu(userId, serverId);
  return (
    <div className="flex items-center gap-3 border-b border-line/5 py-2">
      <Avatar userId={userId} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-fg-strong">{displayName(userId, serverId)}</div>
        <div className="text-xs text-fg-muted">
          {get().users[userId]?.username} · entrou em {new Date(joinedAt).toLocaleDateString('pt-BR')}
        </div>
      </div>
      <div className="flex max-w-[40%] flex-wrap justify-end gap-1">
        {roleNames.map((r) => (
          <span key={r.id} className="flex items-center gap-1 rounded bg-bg-rail px-1.5 py-0.5 text-xs text-fg">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color ?? '#99aab5' }} />
            {r.name}
          </span>
        ))}
      </div>
      <button className="icon-btn" onClick={(e) => menu(e, items())}>
        <Icon name="more" />
      </button>
    </div>
  );
}

interface InviteInfo {
  code: string;
  creatorId: string;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
}
function InvitesTab({ serverId }: { serverId: string }) {
  const [list, setList] = useState<InviteInfo[] | null>(null);
  const load = () => api<InviteInfo[]>('GET', `/servers/${serverId}/invites`).then(setList, toastError);
  useEffect(() => void load(), [serverId]);
  return (
    <>
      <SettingsTitle>Convites</SettingsTitle>
      {list?.length === 0 && <p className="text-fg-muted">Nenhum convite ativo.</p>}
      {list?.map((i) => {
        const expired = (i.expiresAt && new Date(i.expiresAt) < new Date()) || (i.maxUses > 0 && i.uses >= i.maxUses);
        return (
          <div key={i.code} className={clsx('flex items-center gap-3 border-b border-line/5 py-2 text-sm', expired && 'opacity-50')}>
            <span className="w-28 font-mono text-fg-strong">{i.code}</span>
            <span className="flex-1 text-fg-muted">por {displayName(i.creatorId, serverId)}</span>
            <span className="w-24 text-fg-muted">
              {i.uses}/{i.maxUses || '∞'} usos
            </span>
            <span className="w-36 text-fg-muted">{i.expiresAt ? new Date(i.expiresAt).toLocaleString('pt-BR') : 'nunca expira'}</span>
            <button className="icon-btn" title="Copiar link" onClick={() => navigator.clipboard.writeText(inviteLink(i.code))}>
              <Icon name="copy" size={16} />
            </button>
            <button className="icon-btn hover:text-danger" title="Revogar" onClick={() => api('DELETE', `/invites/${i.code}`).then(load, toastError)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        );
      })}
    </>
  );
}

function BansTab({ serverId }: { serverId: string }) {
  const [list, setList] = useState<Array<{ userId: string; reason: string | null; user: PublicUser | null }> | null>(null);
  const load = () => api<typeof list>('GET', `/servers/${serverId}/bans`).then(setList, toastError);
  useEffect(() => void load(), [serverId]);
  return (
    <>
      <SettingsTitle>Banimentos</SettingsTitle>
      {list?.length === 0 && <p className="text-fg-muted">Ninguém foi banido.</p>}
      {list?.map((b) => (
        <div key={b.userId} className="flex items-center gap-3 border-b border-line/5 py-2">
          <Avatar userId={b.userId} url={b.user?.avatarUrl ?? null} name={b.user?.displayName} size={32} />
          <div className="flex-1">
            <div className="text-fg-strong">{b.user?.displayName ?? b.userId}</div>
            <div className="text-xs text-fg-muted">{b.reason ?? 'Sem motivo informado'}</div>
          </div>
          <button className="btn-secondary py-1" onClick={() => api('DELETE', `/servers/${serverId}/bans/${b.userId}`).then(load, toastError)}>
            Revogar banimento
          </button>
        </div>
      ))}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  server_create: 'criou o servidor',
  server_update: 'atualizou o servidor',
  server_icon_update: 'alterou o ícone do servidor',
  server_banner_update: 'alterou o banner do servidor',
  server_studio_publish: 'publicou um novo visual no Worlds',
  server_studio_revert: 'reverteu o visual do servidor',
  owner_transfer: 'transferiu a posse',
  channel_create: 'criou um canal',
  channel_update: 'editou um canal',
  channel_delete: 'excluiu um canal',
  channels_reorder: 'reorganizou canais',
  overwrite_update: 'alterou permissões de canal',
  overwrite_delete: 'removeu permissões de canal',
  role_create: 'criou um cargo',
  role_update: 'editou um cargo',
  role_delete: 'excluiu um cargo',
  member_roles_update: 'alterou cargos de um membro',
  member_nickname: 'alterou um apelido',
  member_kick: 'expulsou um membro',
  member_ban: 'baniu um membro',
  member_unban: 'revogou um banimento',
  member_timeout: 'aplicou castigo',
  member_timeout_remove: 'removeu castigo',
  member_join: 'entrou por convite',
  invite_create: 'criou um convite',
  invite_delete: 'revogou um convite',
  message_delete: 'excluiu uma mensagem',
  message_pin: 'fixou uma mensagem',
  message_unpin: 'desafixou uma mensagem',
  emoji_create: 'adicionou um emoji',
  emoji_delete: 'removeu um emoji',
  voice_moderate: 'moderou a voz de um membro',
  voice_disconnect: 'desconectou um membro da voz',
  voice_move: 'moveu um membro de canal de voz',
};

function AuditTab({ serverId }: { serverId: string }) {
  const [entries, setEntries] = useState<Array<{ id: string; actorId: string; action: string; targetId: string | null; reason: string | null; createdAt: string; data: unknown }>>([]);
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const [done, setDone] = useState(false);
  const load = async (before?: string) => {
    try {
      const r = await api<{ entries: typeof entries; users: PublicUser[] }>('GET', `/servers/${serverId}/audit-logs?limit=50${before ? `&before=${before}` : ''}`);
      setEntries((e) => [...e, ...r.entries]);
      setUsers((u) => ({ ...u, ...Object.fromEntries(r.users.map((x) => [x.id, x])) }));
      if (r.entries.length < 50) setDone(true);
    } catch (e) {
      toastError(e);
    }
  };
  useEffect(() => void load(), [serverId]);
  const targetLabel = (id: string | null) => {
    if (!id) return '';
    const st = get();
    return st.users[id]?.displayName ?? (st.channels[id] ? `#${st.channels[id]!.name}` : (st.roles[serverId]?.[id]?.name ?? id));
  };
  return (
    <>
      <SettingsTitle>Registro de auditoria</SettingsTitle>
      {entries.map((e) => (
        <div key={e.id} className="flex items-start gap-3 border-b border-line/5 py-3">
          <Avatar userId={e.actorId} url={users[e.actorId]?.avatarUrl ?? null} name={users[e.actorId]?.displayName} size={32} />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-fg-strong">{users[e.actorId]?.displayName ?? e.actorId}</span> <span className="text-fg">{ACTION_LABEL[e.action] ?? e.action}</span>
            {e.targetId && <span className="text-fg-muted"> · {targetLabel(e.targetId)}</span>}
            {e.reason && <div className="text-xs text-fg-muted">Motivo: {e.reason}</div>}
            <div className="text-xs text-fg-faint">{new Date(e.createdAt).toLocaleString('pt-BR')}</div>
          </div>
        </div>
      ))}
      {!done && entries.length > 0 && (
        <button className="btn-secondary mt-4" onClick={() => load(entries[entries.length - 1]!.id)}>
          Carregar mais
        </button>
      )}
    </>
  );
}
