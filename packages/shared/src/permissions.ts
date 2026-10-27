/**
 * Permission bitfield. Stored as a decimal string in the DB (BigInt-safe).
 * The backend is the source of truth; the client only uses this to hide UI.
 */
export const Permissions = {
  ADMINISTRATOR: 1n << 0n,
  VIEW_CHANNEL: 1n << 1n,
  MANAGE_CHANNELS: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  MANAGE_SERVER: 1n << 4n,
  CREATE_INVITE: 1n << 5n,
  KICK_MEMBERS: 1n << 6n,
  BAN_MEMBERS: 1n << 7n,
  MODERATE_MEMBERS: 1n << 8n, // timeout / server mute
  SEND_MESSAGES: 1n << 9n,
  MANAGE_MESSAGES: 1n << 10n,
  ATTACH_FILES: 1n << 11n,
  ADD_REACTIONS: 1n << 12n,
  MENTION_EVERYONE: 1n << 13n,
  READ_MESSAGE_HISTORY: 1n << 14n,
  CONNECT: 1n << 15n,
  SPEAK: 1n << 16n,
  VIDEO: 1n << 17n,
  MUTE_MEMBERS: 1n << 18n,
  DEAFEN_MEMBERS: 1n << 19n,
  MOVE_MEMBERS: 1n << 20n,
  VIEW_AUDIT_LOG: 1n << 21n,
  MANAGE_EMOJIS: 1n << 22n,
  CREATE_THREADS: 1n << 23n,
  MANAGE_THREADS: 1n << 24n,
  CHANGE_NICKNAME: 1n << 25n,
  MANAGE_NICKNAMES: 1n << 26n,
} as const;

export type PermissionName = keyof typeof Permissions;

export const ALL_PERMISSIONS = Object.values(Permissions).reduce((a, b) => a | b, 0n);

export const DEFAULT_EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.CREATE_INVITE |
  Permissions.SEND_MESSAGES |
  Permissions.ATTACH_FILES |
  Permissions.ADD_REACTIONS |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.CONNECT |
  Permissions.SPEAK |
  Permissions.VIDEO |
  Permissions.CREATE_THREADS |
  Permissions.CHANGE_NICKNAME;

export function hasPermission(perms: bigint, flag: bigint): boolean {
  if ((perms & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) return true;
  return (perms & flag) === flag;
}

export interface Overwrite {
  targetType: 'role' | 'member';
  targetId: string;
  allow: bigint;
  deny: bigint;
}

/**
 * Compute effective permissions for a member, following the usual model:
 * owner => all; base = OR of role perms (@everyone included); admin => all;
 * channel overwrites: @everyone, then roles (deny then allow aggregated), then member.
 */
export function computePermissions(opts: {
  isOwner: boolean;
  everyoneRoleId: string;
  rolePerms: Map<string, bigint>; // roleId -> perms, for roles the member has + @everyone
  memberRoleIds: string[];
  memberId: string;
  overwrites?: Overwrite[];
}): bigint {
  if (opts.isOwner) return ALL_PERMISSIONS;
  let base = opts.rolePerms.get(opts.everyoneRoleId) ?? 0n;
  for (const rid of opts.memberRoleIds) base |= opts.rolePerms.get(rid) ?? 0n;
  if ((base & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) return ALL_PERMISSIONS;
  const ows = opts.overwrites ?? [];
  if (!ows.length) return base;
  const everyone = ows.find((o) => o.targetType === 'role' && o.targetId === opts.everyoneRoleId);
  if (everyone) base = (base & ~everyone.deny) | everyone.allow;
  let allow = 0n;
  let deny = 0n;
  for (const o of ows) {
    if (o.targetType === 'role' && opts.memberRoleIds.includes(o.targetId)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  base = (base & ~deny) | allow;
  const mem = ows.find((o) => o.targetType === 'member' && o.targetId === opts.memberId);
  if (mem) base = (base & ~mem.deny) | mem.allow;
  return base;
}

export const permissionLabels: Record<PermissionName, string> = {
  ADMINISTRATOR: 'Administrador',
  VIEW_CHANNEL: 'Ver canais',
  MANAGE_CHANNELS: 'Gerenciar canais',
  MANAGE_ROLES: 'Gerenciar cargos',
  MANAGE_SERVER: 'Gerenciar servidor',
  CREATE_INVITE: 'Criar convite',
  KICK_MEMBERS: 'Expulsar membros',
  BAN_MEMBERS: 'Banir membros',
  MODERATE_MEMBERS: 'Silenciar membros (castigo)',
  SEND_MESSAGES: 'Enviar mensagens',
  MANAGE_MESSAGES: 'Gerenciar mensagens',
  ATTACH_FILES: 'Anexar arquivos',
  ADD_REACTIONS: 'Adicionar reações',
  MENTION_EVERYONE: 'Mencionar @everyone',
  READ_MESSAGE_HISTORY: 'Ler histórico',
  CONNECT: 'Conectar (voz)',
  SPEAK: 'Falar (voz)',
  VIDEO: 'Vídeo e transmissão',
  MUTE_MEMBERS: 'Silenciar membros na voz',
  DEAFEN_MEMBERS: 'Ensurdecer membros',
  MOVE_MEMBERS: 'Mover membros',
  VIEW_AUDIT_LOG: 'Ver registro de auditoria',
  MANAGE_EMOJIS: 'Gerenciar emojis',
  CREATE_THREADS: 'Criar threads',
  MANAGE_THREADS: 'Gerenciar threads',
  CHANGE_NICKNAME: 'Alterar apelido',
  MANAGE_NICKNAMES: 'Gerenciar apelidos',
};
