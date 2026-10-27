import type { VoiceState } from '@aldetes/shared';
import type { AppContext } from '../context';

/**
 * Webhooks can be lost (API restart, network). Periodically compare Redis voice
 * states with LiveKit's actual rooms and drop stale entries.
 */
export async function reconcileVoiceStates(ctx: AppContext) {
  const all = await ctx.redis.hgetall('voice:states');
  const states = Object.entries(all).map(([u, v]) => [u, JSON.parse(v) as VoiceState] as const);
  if (!states.length) return;
  const rooms = new Set((await ctx.livekit.listRooms()).map((r) => r.name));
  const cache = new Map<string, Set<string>>();
  for (const [userId, st] of states) {
    if (!rooms.has(st.channelId)) {
      await ctx.gw.setVoiceState(null, userId);
      continue;
    }
    if (!cache.has(st.channelId)) {
      const ps = await ctx.livekit.listParticipants(st.channelId);
      cache.set(st.channelId, new Set(ps.map((p) => p.identity)));
    }
    if (!cache.get(st.channelId)!.has(userId)) await ctx.gw.setVoiceState(null, userId);
  }
}
