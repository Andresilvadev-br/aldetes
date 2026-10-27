import { useState } from 'react';
import clsx from 'clsx';
import { Permissions, hasPermission } from '@aldetes/shared';
import { useStore, channelPermissions, displayName, useStoreShallow } from '@/store';
import { api } from '@/lib/api';
import { SettingsLayout, SettingsTitle } from './SettingsLayout';
import { OverwriteList } from './PermissionEditor';
import { toastError, toast, confirmDialog } from '../common/overlay';

export function ChannelSettings({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const channel = useStore((s) => s.channels[channelId]);
  const perms = channelPermissions(channelId);
  const [tab, setTab] = useState(hasPermission(perms, Permissions.MANAGE_CHANNELS) ? 'overview' : 'permissions');
  if (!channel) return null;
  const sections = [
    { id: 'overview', label: 'Visão geral', group: channel.type === 'category' ? channel.name : `#${channel.name}` },
    { id: 'permissions', label: 'Permissões', group: channel.type === 'category' ? channel.name : `#${channel.name}` },
    {
      id: 'delete',
      label: channel.type === 'category' ? 'Excluir categoria' : 'Excluir canal',
      group: ' ',
      danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: 'Excluir', body: `Excluir "${channel.name}" permanentemente?`, confirm: 'Excluir', danger: true })) {
          api('DELETE', `/channels/${channelId}`).then(onClose, toastError);
        }
      },
    },
  ].filter((s) => (s.id === 'permissions' ? hasPermission(perms, Permissions.MANAGE_ROLES) : hasPermission(perms, Permissions.MANAGE_CHANNELS)));
  return (
    <SettingsLayout sections={sections} active={tab} onSelect={setTab} onClose={onClose}>
      {tab === 'overview' && <Overview channelId={channelId} />}
      {tab === 'permissions' && <PermissionsTab channelId={channelId} />}
    </SettingsLayout>
  );
}

