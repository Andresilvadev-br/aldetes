import type { FastifyInstance } from 'fastify';
import { createRoleSchema, updateRoleSchema, ServerEvents, Permissions, hasPermission, ALL_PERMISSIONS } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import * as S from '../services/serialize';
import { requireServer, assertCanActOn, type ServerAccess } from '../services/permissions';
import { audit } from '../services/audit';

/** A member can't grant permissions they don't have themselves (unless owner/admin). */
function assertGrantable(access: ServerAccess, perms: bigint) {
  if (access.isOwner || hasPermission(access.perms, Permissions.ADMINISTRATOR)) return;
  if ((perms & ~access.perms & ALL_PERMISSIONS) !== 0n) throw forbidden('Você não pode conceder permissões que não possui');
}

export async function setMemberRoles(
  ctx: AppContext,
  access: ServerAccess,
  actorId: string,
  serverId: string,
  userId: string,
  roleIds: string[],
) {
  const { db } = ctx;
  if (!hasPermission(access.perms, Permissions.MANAGE_ROLES)) throw forbidden();
  const member = await db.member.findUnique({ where: { serverId_userId: { serverId, userId } }, include: { roles: true } });
  if (!member) throw notFound('Membro não encontrado');
  const current = new Set(member.roles.map((r) => r.roleId));
  const next = new Set(roleIds);
  const changed = [...new Set([...current, ...next])].filter((r) => current.has(r) !== next.has(r));
  const roles = await db.role.findMany({ where: { serverId, id: { in: changed } } });
  if (roles.length !== changed.length || roles.some((r) => r.isEveryone)) throw badRequest('Cargo inválido');
  // Hierarchy: can only add/remove roles below your top role.
  if (!access.isOwner && roles.some((r) => r.position >= access.topRolePosition)) throw forbidden('Cargo acima da sua hierarquia');
  if (userId !== actorId) await assertCanActOn(db, access, userId);
  await db.$transaction([
    db.memberRole.deleteMany({ where: { serverId, userId, roleId: { in: changed.filter((r) => current.has(r)) } } }),
    db.memberRole.createMany({ data: changed.filter((r) => next.has(r)).map((roleId) => ({ serverId, userId, roleId })) }),
  ]);
  await audit(ctx, serverId, actorId, 'member_roles_update', userId, {
    added: changed.filter((r) => next.has(r)),
    removed: changed.filter((r) => current.has(r)),
  });
  await ctx.gw.syncServerSubscriptions(serverId, userId);
}

