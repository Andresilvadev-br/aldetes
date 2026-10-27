import clsx from 'clsx';
import { Permissions, permissionLabels, type PermissionName } from '@aldetes/shared';
import { Icon } from '../common/Icon';

export const PERMISSION_GROUPS: Array<{ title: string; perms: PermissionName[] }> = [
  { title: 'Gerais do servidor', perms: ['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_EMOJIS', 'VIEW_AUDIT_LOG', 'MANAGE_SERVER'] },
  { title: 'Membros', perms: ['CREATE_INVITE', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES', 'KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS'] },
  {
    title: 'Texto',
    perms: ['SEND_MESSAGES', 'CREATE_THREADS', 'MANAGE_THREADS', 'ATTACH_FILES', 'ADD_REACTIONS', 'MENTION_EVERYONE', 'MANAGE_MESSAGES', 'READ_MESSAGE_HISTORY'],
  },
  { title: 'Voz', perms: ['CONNECT', 'SPEAK', 'VIDEO', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS'] },
  { title: 'Avançado', perms: ['ADMINISTRATOR'] },
];

/** Role-level: on/off switches. */
export function RolePermissionList({ value, onChange, disabled }: { value: bigint; onChange: (v: bigint) => void; disabled?: boolean }) {
  return (
    <div>
      {PERMISSION_GROUPS.map((g) => (
        <div key={g.title} className="mb-6">
          <div className="label">{g.title}</div>
          {g.perms.map((p) => {
            const flag = Permissions[p];
            const on = (value & flag) === flag;
            return (
              <label key={p} className={clsx('flex cursor-pointer items-center justify-between border-b border-line/5 py-3', disabled && 'cursor-not-allowed opacity-50')}>
                <span className="text-fg-strong">{permissionLabels[p]}</span>
                <span className={clsx('relative h-6 w-10 rounded-full transition-colors', on ? 'bg-ok' : 'bg-fg-faint/60')}>
                  <input type="checkbox" className="sr-only" disabled={disabled} checked={on} onChange={(e) => onChange(e.target.checked ? value | flag : value & ~flag)} />
                  <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Channel overwrite: deny / inherit / allow. */
export function OverwriteList({ allow, deny, onChange }: { allow: bigint; deny: bigint; onChange: (allow: bigint, deny: bigint) => void }) {
  return (
    <div>
      {PERMISSION_GROUPS.map((g) => (
        <div key={g.title} className="mb-5">
          <div className="label">{g.title}</div>
          {g.perms
            .filter((p) => p !== 'ADMINISTRATOR' && p !== 'MANAGE_SERVER' && p !== 'BAN_MEMBERS' && p !== 'KICK_MEMBERS' && p !== 'VIEW_AUDIT_LOG' && p !== 'MODERATE_MEMBERS' && p !== 'MANAGE_EMOJIS' && p !== 'CHANGE_NICKNAME' && p !== 'MANAGE_NICKNAMES')
            .map((p) => {
              const f = Permissions[p];
              const state = (allow & f) === f ? 'allow' : (deny & f) === f ? 'deny' : 'inherit';
              const set = (s: 'allow' | 'deny' | 'inherit') => onChange(s === 'allow' ? allow | f : allow & ~f, s === 'deny' ? deny | f : deny & ~f);
              return (
                <div key={p} className="flex items-center justify-between border-b border-line/5 py-2.5">
                  <span className="text-fg-strong">{permissionLabels[p]}</span>
                  <div className="flex overflow-hidden rounded border border-line/10">
                    <button title="Negar" className={clsx('px-2 py-1', state === 'deny' ? 'bg-danger text-white' : 'text-fg-muted hover:bg-fg/10')} onClick={() => set('deny')}>
                      <Icon name="x" size={16} />
                    </button>
                    <button title="Herdar" className={clsx('border-x border-line/10 px-2 py-1 font-bold', state === 'inherit' ? 'bg-fg-faint/40 text-white' : 'text-fg-muted hover:bg-fg/10')} onClick={() => set('inherit')}>
                      /
                    </button>
                    <button title="Permitir" className={clsx('px-2 py-1', state === 'allow' ? 'bg-ok text-white' : 'text-fg-muted hover:bg-fg/10')} onClick={() => set('allow')}>
                      <Icon name="check" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