function Overview({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId])!;
  const [form, setForm] = useState({ name: c.name, topic: c.topic ?? '', slowmodeSeconds: c.slowmodeSeconds });
  const isText = ['text', 'announcement', 'forum', 'thread'].includes(c.type);
  return (
    <>
      <SettingsTitle>Visão geral</SettingsTitle>
      <label className="label">Nome</label>
      <input className="input mb-5" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: c.type === 'voice' || c.type === 'category' ? e.target.value : e.target.value.toLowerCase().replace(/\s/g, '-') })} />
      {isText && (
        <>
          <label className="label">Tópico</label>
          <textarea className="input mb-5 min-h-[80px]" maxLength={1024} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <label className="label">Modo lento</label>
          <select className="input mb-5" value={form.slowmodeSeconds} onChange={(e) => setForm({ ...form, slowmodeSeconds: +e.target.value })}>
            {[
              [0, 'Desativado'],
              [5, '5s'],
              [10, '10s'],
              [30, '30s'],
              [60, '1min'],
              [300, '5min'],
              [900, '15min'],
              [3600, '1h'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        className="btn-primary"
        onClick={() =>
          api('PATCH', `/channels/${channelId}`, isText ? { ...form, topic: form.topic || null } : { name: form.name }).then(() => toast('Canal atualizado', 'success'), toastError)
        }
      >
        Salvar alterações
      </button>
    </>
  );
}

const NO_MEMBERS = {};

function PermissionsTab({ channelId }: { channelId: string }) {
  const c = useStore((s) => s.channels[channelId])!;
  const roles = useStoreShallow((s) => Object.values(s.roles[c.serverId!] ?? {}).sort((a, b) => b.position - a.position));
  const members = useStore((s) => s.members[c.serverId!] ?? NO_MEMBERS);
  const everyone = roles.find((r) => r.isEveryone)!;
  const [target, setTarget] = useState<{ type: 'role' | 'member'; id: string }>({ type: 'role', id: everyone.id });
  const [adding, setAdding] = useState('');
  const ow = c.overwrites.find((o) => o.targetType === target.type && o.targetId === target.id);
  const [allow, setAllow] = useState(BigInt(ow?.allow ?? '0'));
  const [deny, setDeny] = useState(BigInt(ow?.deny ?? '0'));
  const select = (type: 'role' | 'member', id: string) => {
    const o = c.overwrites.find((x) => x.targetType === type && x.targetId === id);
    setTarget({ type, id });
    setAllow(BigInt(o?.allow ?? '0'));
    setDeny(BigInt(o?.deny ?? '0'));
  };
  const targets = [
    ...c.overwrites.map((o) => ({ type: o.targetType, id: o.targetId })),
    ...(c.overwrites.some((o) => o.targetId === everyone.id) ? [] : [{ type: 'role' as const, id: everyone.id }]),
    ...(c.overwrites.some((o) => o.targetId === target.id) || target.id === everyone.id ? [] : [target]),
  ];
  const label = (t: { type: string; id: string }) => (t.type === 'role' ? (roles.find((r) => r.id === t.id)?.name ?? '?') : displayName(t.id, c.serverId));
  const isPrivate = (BigInt(c.overwrites.find((o) => o.targetId === everyone.id)?.deny ?? '0') & Permissions.VIEW_CHANNEL) !== 0n;
  return (
    <>
      <SettingsTitle>Permissões do canal</SettingsTitle>
      <label className="mb-6 flex items-center justify-between rounded-lg bg-bg-side p-4">
        <div>
          <div className="font-medium text-fg-strong">Canal privado</div>
          <div className="text-sm text-fg-muted">Apenas cargos e membros selecionados poderão ver este canal.</div>
        </div>
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand"
          checked={isPrivate}
          onChange={(e) => {
            const o = c.overwrites.find((x) => x.targetId === everyone.id);
            const a = BigInt(o?.allow ?? '0') & ~Permissions.VIEW_CHANNEL;
            const d = e.target.checked ? BigInt(o?.deny ?? '0') | Permissions.VIEW_CHANNEL : BigInt(o?.deny ?? '0') & ~Permissions.VIEW_CHANNEL;
            api('PUT', `/channels/${channelId}/permissions/role/${everyone.id}`, { allow: a.toString(), deny: d.toString() }).catch(toastError);
          }}
        />
      </label>
      <div className="flex gap-6">
        <div className="w-48 shrink-0">
          <div className="label">Cargos/membros</div>
          {targets.map((t) => (
            <button key={t.type + t.id} onClick={() => select(t.type as 'role' | 'member', t.id)} className={clsx('mb-0.5 w-full truncate rounded px-2 py-1.5 text-left text-sm', target.id === t.id ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10')}>
              {t.type === 'member' ? '@' : ''}
              {label(t)}
            </button>
          ))}
          <select
            className="input mt-2 py-1 text-sm"
            value={adding}
            onChange={(e) => {
              const [type, id] = e.target.value.split(':') as ['role' | 'member', string];
              setAdding('');
              if (id) select(type, id);
            }}
          >
            <option value="">+ Adicionar…</option>
            <optgroup label="Cargos">
              {roles
                .filter((r) => !r.isEveryone)
                .map((r) => (
                  <option key={r.id} value={`role:${r.id}`}>
                    {r.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Membros">
              {Object.values(members).map((m) => (
                <option key={m.userId} value={`member:${m.userId}`}>
                  {m.nickname ?? m.user.displayName}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="flex-1">
          <OverwriteList allow={allow} deny={deny} onChange={(a, d) => (setAllow(a), setDeny(d))} />
          <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg bg-bg-rail p-3 shadow-xl">
            {ow && (
              <button className="btn-ghost text-danger" onClick={() => api('DELETE', `/channels/${channelId}/permissions/${target.type}/${target.id}`).then(() => select('role', everyone.id), toastError)}>
                Remover
              </button>
            )}
            <button className="btn bg-ok text-white hover:bg-ok/80" onClick={() => api('PUT', `/channels/${channelId}/permissions/${target.type}/${target.id}`, { allow: allow.toString(), deny: deny.toString() }).then(() => toast('Permissões salvas', 'success'), toastError)}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
