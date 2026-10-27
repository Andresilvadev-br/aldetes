import type { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { snowflake } from '../lib/snowflake';

export async function audit(
  ctx: AppContext,
  serverId: string,
  actorId: string,
  action: string,
  targetId?: string | null,
  data?: Prisma.InputJsonValue,
  reason?: string | null,
) {
  await ctx.db.auditLog.create({
    data: { id: snowflake(), serverId, actorId, action, targetId: targetId ?? null, data: data ?? undefined, reason: reason ?? null },
  });
}
