import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccessToken, WebhookReceiver, TrackSource, type VideoGrant } from 'livekit-server-sdk';
import { Permissions, hasPermission, type VoiceState } from '@aldetes/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { requireChannel, requireServer, assertCanActOn, getChannelAccess } from '../services/permissions';
import { audit } from '../services/audit';

const VOICE_TYPES = new Set(['voice', 'dm', 'group_dm']);

export function voiceRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, cfg, redis } = ctx;
  const auth = { preHandler: ctx.authenticate };
  const receiver = new WebhookReceiver(cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET);

  const modKey = (serverId: string, userId: string) => `voice:mod:${serverId}:${userId}`;
  async function getMod(serverId: string | null, userId: string) {
    if (!serverId) return { mute: false, deaf: false };
    const raw = await redis.get(modKey(serverId, userId));
    return raw ? (JSON.parse(raw) as { mute: boolean; deaf: boolean }) : { mute: false, deaf: false };
  }

  function sourcesFor(perms: bigint, mute: boolean) {
    const s: TrackSource[] = [];
    if (hasPermission(perms, Permissions.SPEAK) && !mute) s.push(TrackSource.MICROPHONE);
    if (hasPermission(perms, Permissions.VIDEO)) s.push(TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
    return s;
  }

  app.post('/voice/:channelId/join', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { channelId } = req.params as { channelId: string };
    const me = req.auth.userId;
    const a = await requireChannel(db, channelId, me, Permissions.CONNECT);
    if (!VOICE_TYPES.has(a.channel.type)) throw badRequest('Este canal não é de voz');
    const user = await db.user.findUniqueOrThrow({ where: { id: me } });
    const mod = await getMod(a.channel.serverId, me);
    const sources = sourcesFor(a.perms, mod.mute);
    const grant: VideoGrant = {
      room: channelId,
      roomJoin: true,
      canSubscribe: !mod.deaf,
      canPublish: sources.length > 0,
      canPublishData: true,
      canPublishSources: sources,
    };
    const at = new AccessToken(cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET, {
      identity: me,
      name: user.displayName,
      ttl: '6h',
      metadata: JSON.stringify({ serverId: a.channel.serverId, avatarUrl: user.avatarKey ? `${cfg.API_PUBLIC_URL}/cdn/${user.avatarKey}` : null }),
    });
    at.addGrant(grant);
    return {
      url: cfg.LIVEKIT_URL,
      token: await at.toJwt(),
      channelId,
      serverId: a.channel.serverId,
      permissions: { speak: sources.includes(TrackSource.MICROPHONE), video: hasPermission(a.perms, Permissions.VIDEO) },
    };
  });

  app.get('/voice/:channelId/participants', auth, async (req) => {
    const { channelId } = req.params as { channelId: string };
    await requireChannel(db, channelId, req.auth.userId);
    const all = await redis.hgetall('voice:states');
    return Object.values(all)
      .map((v) => JSON.parse(v) as VoiceState)
      .filter((v) => v.channelId === channelId);
  });

  // Moderation: server mute / deafen / disconnect / move
  app.post('/servers/:id/members/:userId/voice', auth, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const body = z
      .object({ mute: z.boolean().optional(), deaf: z.boolean().optional(), disconnect: z.boolean().optional(), channelId: z.string().optional() })
      .parse(req.body);
    const access = await requireServer(db, id, req.auth.userId);
    const need =
      (body.mute !== undefined ? Permissions.MUTE_MEMBERS : 0n) |
      (body.deaf !== undefined ? Permissions.DEAFEN_MEMBERS : 0n) |
      (body.disconnect || body.channelId ? Permissions.MOVE_MEMBERS : 0n);
    if (!need || !hasPermission(access.perms, need)) throw forbidden();
    if (userId !== req.auth.userId) await assertCanActOn(db, access, userId);
    const raw = await redis.hget('voice:states', userId);
    const state = raw ? (JSON.parse(raw) as VoiceState) : null;

    if (body.mute !== undefined || body.deaf !== undefined) {
      const mod = await getMod(id, userId);
      if (body.mute !== undefined) mod.mute = body.mute;
      if (body.deaf !== undefined) mod.deaf = body.deaf;
      if (mod.mute || mod.deaf) await redis.set(modKey(id, userId), JSON.stringify(mod));
      else await redis.del(modKey(id, userId));
      if (state && state.serverId === id) {
        const ca = await getChannelAccess(db, state.channelId, userId);
        const sources = sourcesFor(ca?.perms ?? 0n, mod.mute);
        await ctx.livekit
          .updateParticipant(state.channelId, userId, undefined, {
            canSubscribe: !mod.deaf,
            canPublish: sources.length > 0,
            canPublishData: true,
            canPublishSources: sources,
          })
          .catch((err) => req.log.warn({ err }, 'livekit updateParticipant falhou'));
        await ctx.gw.setVoiceState({ ...state, serverMute: mod.mute, serverDeaf: mod.deaf }, userId);
      }
      await audit(ctx, id, req.auth.userId, 'voice_moderate', userId, { mute: mod.mute, deaf: mod.deaf });
    }
    if (body.disconnect && state?.serverId === id) {
      await ctx.livekit.removeParticipant(state.channelId, userId).catch(() => {});
      await ctx.gw.setVoiceState(null, userId);
      await audit(ctx, id, req.auth.userId, 'voice_disconnect', userId);
    }
    if (body.channelId && state?.serverId === id) {
      const target = await db.channel.findFirst({ where: { id: body.channelId, serverId: id, type: 'voice' } });
      if (!target) throw notFound('Canal de voz não encontrado');
      const ta = await getChannelAccess(db, target.id, userId);
      if (!ta || !hasPermission(ta.perms, Permissions.CONNECT)) throw forbidden('O membro não pode acessar esse canal');
      ctx.gw.toUser(userId, 'voice:move', { channelId: target.id });
      await audit(ctx, id, req.auth.userId, 'voice_move', userId, { channelId: target.id });
    }
    return { ok: true };
  });

  // LiveKit webhooks: the authoritative source of who is in which room.
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
  app.post('/livekit/webhook', { config: { rateLimit: false } }, async (req) => {
    let event;
    try {
      event = await receiver.receive(req.body as string, req.headers.authorization);
    } catch {
      throw unauthorized('assinatura inválida');
    }
    const room = event.room?.name;
    const p = event.participant;
    if (!room) return { ok: true };
    const channel = await db.channel.findUnique({ where: { id: room } });
    if (!channel) return { ok: true };

    switch (event.event) {
      case 'participant_joined': {
        if (!p) break;
        const userId = p.identity;
        const prevRaw = await redis.hget('voice:states', userId);
        const prev = prevRaw ? (JSON.parse(prevRaw) as VoiceState) : null;
        if (prev && prev.channelId !== room) {
          // One voice connection per user: kick from previous room.
          await ctx.livekit.removeParticipant(prev.channelId, userId).catch(() => {});
        }
        const mod = await getMod(channel.serverId, userId);
        await ctx.gw.setVoiceState(
          {
            userId,
            channelId: room,
            serverId: channel.serverId,
            selfMute: prev?.channelId === room ? prev.selfMute : false,
            selfDeaf: prev?.channelId === room ? prev.selfDeaf : false,
            serverMute: mod.mute,
            serverDeaf: mod.deaf,
            video: false,
            streaming: false,
          },
          userId,
        );
        if (!channel.serverId) {
          // DM call ringing: notify recipients not yet in the call
          const recs = await db.channelRecipient.findMany({ where: { channelId: room, userId: { not: userId } } });
          for (const r of recs) ctx.gw.toUser(r.userId, 'call:ring', { channelId: room, from: userId });
        }
        break;
      }
      case 'participant_left': {
        if (!p) break;
        const raw = await redis.hget('voice:states', p.identity);
        if (raw && (JSON.parse(raw) as VoiceState).channelId === room) await ctx.gw.setVoiceState(null, p.identity);
        break;
      }
      case 'track_published':
      case 'track_unpublished': {
        if (!p || !event.track) break;
        const raw = await redis.hget('voice:states', p.identity);
        if (!raw) break;
        const st = JSON.parse(raw) as VoiceState;
        if (st.channelId !== room) break;
        const on = event.event === 'track_published';
        if (event.track.source === TrackSource.CAMERA) st.video = on;
        else if (event.track.source === TrackSource.SCREEN_SHARE) st.streaming = on;
        else break;
        await ctx.gw.setVoiceState(st, p.identity);
        break;
      }
      case 'room_finished': {
        const all = await redis.hgetall('voice:states');
        for (const [uid, v] of Object.entries(all)) if ((JSON.parse(v) as VoiceState).channelId === room) await ctx.gw.setVoiceState(null, uid);
        break;
      }
    }
    return { ok: true };
  });
}
