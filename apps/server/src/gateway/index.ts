import type { Server as IOServer, Socket } from 'socket.io';
import { ServerEvents, ClientEvents, presenceStatus, activitySchema, Permissions, hasPermission, type Presence, type VoiceState, type Activity } from '@aldetes/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { extractToken, resolveSession } from '../auth';
import { visibleChannelIds, getChannelAccess } from '../services/permissions';
import { buildReady } from '../services/ready';
import { parseCookie } from '../lib/cookie';

export const rooms = {
  user: (id: string) => `user:${id}`,
  session: (id: string) => `session:${id}`,
  server: (id: string) => `server:${id}`,
  channel: (id: string) => `channel:${id}`,
};

export class Gateway {
  constructor(private ctx: AppContext) {}

  get io(): IOServer {
    return this.ctx.io;
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.io.to(rooms.user(userId)).emit(event, payload);
  }
  toChannel(channelId: string, event: string, payload: unknown) {
    this.io.to(rooms.channel(channelId)).emit(event, payload);
  }
  toServer(serverId: string, event: string, payload: unknown) {
    this.io.to(rooms.server(serverId)).emit(event, payload);
  }

  /** Recompute which channel rooms a user's sockets are in for one server. */
  async syncServerSubscriptions(serverId: string, userId: string) {
    const sockets = await this.io.in(rooms.user(userId)).fetchSockets();
    if (!sockets.length) return;
    const all = await this.ctx.db.channel.findMany({ where: { serverId }, select: { id: true } });
    const visible = new Set(await visibleChannelIds(this.ctx.db, serverId, userId));
    const leave = all.filter((c) => !visible.has(c.id)).map((c) => rooms.channel(c.id));
    const isMember = !!(await this.ctx.db.member.findUnique({ where: { serverId_userId: { serverId, userId } } }));
    if (!isMember) leave.push(rooms.server(serverId));
    if (leave.length) this.io.in(rooms.user(userId)).socketsLeave(leave);
    const join = [...visible].map(rooms.channel);
    if (isMember) join.push(rooms.server(serverId));
    if (join.length) this.io.in(rooms.user(userId)).socketsJoin(join);
  }

  /** After role/overwrite changes: resync every online member of the server. */
  async syncServerForAll(serverId: string) {
    const sockets = await this.io.in(rooms.server(serverId)).fetchSockets();
    const users = new Set(sockets.map((s) => s.data.userId as string));
    await Promise.all([...users].map((u) => this.syncServerSubscriptions(serverId, u)));
  }

  /** Users that should receive presence updates about `userId`. */
  async presenceAudience(userId: string): Promise<string[]> {
    const [memberships, rels] = await Promise.all([
      this.ctx.db.member.findMany({ where: { userId }, select: { serverId: true } }),
      this.ctx.db.relationship.findMany({ where: { fromId: userId, type: 'friend' }, select: { toId: true } }),
    ]);
    return [...memberships.map((m) => rooms.server(m.serverId)), ...rels.map((r) => rooms.user(r.toId))];
  }

  async broadcastPresence(userId: string) {
    const presence = await getPresence(this.ctx, userId);
    const audience = await this.presenceAudience(userId);
    audience.push(rooms.user(userId));
    this.io.to(audience).emit(ServerEvents.PRESENCE_UPDATE, presence);
  }

  async setVoiceState(state: VoiceState | null, userId: string) {
    const prevRaw = await this.ctx.redis.hget('voice:states', userId);
    const prev = prevRaw ? (JSON.parse(prevRaw) as VoiceState) : null;
    if (state) await this.ctx.redis.hset('voice:states', userId, JSON.stringify(state));
    else await this.ctx.redis.hdel('voice:states', userId);
    const target = state ?? prev;
    if (!target) return;
    const payload = state ?? { ...prev!, channelId: null };
    const emitTo = (s: VoiceState) => (s.serverId ? rooms.server(s.serverId) : rooms.channel(s.channelId));
    const targets = new Set<string>([emitTo(target)]);
    if (prev && state && prev.channelId !== state.channelId) targets.add(emitTo(prev));
    this.io.to([...targets]).emit(ServerEvents.VOICE_STATE_UPDATE, { userId, state: payload });
  }

  attach() {
    const { io } = this;
    io.use(async (socket, next) => {
      try {
        const authToken = (socket.handshake.auth as { token?: string })?.token;
        let token = typeof authToken === 'string' ? authToken : null;
        if (!token) {
          const t = extractToken({ headers: {}, cookies: parseCookie(socket.handshake.headers.cookie ?? '') });
          token = t?.token ?? null;
        }
        if (!token) return next(new Error('UNAUTHORIZED'));
        const info = await resolveSession(this.ctx, token);
        if (!info) return next(new Error('UNAUTHORIZED'));
        socket.data.userId = info.userId;
        socket.data.sessionId = info.sessionId;
        next();
      } catch (err) {
        next(err as Error);
      }
    });

    io.on('connection', (socket) => {
      this.onConnection(socket).catch((err) => {
        socket.emit('error', { message: 'falha ao iniciar sessão' });
        console.error(err);
        socket.disconnect(true);
      });
    });
  }

