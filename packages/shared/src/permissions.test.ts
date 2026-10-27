import { describe, it, expect } from 'vitest';
import { computePermissions, Permissions, hasPermission, ALL_PERMISSIONS, DEFAULT_EVERYONE_PERMISSIONS } from './permissions';

const base = (extra: Partial<Parameters<typeof computePermissions>[0]> = {}) =>
  computePermissions({
    isOwner: false,
    everyoneRoleId: 'e',
    rolePerms: new Map([
      ['e', DEFAULT_EVERYONE_PERMISSIONS],
      ['mod', Permissions.KICK_MEMBERS | Permissions.MANAGE_MESSAGES],
      ['admin', Permissions.ADMINISTRATOR],
    ]),
    memberRoleIds: [],
    memberId: 'u1',
    ...extra,
  });

describe('computePermissions', () => {
  it('owner has everything', () => {
    expect(base({ isOwner: true })).toBe(ALL_PERMISSIONS);
  });
  it('everyone perms apply', () => {
    const p = base();
    expect(hasPermission(p, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(p, Permissions.KICK_MEMBERS)).toBe(false);
  });
  it('roles add perms', () => {
    expect(hasPermission(base({ memberRoleIds: ['mod'] }), Permissions.KICK_MEMBERS)).toBe(true);
  });
  it('admin bypasses overwrites', () => {
    const p = base({
      memberRoleIds: ['admin'],
      overwrites: [{ targetType: 'role', targetId: 'e', allow: 0n, deny: Permissions.VIEW_CHANNEL }],
    });
    expect(p).toBe(ALL_PERMISSIONS);
  });
  it('everyone deny then role allow then member deny', () => {
    const ows = [
      { targetType: 'role' as const, targetId: 'e', allow: 0n, deny: Permissions.SEND_MESSAGES },
      { targetType: 'role' as const, targetId: 'mod', allow: Permissions.SEND_MESSAGES, deny: 0n },
    ];
    expect(hasPermission(base({ overwrites: ows }), Permissions.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(base({ overwrites: ows, memberRoleIds: ['mod'] }), Permissions.SEND_MESSAGES)).toBe(true);
    const ows2 = [...ows, { targetType: 'member' as const, targetId: 'u1', allow: 0n, deny: Permissions.SEND_MESSAGES }];
    expect(hasPermission(base({ overwrites: ows2, memberRoleIds: ['mod'] }), Permissions.SEND_MESSAGES)).toBe(false);
  });
});
