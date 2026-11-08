import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { Permissions, hasPermission, togetherCreateSchema, togetherOpSchema, type TogetherState, type TogetherSession, type BoardItem, type VoiceState } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { snowflake } from '../lib/snowflake';
import { requireChannel } from '../services/permissions';

/**
 * Together (2.0): polls, timer, notes and a whiteboard inside a call.
 * - Every operation is validated and authorized on the SERVER (hiding a button is never the protection):
 *   only people currently in that call can create/act; closing, clearing and timer control are for the creator
 *   or moderators (MANAGE_MESSAGES; in DMs, the creator).
 * - Versioned state: each accepted op bumps `version`; notes use optimistic concurrency (baseVersion) so two
 *   editors never silently overwrite each other (409 with the current text).
 * - Replays: ops carry a client opId; a repeated opId (reconnect, retry) is acknowledged without applying twice.
 * - Limits: state ≤ 512 KB, board ≤ 1500 items, 8 open tools per call, rate limits per route.
 * - Events go through the authenticated Socket.IO channel room, separate from LiveKit media.
 */
const MAX_STATE = 512 * 1024;
const MAX_ITEMS = 1500;
const MAX_OPEN = 8;
const IDLE_MS = 24 * 3600_000;
const KEEP_MS = 30 * 24 * 3600_000;