  private async onConnection(socket: Socket) {
    const userId = socket.data.userId as string;
    const { db } = this.ctx;
    const joins = [rooms.user(userId), rooms.session(socket.data.sessionId)];
    const memberships = await db.member.findMany({ where: { userId }, select: { serverId: true } });
    for (const m of memberships) {
      joins.push(rooms.server(m.serverId));
      for (const c of await visibleChannelIds(db, m.serverId, userId)) joins.push(rooms.channel(c));
    }
    const dms = await db.channelRecipient.findMany({ where: { userId }, select: { channelId: true } });
    for (const d of dms) joins.push(rooms.channel(d.channelId));
    await socket.join(joins);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const wasOnline = await this.ctx.redis.exists(`presence:${userId}`);
    await this.ctx.redis.set(`presence:${userId}`, user.status);
    if (!wasOnline) await this.broadcastPresence(userId);

    socket.emit(ServerEvents.READY, await buildReady(this.ctx, userId, socket.data.sessionId));

    let lastTyping = 0;
    socket.on(ClientEvents.TYPING, async (data: unknown) => {
      const parsed = z.object({ channelId: z.string().max(25) }).safeParse(data);
      if (!parsed.success) return;
      const now = Date.now();
      if (now - lastTyping < 2000) return;
      lastTyping = now;
      const { channelId } = parsed.data;
      if (!socket.rooms.has(rooms.channel(channelId))) return;
      const access = await getChannelAccess(db, channelId, userId);
      if (!access || !hasPermission(access.perms, Permissions.SEND_MESSAGES)) return;
      socket.to(rooms.channel(channelId)).emit(ServerEvents.TYPING_START, { channelId, userId, at: now });
    });

    socket.on(ClientEvents.PRESENCE_SET, async (data: unknown) => {
      const parsed = z.object({ status: presenceStatus }).safeParse(data);
      if (!parsed.success) return;
      await db.user.update({ where: { id: userId }, data: { status: parsed.data.status } });
      await this.ctx.redis.set(`presence:${userId}`, parsed.data.status);
      await this.broadcastPresence(userId);
    });

    // Rich presence: "Jogando X" / "Ouvindo Y". Kept 10 min (clients refresh it), cleared when offline.
    let lastActivityAt = 0;
    socket.on('presence:activity', async (data: unknown) => {
      const parsed = activitySchema.safeParse(data);
      if (!parsed.success) return;
      const now = Date.now();
      if (now - lastActivityAt < 1500) return; // rate limit
      lastActivityAt = now;
      const key = `activity:${userId}`;
      const prev = await this.ctx.redis.get(key);
      const next = parsed.data ? JSON.stringify({ ...parsed.data, startedAt: Math.min(parsed.data.startedAt, now) }) : null;
      if (next) await this.ctx.redis.set(key, next, 'EX', 600);
      else await this.ctx.redis.del(key);
      if ((prev ?? null) !== next) await this.broadcastPresence(userId);
    });

    // 2.0 Together: ephemeral presence (board cursors, "editing the notes") — relayed, never stored.
    // Only for people in that call (checked against the voice state, cached 10 s per socket), max ~20/s per socket.
    const inCallCache = new Map<string, number>();
    let lastEphemeral = 0;
    socket.on('together:presence', async (data: unknown) => {
      const p = z.object({ channelId: z.string().max(32), sid: z.string().max(32), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), editing: z.boolean().optional() }).safeParse(data);
      if (!p.success) return;
      const now = Date.now();
      if (now - lastEphemeral < 45) return;
      lastEphemeral = now;
      const ok = inCallCache.get(p.data.channelId);
      if (!ok || now - ok > 10_000) {
        const raw = await this.ctx.redis.hget('voice:states', userId);
        if (!raw || (JSON.parse(raw) as VoiceState).channelId !== p.data.channelId) return void inCallCache.delete(p.data.channelId);
        inCallCache.set(p.data.channelId, now);
      }
      socket.to(rooms.channel(p.data.channelId)).emit('together:presence', { ...p.data, userId });
    });

    socket.on('voice:self', async (data: unknown) => {
      const parsed = z
        .object({ selfMute: z.boolean(), selfDeaf: z.boolean(), video: z.boolean().optional(), streaming: z.boolean().optional() })
        .safeParse(data);
      if (!parsed.success) return;
      const raw = await this.ctx.redis.hget('voice:states', userId);
      if (!raw) return;
      const st = JSON.parse(raw) as VoiceState;
      await this.setVoiceState({ ...st, ...parsed.data }, userId);
    });

    socket.on('disconnect', async () => {
      // grace period to avoid flapping on quick reconnects
      setTimeout(async () => {
        const remaining = await this.io.in(rooms.user(userId)).fetchSockets().catch(() => []);
        if (remaining.length === 0) {
          await this.ctx.redis.del(`presence:${userId}`, `activity:${userId}`);
          await this.broadcastPresence(userId).catch(() => {});
        }
      }, 4000);
    });
  }
}

export async function getPresence(ctx: AppContext, userId: string): Promise<Presence> {
  const [status, user, act] = await Promise.all([
    ctx.redis.get(`presence:${userId}`),
    ctx.db.user.findUnique({ where: { id: userId }, select: { customStatus: true } }),
    ctx.redis.get(`activity:${userId}`),
  ]);
  const effective = !status || status === 'invisible' ? 'offline' : (status as Presence['status']);
  const offline = effective === 'offline';
  return {
    userId,
    status: effective,
    customStatus: offline ? null : (user?.customStatus ?? null),
    activity: offline || !act ? null : (JSON.parse(act) as Activity),
  };
}
