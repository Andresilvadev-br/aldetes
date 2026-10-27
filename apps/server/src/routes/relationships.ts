import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServerEvents, type Relationship } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, notFound, forbidden } from '../lib/errors';
import { buildRelationships } from '../services/ready';
import { publicUser } from '../services/serialize';

export function relationshipRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: ctx.authenticate };

  /** Emit to `a` their current view of relationship with `b`. */
  async function emitRel(a: string, b: string) {
    const [out, inc, bUser] = await Promise.all([
      db.relationship.findUnique({ where: { fromId_toId: { fromId: a, toId: b } } }),
      db.relationship.findUnique({ where: { fromId_toId: { fromId: b, toId: a } } }),
      db.user.findUniqueOrThrow({ where: { id: b } }),
    ]);
    let type: Relationship['type'] | null = null;
    if (out) type = out.type === 'friend' ? 'friend' : out.type === 'blocked' ? 'blocked' : 'outgoing';
    else if (inc?.type === 'pending') type = 'incoming';
    ctx.gw.toUser(a, ServerEvents.RELATIONSHIP_UPDATE, { userId: b, type, user: publicUser(bUser) });
  }
  const emitBoth = async (a: string, b: string) => {
    await emitRel(a, b);
    await emitRel(b, a);
    await ctx.gw.broadcastPresence(a);
    await ctx.gw.broadcastPresence(b);
  };

  app.get('/relationships', auth, async (req) => buildRelationships(ctx, req.auth.userId));

  app.post('/relationships', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { username } = z.object({ username: z.string().min(1).max(32) }).parse(req.body);
    const me = req.auth.userId;
    const target = await db.user.findUnique({ where: { username: username.toLowerCase().replace(/^@/, '') } });
    if (!target || target.isBot) throw notFound('Usuário não encontrado');
    if (target.id === me) throw badRequest('Você não pode adicionar a si mesmo');
    const [out, inc] = await Promise.all([
      db.relationship.findUnique({ where: { fromId_toId: { fromId: me, toId: target.id } } }),
      db.relationship.findUnique({ where: { fromId_toId: { fromId: target.id, toId: me } } }),
    ]);
    if (out?.type === 'blocked') throw badRequest('Desbloqueie este usuário primeiro');
    if (inc?.type === 'blocked' || (!target.allowFriendRequests && inc?.type !== 'pending'))
      throw forbidden('Não foi possível enviar a solicitação');
    if (out?.type === 'friend') throw badRequest('Vocês já são amigos');
    if (inc?.type === 'pending') {
      await acceptFriend(me, target.id);
    } else if (!out) {
      await db.relationship.create({ data: { fromId: me, toId: target.id, type: 'pending' } });
    }
    await emitBoth(me, target.id);
    return { ok: true };
  });

  async function acceptFriend(a: string, b: string) {
    await db.$transaction([
      db.relationship.upsert({ where: { fromId_toId: { fromId: a, toId: b } }, create: { fromId: a, toId: b, type: 'friend' }, update: { type: 'friend' } }),
      db.relationship.upsert({ where: { fromId_toId: { fromId: b, toId: a } }, create: { fromId: b, toId: a, type: 'friend' }, update: { type: 'friend' } }),
    ]);
  }

  app.put('/relationships/:userId', auth, async (req) => {
    const { userId } = req.params as { userId: string };
    const { type } = z.object({ type: z.enum(['friend', 'blocked']) }).parse(req.body);
    const me = req.auth.userId;
    if (userId === me) throw badRequest('Inválido');
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw notFound('Usuário não encontrado');
    if (type === 'friend') {
      const inc = await db.relationship.findUnique({ where: { fromId_toId: { fromId: userId, toId: me } } });
      if (inc?.type !== 'pending') throw badRequest('Não há solicitação pendente deste usuário');
      await acceptFriend(me, userId);
    } else {
      await db.$transaction([
        db.relationship.deleteMany({ where: { fromId: userId, toId: me, type: { in: ['friend', 'pending'] } } }),
        db.relationship.upsert({
          where: { fromId_toId: { fromId: me, toId: userId } },
          create: { fromId: me, toId: userId, type: 'blocked' },
          update: { type: 'blocked' },
        }),
      ]);
    }
    await emitBoth(me, userId);
    return { ok: true };
  });

  app.delete('/relationships/:userId', auth, async (req) => {
    const { userId } = req.params as { userId: string };
    const me = req.auth.userId;
    const out = await db.relationship.findUnique({ where: { fromId_toId: { fromId: me, toId: userId } } });
    await db.$transaction([
      db.relationship.deleteMany({ where: { fromId: me, toId: userId } }),
      // remove reciprocal friendship or incoming request — never the other side's block
      db.relationship.deleteMany({ where: { fromId: userId, toId: me, type: out?.type === 'blocked' ? 'none' : { in: ['friend', 'pending'] } } }),
    ]);
    if (await db.user.findUnique({ where: { id: userId }, select: { id: true } })) await emitBoth(me, userId);
    return { ok: true };
  });
}