export function togetherRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, redis } = ctx;
  const auth = { preHandler: ctx.authenticate };

  const dto = (s: { id: string; channelId: string; kind: string; createdBy: string; version: number; state: unknown; createdAt: Date; updatedAt: Date; closedAt: Date | null; keep: boolean }): TogetherSession => ({
    id: s.id,
    channelId: s.channelId,
    kind: s.kind as TogetherSession['kind'],
    createdBy: s.createdBy,
    version: s.version,
    state: s.state as TogetherState,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    keep: s.keep,
  });

  async function inCall(channelId: string, userId: string) {
    const raw = await redis.hget('voice:states', userId);
    return !!raw && (JSON.parse(raw) as VoiceState).channelId === channelId;
  }
  /** Caller must see the channel AND be in its call right now. */
  async function participant(channelId: string, userId: string) {
    const a = await requireChannel(db, channelId, userId);
    if (!(await inCall(channelId, userId))) throw forbidden('Entre na call para usar o Together');
    return a;
  }
  const isMod = (a: { perms: bigint; channel: { serverId: string | null } }) => !!a.channel.serverId && hasPermission(a.perms, Permissions.MANAGE_MESSAGES);
  const emit = (channelId: string, payload: unknown) => ctx.gw.toChannel(channelId, 'together:update', payload);

  app.get('/channels/:id/together', auth, async (req) => {
    const { id } = req.params as { id: string };
    await requireChannel(db, id, req.auth.userId);
    const rows = await db.togetherSession.findMany({ where: { channelId: id, OR: [{ closedAt: null }, { keep: true }] }, orderBy: { createdAt: 'asc' }, take: 30 });
    return { serverNow: Date.now(), sessions: rows.map(dto) };
  });

  app.post('/channels/:id/together', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = req.params as { id: string };
    await participant(id, req.auth.userId);
    const body = togetherCreateSchema.parse(req.body);
    if ((await db.togetherSession.count({ where: { channelId: id, closedAt: null } })) >= MAX_OPEN) throw badRequest(`No máximo ${MAX_OPEN} ferramentas abertas por call`);
    const state: TogetherState =
      body.kind === 'poll'
        ? { poll: { question: body.question, options: body.options, votes: {}, endsAt: body.durationSec ? Date.now() + body.durationSec * 1000 : null, closed: false } }
        : body.kind === 'timer'
          ? { timer: { label: body.label, durationMs: body.minutes * 60_000, startedAt: null, remainingMs: body.minutes * 60_000 } }
          : body.kind === 'notes'
            ? { notes: { title: body.title, text: '', editedBy: null } }
            : body.kind === 'roll'
              ? { roll: { title: body.title, mode: body.mode, sides: body.sides, results: [] } }
              : { board: { title: body.title, items: [] } };
    const row = await db.togetherSession.create({ data: { id: snowflake(), channelId: id, kind: body.kind, createdBy: req.auth.userId, state: state as Prisma.InputJsonValue } });
    const s = dto(row);
    emit(id, { type: 'created', session: s, serverNow: Date.now() });
    return { serverNow: Date.now(), session: s };
  });

  app.post('/together/:sid/op', { ...auth, bodyLimit: 256 * 1024, config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { sid } = req.params as { sid: string };
    const me = req.auth.userId;
    const { opId, baseVersion, op } = togetherOpSchema.parse(req.body);
    const cur0 = await db.togetherSession.findUnique({ where: { id: sid } });
    if (!cur0) throw notFound('Ferramenta não encontrada');
    const access = await participant(cur0.channelId, me);
    if (cur0.closedAt) throw badRequest('Esta ferramenta já foi encerrada');
    // replay protection (reconnect/retry): same opId within 1 h is acknowledged, not applied again
    const fresh = await redis.set(`together:op:${sid}:${opId}`, '1', 'EX', 3600, 'NX');
    if (!fresh) return { duplicate: true, serverNow: Date.now(), session: dto(cur0) };

    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = attempt === 0 ? cur0 : await db.togetherSession.findUniqueOrThrow({ where: { id: sid } });
      const st = structuredClone(cur.state as TogetherState);
      const mod = isMod(access) || cur.createdBy === me;
      let delta: unknown = null;
      switch (op.type) {
        case 'vote':
        case 'unvote': {
          const p = st.poll;
          if (!p) throw badRequest('Operação inválida para esta ferramenta');
          if (p.closed || (p.endsAt && Date.now() > p.endsAt)) throw badRequest('A enquete já terminou');
          if (op.type === 'vote') {
            if (op.option >= p.options.length) throw badRequest('Opção inválida');
            p.votes[me] = op.option; // one vote per account (changing it replaces the old one)
          } else delete p.votes[me];
          break;
        }
        case 'timer': {
          const t = st.timer;
          if (!t) throw badRequest('Operação inválida para esta ferramenta');
          if (!mod) throw forbidden('Só quem criou o cronômetro ou um moderador controla o tempo');
          const now = Date.now();
          if (op.action === 'start' && t.startedAt === null) t.startedAt = now;
          if (op.action === 'pause' && t.startedAt !== null) {
            t.remainingMs = Math.max(0, t.remainingMs - (now - t.startedAt));
            t.startedAt = null;
          }
          if (op.action === 'reset') {
            if (op.minutes) t.durationMs = op.minutes * 60_000;
            t.remainingMs = t.durationMs;
            t.startedAt = null;
          }
          break;
        }
        case 'replace': {
          const n = st.notes;
          if (!n) throw badRequest('Operação inválida para esta ferramenta');
          if (baseVersion === undefined) throw badRequest('baseVersion é obrigatório nas notas');
          if (baseVersion !== cur.version) {
            // someone else saved first: never overwrite silently — the client merges/decides
            return reply.status(409).send({ code: 'CONFLICT', message: 'As notas mudaram enquanto você escrevia', serverNow: Date.now(), session: dto(cur) });
          }
          n.text = op.text;
          n.editedBy = me;
          break;
        }
        case 'stroke':
        case 'text': {
          const b = st.board;
          if (!b) throw badRequest('Operação inválida para esta ferramenta');
          if (b.items.length >= MAX_ITEMS) throw badRequest('O quadro está cheio: apague algo ou limpe');
          if (b.items.some((i) => i.id === op.id)) break;
          const item: BoardItem = op.type === 'stroke' ? { id: op.id, by: me, type: 'stroke', tool: op.tool, color: op.color, width: op.width, points: op.points } : { id: op.id, by: me, type: 'text', color: op.color, x: op.x, y: op.y, text: op.text };
          b.items.push(item);
          delta = { add: item };
          break;
        }
        case 'erase': {
          const b = st.board;
          if (!b) throw badRequest('Operação inválida para esta ferramenta');
          const ids = new Set(op.ids.filter((id) => b.items.some((i) => i.id === id && (i.by === me || mod))));
          if (!ids.size) throw forbidden('Você só apaga o que desenhou (moderadores apagam tudo)');
          b.items = b.items.filter((i) => !ids.has(i.id));
          delta = { remove: [...ids] };
          break;
        }
        case 'roll': {
          const r = st.roll;
          if (!r) throw badRequest('Operação inválida para esta ferramenta');
          // fair: the server draws (crypto), everyone sees the same result
          let pick: string | null = null;
          let value = randomInt(1, r.sides + 1);
          if (r.mode === 'people') {
            const people = Object.entries(await redis.hgetall('voice:states'))
              .filter(([, v]) => (JSON.parse(v) as VoiceState).channelId === cur.channelId)
              .map(([u]) => u)
              .sort();
            if (!people.length) throw badRequest('Ninguém na call para sortear');
            value = randomInt(0, people.length);
            pick = people[value]!;
          }
          r.results = [{ by: me, value, pick, at: Date.now() }, ...r.results].slice(0, 20);
          break;
        }
        case 'clear': {
          if (!st.board) throw badRequest('Operação inválida para esta ferramenta');
          if (!mod) throw forbidden('Só quem criou o quadro ou um moderador pode limpar tudo');
          st.board.items = [];
          delta = { clear: true };
          break;
        }
      }
      const json = JSON.stringify(st);
      if (json.length > MAX_STATE) throw badRequest('Conteúdo grande demais para esta ferramenta');
      // optimistic concurrency: only writes if nobody else wrote in between (otherwise retry on fresh state)
      const upd = await db.togetherSession.updateMany({ where: { id: sid, version: cur.version }, data: { state: st as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (!upd.count) continue;
      const row = await db.togetherSession.findUniqueOrThrow({ where: { id: sid } });
      const s = dto(row);
      // the board sends just the change (strokes can be big); the rest sends the (small) whole state
      emit(row.channelId, delta ? { type: 'delta', id: sid, version: s.version, delta, serverNow: Date.now() } : { type: 'state', session: s, serverNow: Date.now() });
      return { serverNow: Date.now(), session: delta ? { ...s, state: {} } : s, version: s.version };
    }
    throw badRequest('Muita gente mexendo ao mesmo tempo, tente de novo');
  });

  app.post('/together/:sid/close', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { sid } = req.params as { sid: string };
    const { keep } = z.object({ keep: z.boolean() }).parse(req.body);
    const cur = await db.togetherSession.findUnique({ where: { id: sid } });
    if (!cur) throw notFound('Ferramenta não encontrada');
    const a = await requireChannel(db, cur.channelId, req.auth.userId);
    if (cur.createdBy !== req.auth.userId && !isMod(a)) throw forbidden('Só quem criou ou um moderador encerra');
    if (keep) {
      const row = await db.togetherSession.update({ where: { id: sid }, data: { closedAt: new Date(), keep: true } });
      emit(cur.channelId, { type: 'state', session: dto(row), serverNow: Date.now() });
    } else {
      await db.togetherSession.delete({ where: { id: sid } });
      emit(cur.channelId, { type: 'deleted', id: sid, channelId: cur.channelId });
    }
    return { ok: true };
  });

  // retention: idle open tools after 24 h, kept snapshots after 30 days
  const sweep = async () => {
    const now = Date.now();
    await db.togetherSession
      .deleteMany({ where: { OR: [{ closedAt: null, updatedAt: { lt: new Date(now - IDLE_MS) } }, { keep: false, closedAt: { not: null } }, { keep: true, closedAt: { lt: new Date(now - KEEP_MS) } }] } })
      .catch(() => {});
  };
  const t = setInterval(sweep, 3600_000);
  t.unref?.();
  app.addHook('onClose', async () => clearInterval(t));
}
