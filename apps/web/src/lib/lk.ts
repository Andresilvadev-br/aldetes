/**
 * The few LiveKit constants the UI needs, as plain values. They mirror livekit-client's string enums exactly,
 * so screens can use them WITHOUT importing the (large) SDK — it is only downloaded when joining a call.
 */
import type { Track as T, ConnectionQuality as CQ, ConnectionState as CS } from 'livekit-client';

export const Track = {
  Source: {
    Camera: 'camera' as T.Source.Camera,
    Microphone: 'microphone' as T.Source.Microphone,
    ScreenShare: 'screen_share' as T.Source.ScreenShare,
    ScreenShareAudio: 'screen_share_audio' as T.Source.ScreenShareAudio,
  },
  Kind: { Audio: 'audio' as T.Kind.Audio, Video: 'video' as T.Kind.Video },
};
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Track {
  type Source = T.Source;
}
export const ConnectionQuality = {
  Excellent: 'excellent' as CQ.Excellent,
  Good: 'good' as CQ.Good,
  Poor: 'poor' as CQ.Poor,
  Lost: 'lost' as CQ.Lost,
  Unknown: 'unknown' as CQ.Unknown,
};
export type ConnectionQuality = CQ;
export const ConnectionState = { Connected: 'connected' as CS.Connected };

type LK = typeof import('livekit-client');
let lk: Promise<LK> | null = null;
/** Download the SDK once (starts early when the user hovers/enters a voice channel). */
export const loadLiveKit = () => (lk ??= import('livekit-client'));