export function roleRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  app.post('/servers/:id/roles', auth, async (req) => {
    const { id } = req.params as { id: string };
    const body = createRoleSchema.parse(req.body);
    const access = await requireServer(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    const perms = BigInt(body.permissions ?? '0');
    assertGrantable(access, perms);
    const count = await db.role.count({ where: { serverId: id } });
    if (count >= 250) throw badRequest('Limite de cargos atingido');
    // New role goes right above @everyone; shift others up.
    await db.role.updateMany({ where: { serverId: id, position: { gte: 1 } }, data: { position: { increment: 1 } } });
    const role = await db.role.create({
      data: {
        id: snowflake(),
        serverId: id,
        name: body.name,
        color: body.color ?? null,
        permissions: perms.toString(),
        hoist: body.hoist ?? false,
        mentionable: body.mentionable ?? false,
        position: 1,
      },
    });
    await audit(ctx, id, req.auth.userId, 'role_create', role.id, { name: role.name });
    const all = await db.role.findMany({ where: { serverId: id } });
    for (const r of all) ctx.gw.toServer(id, r.id === role.id ? ServerEvents.ROLE_CREATE : ServerEvents.ROLE_UPDATE, S.role(r));
    return S.role(role);
  });

  app.patch('/servers/:id/roles/:roleId', auth, async (req) => {
    const { id, roleId } = req.params as { id: string; roleId: string };
    const body = updateRoleSchema.parse(req.body);
    const access = await requireServer(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    const role = await db.role.findFirst({ where: { id: roleId, serverId: id } });
    if (!role) throw notFound('Cargo não encontrado');
    if (!access.isOwner && role.position >= access.topRolePosition) throw forbidden('Cargo acima da sua hierarquia');
    if (body.permissions !== undefined) assertGrantable(access, BigInt(body.permissions));
    if (role.isEveryone && (body.name || body.position)) throw badRequest('Não é possível renomear ou mover @everyone');
    if (body.position !== undefined && !access.isOwner && body.position >= access.topRolePosition) throw forbidden();

    if (body.position !== undefined && body.position !== role.position) {
      // reorder: remove from old slot, insert at new
      const roles = (await db.role.findMany({ where: { serverId: id, isEveryone: false }, orderBy: { position: 'asc' } })).filter((r) => r.id !== roleId);
      const idx = Math.min(Math.max(body.position - 1, 0), roles.length);
      roles.splice(idx, 0, role);
      await db.$transaction(roles.map((r, i) => db.role.update({ where: { id: r.id }, data: { position: i + 1 } })));
    }
    const { position: _p, ...rest } = body;
    const updated = await db.role.update({ where: { id: roleId }, data: rest });
    await audit(ctx, id, req.auth.userId, 'role_update', roleId, body);
    const all = await db.role.findMany({ where: { serverId: id } });
    for (const r of all) ctx.gw.toServer(id, ServerEvents.ROLE_UPDATE, S.role(r));
    if (body.permissions !== undefined) await ctx.gw.syncServerForAll(id);
    return S.role(updated);
  });

  app.delete('/servers/:id/roles/:roleId', auth, async (req) => {
    const { id, roleId } = req.params as { id: string; roleId: string };
    const access = await requireServer(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    const role = await db.role.findFirst({ where: { id: roleId, serverId: id } });
    if (!role) throw notFound('Cargo não encontrado');
    if (role.isEveryone) throw badRequest('@everyone não pode ser excluído');
    if (!access.isOwner && role.position >= access.topRolePosition) throw forbidden('Cargo acima da sua hierarquia');
    await db.$transaction([
      db.role.delete({ where: { id: roleId } }),
      db.permissionOverwrite.deleteMany({ where: { targetType: 'role', targetId: roleId } }),
    ]);
    await audit(ctx, id, req.auth.userId, 'role_delete', roleId, { name: role.name });
    ctx.gw.toServer(id, ServerEvents.ROLE_DELETE, { serverId: id, id: roleId });
    await ctx.gw.syncServerForAll(id);
    return { ok: true };
  });

  app.put('/servers/:id/members/:userId/roles/:roleId', auth, async (req) => {
    const { id, userId, roleId } = req.params as { id: string; userId: string; roleId: string };
    const access = await requireServer(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    const m = await db.member.findUnique({ where: { serverId_userId: { serverId: id, userId } }, include: { roles: true } });
    if (!m) throw notFound('Membro não encontrado');
    await setMemberRoles(ctx, access, req.auth.userId, id, userId, [...new Set([...m.roles.map((r) => r.roleId), roleId])]);
    const full = await db.member.findUniqueOrThrow({ where: { serverId_userId: { serverId: id, userId } }, include: S.memberInclude });
    ctx.gw.toServer(id, ServerEvents.MEMBER_UPDATE, S.member(full));
    return S.member(full);
  });

  app.delete('/servers/:id/members/:userId/roles/:roleId', auth, async (req) => {
    const { id, userId, roleId } = req.params as { id: string; userId: string; roleId: string };
    const access = await requireServer(db, id, req.auth.userId, Permissions.MANAGE_ROLES);
    const m = await db.member.findUnique({ where: { serverId_userId: { serverId: id, userId } }, include: { roles: true } });
    if (!m) throw notFound('Membro não encontrado');
    await setMemberRoles(ctx, access, req.auth.userId, id, userId, m.roles.map((r) => r.roleId).filter((r) => r !== roleId));
    const full = await db.member.findUniqueOrThrow({ where: { serverId_userId: { serverId: id, userId } }, include: S.memberInclude });
    ctx.gw.toServer(id, ServerEvents.MEMBER_UPDATE, S.member(full));
    return S.member(full);
  });

}
