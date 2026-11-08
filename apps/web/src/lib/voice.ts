import { guardScreenAudio, type GuardState } from './screenAudioGuard';
import { create } from 'zustand';
import type {
  Room,
  DisconnectReason,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  LocalTrackPublication,
  ScreenShareCaptureOptions,
  AudioCaptureOptions,
} from 'livekit-client';
import { Track, ConnectionQuality, ConnectionState, loadLiveKit } from './lk';

/** The SDK, loaded on the first call (see lib/lk.ts). */
let LK: Awaited<ReturnType<typeof loadLiveKit>>;
import { api } from './api';
import { emit } from './gateway';
import { getPrefs, setPrefs } from './prefs';
import { playSound } from './sounds';
import { desktop } from './desktop';
import { setExternalLoad } from './perf';
import { toast } from '../components/common/overlay';

export interface VoiceStore {
  channelId: string | null;
  serverId: string | null;
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  error: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  camera: boolean;
  screen: boolean;
  pttActive: boolean;
  canSpeak: boolean;
  canVideo: boolean;
  speaking: Record<string, boolean>;
  quality: Record<string, ConnectionQuality>;
  /** bumps whenever participants/tracks change so views re-render */
  version: number;
  focused: string | null; // "<identity>:<source>"
  pingMs: number | null;
  connectedAt: number | null;
  screenSince: number | null;
  /** what is really being sent, e.g. "1080p · 60 FPS" */
  screenInfo: string | null;
  /** stream PC sound: true = call voices left out (no echo), false = may contain them, null = no sound */
  screenAudioIsolated: boolean | null;
  /** echo guard on the PC sound of my stream (lib/screenAudioGuard) */
  screenAudioGuard: GuardState | null;
  /** live encoder stats of our own stream (sampled every 2 s) */
  screenStats: StreamStats | null;
  /** actions waiting for the real result (button shows loading; state confirmed only after it returns) */
  pending: { mic: boolean; cam: boolean; screen: boolean };
  /** stage layout when 2+ videos: one in focus + thumbnails, or a mosaic (kept for the session) */
  stageLayout: 'focus' | 'grid' | 'free';
  /** live reactions currently on screen */
  reactions: LiveReaction[];
  /** per-tile framing chosen by the viewer: whole picture (contain) or fill the tile (cover) */
  fit: Record<string, 'contain' | 'cover'>;
  /** viewer's quality choice per stream (only matters when the streamer offers a light version) */
  viewQuality: Record<string, 'auto' | 'max' | 'low'>;
  /** in-app floating player hidden by the user */
  miniClosed: boolean;
}

export interface LiveReaction {
  id: string;
  from: string;
  emoji: string;
  at: number;
}
/** The 8 reactions (order = Alt+1…Alt+8). */
export const REACTIONS = ['❤️', '😂', '👏', '😮', '🔥', '👍', '🎉', '💀'] as const;

export interface StreamStats {
  width: number;
  height: number;
  fps: number;
  /** frames per second coming out of the capturer (before encoding) */
  sourceFps: number;
  targetFps: number;
  mbps: number;
  /** what the browser says is holding quality back */
  limit: 'none' | 'cpu' | 'bandwidth' | 'other';
  /** true when the GPU's hardware encoder is doing the work */
  hardware: boolean | null;
  encoder: string | null;
  codec: string | null;
}

export const useVoice = create<VoiceStore>()(() => ({
  channelId: null,
  serverId: null,
  state: 'idle',
  error: null,
  selfMute: false,
  selfDeaf: false,
  camera: false,
  screen: false,
  pttActive: false,
  canSpeak: true,
  canVideo: true,
  speaking: {},
  quality: {},
  version: 0,
  focused: null,
  pingMs: null,
  connectedAt: null,
  screenSince: null,
  screenInfo: null,
  screenAudioIsolated: null,
  screenAudioGuard: null,
  screenStats: null,
  pending: { mic: false, cam: false, screen: false },
  stageLayout: (() => {
    try {
      const v = sessionStorage.getItem('aldetes.stageLayout');
      return v === 'grid' || v === 'free' ? v : 'focus';
    } catch {
      return 'focus';
    }
  })(),
  reactions: [],
  fit: {},
  viewQuality: {},
  miniClosed: false,
}));
const appVersion = () => (desktop?.version && desktop.version !== '0.0.0' ? desktop.version : __APP_VERSION__);
/** Version reported by a participant's app (null = an app older than 0.8, which doesn't report it). */
export function participantVersion(identity: string): string | null {
  const p = getParticipant(identity);
  return p?.attributes?.app ?? null;
}
/** Screen sharing needs getDisplayMedia (desktop browsers, Android Chrome; not iOS Safari) or the desktop app. */
export const canShareScreen = () => !!desktop || typeof navigator.mediaDevices?.getDisplayMedia === 'function';

// Phones suspend audio when the app goes to the background or a phone call interrupts: resume when back.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && room) void room.startAudio().catch(() => {});
  });

export function setStageLayout(l: 'focus' | 'grid' | 'free') {
  vset({ stageLayout: l });
  try {
    sessionStorage.setItem('aldetes.stageLayout', l);
  } catch {
    /* ignore */
  }
}
const setPending = (k: keyof VoiceStore['pending'], v: boolean) => vset((s) => ({ pending: { ...s.pending, [k]: v } }));
/** Participant by identity (local included) — used by live avatars to read the real audio level. */
export function getParticipant(identity: string): Participant | undefined {
  if (!room) return undefined;
  return room.localParticipant.identity === identity ? room.localParticipant : room.remoteParticipants.get(identity);
}
const vset = useVoice.setState;
const vget = useVoice.getState;
const bump = () => vset((s) => ({ version: s.version + 1 }));

let room: Room | null = null;
let intentionalLeave = false;
let rejoinAttempts = 0;
let statsTimer: ReturnType<typeof setInterval> | null = null;
const audioHost = (() => {
  const d = document.createElement('div');
  d.style.display = 'none';
  d.id = 'aldetes-audio';
  document.body.appendChild(d);
  return d;
})();

export const getRoom = () => room;

function publishSelfState() {
  const s = vget();
  emit('voice:self', { selfMute: s.selfMute || (getPrefs().voiceMode === 'ptt' && !s.pttActive), selfDeaf: s.selfDeaf, video: s.camera, streaming: s.screen });
}

function micShouldBeOn() {
  const s = vget();
  if (!s.canSpeak || s.selfMute || s.selfDeaf) return false;
  if (getPrefs().voiceMode === 'ptt') return s.pttActive;
  return true;
}

async function syncMic() {
  if (!room || room.state !== ConnectionState.Connected) return;
  const on = micShouldBeOn();
  const p = getPrefs();
  try {
    await room.localParticipant.setMicrophoneEnabled(on, {
      deviceId: p.inputDeviceId !== 'default' ? p.inputDeviceId : undefined,
      noiseSuppression: p.noiseSuppression,
      echoCancellation: p.echoCancellation,
      autoGainControl: p.autoGainControl,
    });
  } catch (err) {
    vset({ selfMute: true });
    toast(micError(err), 'error');
  }
}

function micError(err: unknown) {
  const name = (err as Error)?.name;
  if (name === 'NotAllowedError') return 'Permissão de microfone negada. Libere o acesso nas configurações do sistema/navegador.';
  if (name === 'NotFoundError') return 'Nenhum microfone encontrado.';
  if (name === 'NotReadableError') return 'O microfone está em uso por outro aplicativo.';
  return `Falha ao acessar o microfone: ${(err as Error)?.message ?? err}`;
}

function applyRemoteAudio(p: RemoteParticipant) {
  const prefs = getPrefs();
  const deaf = vget().selfDeaf;
  const vol = prefs.localMutes[p.identity] ? 0 : (prefs.userVolumes[p.identity] ?? 1);
  for (const pub of p.audioTrackPublications.values()) {
    pub.setEnabled(!deaf);
  }
  p.setVolume(vol, Track.Source.Microphone);
  // the stream's sound has its OWN volume (MultiView): never mixed with the person's voice volume
  p.setVolume(prefs.streamVolumes[p.identity] ?? 1, Track.Source.ScreenShareAudio);
}

function attachRoomEvents(r: Room) {
  r.on(LK.RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.dataset.identity = participant.identity;
      audioHost.appendChild(el);
      const out = getPrefs().outputDeviceId;
      if (out && out !== 'default') void (track as any).setSinkId?.(out);
      applyRemoteAudio(participant);
    }
    bump();
  })
    .on(LK.RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      bump();
    })
    .on(LK.RoomEvent.ParticipantConnected, (p) => {
      playSound('join');
      applyRemoteAudio(p);
      bump();
    })
    .on(LK.RoomEvent.ParticipantDisconnected, (p) => {
      playSound('leave');
      if (vget().focused?.startsWith(p.identity + ':')) vset({ focused: null });
      bump();
    })
    .on(LK.RoomEvent.TrackPublished, bump)
    .on(LK.RoomEvent.TrackUnpublished, (pub, p) => {
      if (vget().focused === `${p.identity}:${pub.source}`) vset({ focused: null });
      bump();
    })
    .on(LK.RoomEvent.TrackMuted, bump)
    .on(LK.RoomEvent.ParticipantAttributesChanged, bump)
    .on(LK.RoomEvent.TrackUnmuted, bump)
    .on(LK.RoomEvent.LocalTrackPublished, bump)
    .on(LK.RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.ScreenShare) {
        stopStreamStats();
        vset({ screen: false, screenInfo: null });
        publishSelfState();
      }
      if (pub.source === Track.Source.Camera) {
        vset({ camera: false });
        publishSelfState();
      }
      bump();
    })
    .on(LK.RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic === 'reaction' && participant) onReactionData(payload, participant.identity);
    })
    .on(LK.RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      vset({ speaking: Object.fromEntries(speakers.map((s) => [s.identity, true])) });
    })
    .on(LK.RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
      vset((s) => ({ quality: { ...s.quality, [p.identity]: q } }));
    })
    .on(LK.RoomEvent.Reconnecting, () => vset({ state: 'reconnecting' }))
    .on(LK.RoomEvent.Reconnected, () => {
      vset({ state: 'connected' });
      publishSelfState();
    })
    .on(LK.RoomEvent.ParticipantPermissionsChanged, () => {
      const perms = r.localParticipant.permissions;
      const canMic = !!perms?.canPublishSources?.includes(2 /* MICROPHONE */) || (!!perms?.canPublish && !perms?.canPublishSources?.length);
      vset({ canSpeak: canMic });
      if (perms && !perms.canSubscribe) toast('Você foi ensurdecido por um moderador.');
      if (!canMic) toast('Você foi silenciado por um moderador.');
      bump();
    })
    .on(LK.RoomEvent.MediaDevicesError, (e: Error) => toast(micError(e), 'error'))
    .on(LK.RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      cleanupRoom();
      if (intentionalLeave) return;
      const cid = vget().channelId;
      // Kicked / moved / room deleted: don't auto-rejoin
      if (reason === LK.DisconnectReason.PARTICIPANT_REMOVED || reason === LK.DisconnectReason.ROOM_DELETED || reason === LK.DisconnectReason.DUPLICATE_IDENTITY) {
        vset({ state: 'idle', channelId: null, serverId: null });
        if (reason === LK.DisconnectReason.PARTICIPANT_REMOVED) toast('Você foi desconectado do canal de voz.');
        return;
      }
      if (cid && rejoinAttempts < 5) {
        rejoinAttempts++;
        vset({ state: 'reconnecting' });
        setTimeout(() => void joinVoice(cid, true), Math.min(8000, 1000 * 2 ** rejoinAttempts));
      } else {
        vset({ state: 'failed', error: 'Conexão de voz perdida' });
      }
    });
}

function cleanupRoom() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
  audioHost.innerHTML = '';
  room?.removeAllListeners();
  room = null;
  stopStreamStats();
  seenReactions.clear();
  vset({ speaking: {}, quality: {}, camera: false, screen: false, focused: null, pingMs: null, screenSince: null, reactions: [], pending: { mic: false, cam: false, screen: false } });
  bump();
}

export async function joinVoice(channelId: string, isRejoin = false) {
  watchDevices();
  if (!isRejoin && vget().channelId === channelId && room) return;
  if (room) {
    intentionalLeave = true;
    await room.disconnect();
    cleanupRoom();
  }
  intentionalLeave = false;
  if (!isRejoin) rejoinAttempts = 0;
  vset({ channelId, state: isRejoin ? 'reconnecting' : 'connecting', error: null });
  try {
    const t = await api<{ url: string; token: string; serverId: string | null; permissions: { speak: boolean; video: boolean } }>('POST', `/voice/${channelId}/join`);
    if (vget().channelId !== channelId) return; // user switched meanwhile
    const prefs = getPrefs();
    LK = await loadLiveKit();
    if (vget().channelId !== channelId) return;
    const r = new LK.Room({
      // pixelDensity 'screen': request layers for the real (HiDPI) pixel size of each tile → sharper video
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      webAudioMix: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        noiseSuppression: prefs.noiseSuppression,
        echoCancellation: prefs.echoCancellation,
        autoGainControl: prefs.autoGainControl,
        deviceId: prefs.inputDeviceId !== 'default' ? prefs.inputDeviceId : undefined,
      },
      audioOutput: prefs.outputDeviceId !== 'default' ? { deviceId: prefs.outputDeviceId } : undefined,
      videoCaptureDefaults: { resolution: LK.VideoPresets.h720.resolution },
      publishDefaults: {
        simulcast: true,
        dtx: true,
        red: true,
        videoCodec: 'vp8',
        audioPreset: LK.AudioPresets.musicHighQuality, // 64 kbps Opus: clearer voices than the 32 kbps speech default
        videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 },
        videoSimulcastLayers: [LK.VideoPresets.h180, LK.VideoPresets.h360],
      },
    });
    room = r;
    attachRoomEvents(r);
    await r.connect(t.url, t.token, { autoSubscribe: true });
    rejoinAttempts = 0;
    // tell the call which app version I run (old versions don't, so others can warn: "app desatualizado")
    void r.localParticipant.setAttributes({ app: appVersion(), client: desktop ? 'desktop' : 'web' }).catch(() => {});
    vset({ state: 'connected', serverId: t.serverId, canSpeak: t.permissions.speak, canVideo: t.permissions.video, connectedAt: isRejoin ? (vget().connectedAt ?? Date.now()) : Date.now() });
    for (const p of r.remoteParticipants.values()) applyRemoteAudio(p);
    await r.startAudio().catch(() => {});
    await syncMic();
    publishSelfState();
    playSound('join');
    bump();
    statsTimer = setInterval(() => void samplePing(), 3000);
  } catch (err) {
    cleanupRoom();
    const msg = (err as Error)?.message ?? 'Falha ao conectar';
    vset({ state: 'failed', error: msg });
    if (!isRejoin) {
      vset({ channelId: null });
      toast(`Não foi possível entrar no canal de voz: ${msg}`, 'error');
    } else if (rejoinAttempts < 5) {
      rejoinAttempts++;
      setTimeout(() => void joinVoice(channelId, true), Math.min(8000, 1000 * 2 ** rejoinAttempts));
    }
  }
}

async function samplePing() {
  const pc = (room as any)?.engine?.pcManager?.publisher?.getStats ? (room as any).engine.pcManager.publisher : (room as any)?.engine?.pcManager?.subscriber;
  try {
    const stats: RTCStatsReport | undefined = await pc?.getStats();
    let rtt: number | null = null;
    stats?.forEach((s: any) => {
      if (s.type === 'candidate-pair' && s.nominated && typeof s.currentRoundTripTime === 'number') rtt = Math.round(s.currentRoundTripTime * 1000);
    });
    vset({ pingMs: rtt });
  } catch {
    /* ignore */
  }
}

export async function leaveVoice() {
  intentionalLeave = true;
  const had = !!room;
  await room?.disconnect();
  disposeScreenGuard();
  cleanupRoom();
  vset({ channelId: null, serverId: null, state: 'idle', error: null, connectedAt: null, screenSince: null });
  if (had) playSound('leave');
}

export async function toggleMute() {
  const s = vget();
  if (s.selfDeaf) {
    vset({ selfDeaf: false, selfMute: false });
    for (const p of room?.remoteParticipants.values() ?? []) applyRemoteAudio(p);
  } else vset({ selfMute: !s.selfMute });
  playSound(vget().selfMute ? 'mute' : 'unmute');
  setPending('mic', true);
  try {
    await syncMic();
  } finally {
    setPending('mic', false);
  }
  publishSelfState();
}

export async function toggleDeaf() {
  const deaf = !vget().selfDeaf;
  vset({ selfDeaf: deaf, ...(deaf ? {} : {}) });
  playSound(deaf ? 'deafen' : 'unmute');
  for (const p of room?.remoteParticipants.values() ?? []) applyRemoteAudio(p);
  await syncMic();
  publishSelfState();
}

export async function setPtt(active: boolean) {
  if (getPrefs().voiceMode !== 'ptt' || vget().pttActive === active) return;
  vset({ pttActive: active });
  if (!room) return;
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (active && pub?.track && !vget().selfMute && !vget().selfDeaf) {
    await pub.track.unmute();
  } else if (!active && pub?.track) {
    setTimeout(() => {
      if (!vget().pttActive) void pub.track?.mute();
    }, getPrefs().pttReleaseDelay);
  } else {
    await syncMic();
  }
  publishSelfState();
}

export async function onVoiceModeChanged() {
  await syncMic();
  publishSelfState();
}

export async function toggleCamera() {
  if (!room) return;
  const on = !vget().camera;
  if (vget().pending.cam) return;
  setPending('cam', true);
  try {
    const p = getPrefs();
    await room.localParticipant.setCameraEnabled(on, {
      deviceId: p.videoDeviceId || undefined,
      resolution: LK.VideoPresets.h720.resolution,
    });
    vset({ camera: on });
  } catch (err) {
    const name = (err as Error)?.name;
    toast(name === 'NotAllowedError' ? 'Permissão de câmera negada.' : name === 'NotFoundError' ? 'Nenhuma câmera encontrada.' : `Falha na câmera: ${(err as Error).message}`, 'error');
    vset({ camera: false });
  } finally {
    setPending('cam', false);
  }
  publishSelfState();
}

export async function switchCamera() {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  if (cams.length < 2 || !room) return;
  const cur = getPrefs().videoDeviceId || cams[0]!.deviceId;
  const next = cams[(cams.findIndex((c) => c.deviceId === cur) + 1) % cams.length]!;
  setPrefs({ videoDeviceId: next.deviceId });
  await room.switchActiveDevice('videoinput', next.deviceId);
}

/**
 * Screen share presets. Bitrates are generous on purpose: screen content (text, HUDs, fast games)
 * pixelates quickly when starved. A single full-quality layer is sent (no simulcast): it halves
 * the encoding work on the streamer's PC and nobody gets stuck on a low-FPS layer.
 */
export const STREAM_PRESETS = {
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 4_000_000 },
  '720p60': { width: 1280, height: 720, frameRate: 60, maxBitrate: 6_500_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 8_000_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 12_000_000 },
  '1440p30': { width: 2560, height: 1440, frameRate: 30, maxBitrate: 12_000_000 },
  '1440p60': { width: 2560, height: 1440, frameRate: 60, maxBitrate: 18_000_000 },
  // 120 FPS: needs a 120 Hz+ monitor (the capturer can't deliver more frames than the screen draws) and a GPU encoder
  '720p120': { width: 1280, height: 720, frameRate: 120, maxBitrate: 10_000_000 },
  '1080p120': { width: 1920, height: 1080, frameRate: 120, maxBitrate: 18_000_000 },
  '1440p120': { width: 2560, height: 1440, frameRate: 120, maxBitrate: 26_000_000 },
} as const;
/** Upload of the voice server (measured on the KingHost VPS: ~81 Mbit/s). Every viewer receives its own copy. */
export const SERVER_UPLINK_MBPS = 80;
export type StreamQuality = keyof typeof STREAM_PRESETS;

/**
 * Encoder strategy: ALWAYS H.264 for screen shares.
 * - Chromium/Electron run it on the GPU's hardware encoder (NVENC/AMF/QuickSync) when available, so the game keeps its FPS.
 * - H.264 has no temporal layers here, so the server can't silently cut a 60 FPS stream down to 15/30 FPS for a viewer
 *   (that's what VP9's L1T3 allowed — and what "540p · 15 FPS" looked like).
 * - "Texto e código" keeps the resolution (letters stay sharp); games/video and 60/120 FPS keep the frame rate.
 */
function encoderPlan(preset: (typeof STREAM_PRESETS)[StreamQuality], motion: boolean) {
  return {
    videoCodec: 'h264' as const,
    scalabilityMode: undefined,
    degradationPreference: !motion && preset.frameRate <= 30 ? ('maintain-resolution' as const) : ('maintain-framerate' as const),
  };
}

/** Browser: getDisplayMedia shows the native picker. Desktop: `sourceId` was pre-selected through the bridge. */
export async function startScreenShare(opts: { quality: StreamQuality; audio: boolean; desktopSourceId?: string; contentHint?: 'motion' | 'detail'; lite?: boolean }) {
  if (!room) return;
  // Switching source/quality while live: stop the current stream first, then start the new one.
  if (vget().screen) await room.localParticipant.setScreenShareEnabled(false);
  const preset = STREAM_PRESETS[opts.quality] ?? STREAM_PRESETS['1080p60'];
  const motion = opts.contentHint === 'motion';
  if (desktop && opts.desktopSourceId) await desktop.selectScreenSource(opts.desktopSourceId, opts.audio);
  const capture: ScreenShareCaptureOptions = {
    // restrictOwnAudio: the PC sound must NOT carry Aldetes's own playback (the call's voices) — no echo for viewers.
    // Electron ≥ 43.4 maps it to Windows process loopback excluding our process; Chrome does the same for tabs/screens.
    audio: opts.audio ? ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true } as AudioCaptureOptions) : false,
    resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
    contentHint: motion ? 'motion' : 'detail',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: opts.audio ? 'include' : 'exclude',
    suppressLocalAudioPlayback: true,
  };
  try {
    const plan = encoderPlan(preset, motion);
    // Optional light version (streamer's choice): one extra layer at the SAME frame rate, so viewers on weak
    // connections (or thumbnails) can drop resolution without dropping to a low-FPS layer. Costs some encoder work.
    const lite = !!opts.lite && preset.height > 540;
    const liteFps = Math.min(60, preset.frameRate);
    const liteLayer = preset.height > 720 ? new LK.VideoPreset(1280, 720, Math.round(preset.maxBitrate * 0.3), liteFps) : new LK.VideoPreset(960, 540, Math.round(preset.maxBitrate * 0.35), liteFps);
    await room.localParticipant.setScreenShareEnabled(true, capture, {
      screenShareEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate, priority: 'high' },
      screenShareSimulcastLayers: lite ? [liteLayer] : [],
      simulcast: lite,
      videoCodec: plan.videoCodec,
      scalabilityMode: plan.scalabilityMode,
      backupCodec: { codec: 'vp8' },
      degradationPreference: plan.degradationPreference,
    });
    vset({ screen: true, screenSince: Date.now() });
    setPrefs({ streamQuality: opts.quality, streamLite: !!opts.lite });
    desktop?.setStreaming?.(true); // desktop: raise the app's process priority while live
    setExternalLoad(true); // UltraMotion: no decorative loops while encoding a stream
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const mst = pub?.track?.mediaStreamTrack as MediaStreamTrack | undefined;
    // Ask the capturer explicitly for the full frame rate (an "ideal" alone may be served at the 30 FPS default).
    await mst
      ?.applyConstraints({
        width: { ideal: preset.width, max: preset.width },
        height: { ideal: preset.height, max: preset.height },
        frameRate: { ideal: preset.frameRate, max: preset.frameRate },
      })
      .catch(() => {});
    const settings = mst?.getSettings();
    if (settings?.height) vset({ screenInfo: `${settings.height}p · ${Math.round(settings.frameRate ?? preset.frameRate)} FPS` });
    if (settings && (settings.height ?? 0) < preset.height - 10) {
      toast(`Transmitindo em ${settings.width}x${settings.height} — é a resolução da tela/janela escolhida.`);
    }
    startStreamStats(preset.frameRate);
    const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    const hasAudio = !!audioPub;
    // Is the PC sound really isolated from the call? (the browser reports the applied constraint)
    const aSet = (audioPub?.track?.mediaStreamTrack?.getSettings?.() ?? {}) as MediaTrackSettings & { restrictOwnAudio?: boolean };
    // Only "confirmed" when the capture reports the restriction AND (on the desktop app) Windows supports process
    // loopback exclusion. Otherwise the echo guard ducks the PC sound while someone in the call speaks; it also
    // detects an echo that slips through anyway.
    const confirmed = aSet.restrictOwnAudio === true && (desktop ? desktop.ownAudioExcluded === true : true);
    vset({ screenAudioIsolated: hasAudio ? confirmed : null, screenAudioGuard: null });
    disposeScreenGuard();
    if (audioPub) disposeGuard = guardScreenAudio(room, audioPub, confirmed, (g) => vset({ screenAudioGuard: g }));
    if (opts.audio && !hasAudio) toast('O sistema/navegador não forneceu áudio para esta fonte; transmitindo apenas vídeo.');
  } catch (err) {
    const name = (err as Error)?.name;
    if (name !== 'NotAllowedError' && name !== 'AbortError') toast(`Falha ao compartilhar a tela: ${(err as Error).message}`, 'error');
    vset({ screen: false });
    desktop?.setStreaming?.(false);
  }
  publishSelfState();
}

/** Keep the stream going but stop sending the PC sound (safe fallback when it may echo the call). */
let disposeGuard: (() => void) | null = null;
function disposeScreenGuard() {
  disposeGuard?.();
  disposeGuard = null;
}

export async function stopScreenAudio() {
  disposeScreenGuard();
  const pub = room?.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
  if (pub?.track) await room!.localParticipant.unpublishTrack(pub.track as never, true);
  vset({ screenAudioIsolated: null });
}

export async function stopScreenShare() {
  await room?.localParticipant.setScreenShareEnabled(false);
  disposeScreenGuard();
  stopStreamStats();
  vset({ screen: false, screenInfo: null, screenSince: null, screenAudioIsolated: null });
  publishSelfState();
}

// ---------- live encoder stats for the streamer ----------
let streamStatsTimer: ReturnType<typeof setInterval> | null = null;
function stopStreamStats() {
  if (streamStatsTimer) clearInterval(streamStatsTimer);
  streamStatsTimer = null;
  if (vget().screenStats) vset({ screenStats: null });
  desktop?.setStreaming?.(false);
  setExternalLoad(false);
}
function startStreamStats(targetFps: number) {
  if (streamStatsTimer) clearInterval(streamStatsTimer);
  let last: { bytes: number; t: number } | null = null;
  streamStatsTimer = setInterval(async () => {
    const pub = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const sender = (pub?.track as { sender?: RTCRtpSender } | undefined)?.sender;
    if (!sender) return;
    try {
      const report = await sender.getStats();
      let out: any = null;
      let source: any = null;
      const codecs = new Map<string, string>();
      report.forEach((r: any) => {
        if (r.type === 'media-source' && r.kind === 'video') source = r;
        if (r.type === 'codec') codecs.set(r.id, String(r.mimeType ?? '').replace('video/', ''));
        // with several encodings (backup codec) keep the one actually sending the most
        if (r.type === 'outbound-rtp' && r.kind === 'video' && (!out || (r.bytesSent ?? 0) > (out.bytesSent ?? 0))) out = r;
      });
      if (!out) return;
      const t = out.timestamp as number;
      const mbps = last && t > last.t ? ((out.bytesSent - last.bytes) * 8) / ((t - last.t) * 1000) : 0;
      last = { bytes: out.bytesSent, t };
      const reason = out.qualityLimitationReason as string | undefined;
      vset({
        screenStats: {
          width: out.frameWidth ?? 0,
          height: out.frameHeight ?? 0,
          fps: Math.round(out.framesPerSecond ?? 0),
          sourceFps: Math.round(source?.framesPerSecond ?? 0),
          targetFps,
          mbps: Math.round(mbps * 10) / 10,
          limit: reason === 'cpu' ? 'cpu' : reason === 'bandwidth' ? 'bandwidth' : reason && reason !== 'none' ? 'other' : 'none',
          hardware: typeof out.powerEfficientEncoder === 'boolean' ? out.powerEfficientEncoder : null,
          encoder: out.encoderImplementation ?? null,
          codec: codecs.get(out.codecId) ?? null,
        },
      });
    } catch {
      /* stats are best-effort */
    }
  }, 2000);
}

export function setUserVolume(userId: string, v: number) {
  setPrefs({ userVolumes: { ...getPrefs().userVolumes, [userId]: v } });
  const p = room?.remoteParticipants.get(userId);
  if (p) applyRemoteAudio(p);
}
export function setLocalMute(userId: string, muted: boolean) {
  setPrefs({ localMutes: { ...getPrefs().localMutes, [userId]: muted } });
  const p = room?.remoteParticipants.get(userId);
  if (p) applyRemoteAudio(p);
}

// ---------- headset/USB swaps during a call ----------
// The chosen device vanished → fall back to the system default WITH a notice; it came back → return to it.
const fellBack: Record<'audioinput' | 'audiooutput', boolean> = { audioinput: false, audiooutput: false };
let deviceWatch = false;
async function onDeviceChange() {
  if (!room) return;
  const list = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const p = getPrefs();
  const kinds: Array<['audioinput' | 'audiooutput', string, string, string]> = [
    ['audioinput', p.inputDeviceId, p.inputDeviceLabel, 'microfone'],
    ['audiooutput', p.outputDeviceId, p.outputDeviceLabel, 'saída de áudio'],
  ];
  for (const [kind, id, label, what] of kinds) {
    if (!id || id === 'default') continue;
    const present = list.some((d) => d.kind === kind && d.deviceId === id);
    if (!present && !fellBack[kind]) {
      fellBack[kind] = true;
      await room.switchActiveDevice(kind, 'default').catch(() => {});
      toast(`${label || `O ${what} escolhido`} foi desconectado. Usando o ${what} padrão do sistema.`);
    } else if (present && fellBack[kind]) {
      fellBack[kind] = false;
      await room.switchActiveDevice(kind, id).catch(() => {});
      toast(`${label || `O ${what}`} voltou — usando ele de novo.`);
    }
  }
}
export function watchDevices() {
  if (deviceWatch || !navigator.mediaDevices?.addEventListener) return;
  deviceWatch = true;
  navigator.mediaDevices.addEventListener('devicechange', () => void onDeviceChange());
}

export async function applyDevicePrefs() {
  fellBack.audioinput = fellBack.audiooutput = false;
  if (!room) return;
  const p = getPrefs();
  await room.switchActiveDevice('audioinput', p.inputDeviceId || 'default').catch(() => {});
  await room.switchActiveDevice('audiooutput', p.outputDeviceId || 'default').catch(() => {});
}

/** Restart mic track to apply processing constraint changes (noise suppression etc). */
export async function restartMic() {
  if (!room) return;
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (!pub?.track) return;
  const p = getPrefs();
  await (pub.track as any).restartTrack?.({
    deviceId: p.inputDeviceId !== 'default' ? p.inputDeviceId : undefined,
    noiseSuppression: p.noiseSuppression,
    echoCancellation: p.echoCancellation,
    autoGainControl: p.autoGainControl,
  });
}

export interface Tile {
  key: string;
  identity: string;
  participant: Participant;
  source: Track.Source;
  isLocal: boolean;
}

export function listTiles(): Tile[] {
  if (!room) return [];
  const tiles: Tile[] = [];
  const parts: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  for (const p of parts) {
    const isLocal = p === room.localParticipant;
    const screen = p.getTrackPublication(Track.Source.ScreenShare);
    if (screen && !screen.isMuted) tiles.push({ key: `${p.identity}:${Track.Source.ScreenShare}`, identity: p.identity, participant: p, source: Track.Source.ScreenShare, isLocal });
    tiles.push({ key: `${p.identity}:${Track.Source.Camera}`, identity: p.identity, participant: p, source: Track.Source.Camera, isLocal });
  }
  return tiles;
}

export { ConnectionQuality, Track };

/** Viewer side: stop/resume receiving someone's stream (saves bandwidth), and its audio volume. */
export function setWatching(identity: string, watch: boolean) {
  const p = room?.remoteParticipants.get(identity);
  p?.getTrackPublication(Track.Source.ScreenShare)?.setSubscribed(watch);
  p?.getTrackPublication(Track.Source.ScreenShareAudio)?.setSubscribed(watch);
  bump();
}
export function setStreamVolume(identity: string, v: number) {
  room?.remoteParticipants.get(identity)?.setVolume(v, Track.Source.ScreenShareAudio);
  setPrefs({ streamVolumes: { ...getPrefs().streamVolumes, [identity]: Math.max(0, Math.min(2, v)) } });
}
/**
 * MultiView: a minimized/hidden tile stops receiving the VIDEO only (bandwidth + decoding saved);
 * the stream's audio keeps playing. Restoring subscribes again — the room and other tracks are untouched.
 */
export function setVideoPaused(identity: string, paused: boolean) {
  room?.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare)?.setSubscribed(!paused);
  bump();
}
export function focusStream(identity: string) {
  setWatching(identity, true);
  // the stream in focus always asks for the best version (Auto never picks a light copy for the big tile)
  if (vget().viewQuality[identity] !== 'low') room?.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare)?.setVideoQuality(LK.VideoQuality.HIGH);
  vset({ focused: `${identity}:${Track.Source.ScreenShare}` });
}

// ---------- live reactions (ephemeral, synced through the LiveKit data channel) ----------
const REACTION_TTL = 2400;
const seenReactions = new Map<string, number>(); // id → time (dedupe, also across reconnects)
const recvLog = new Map<string, number[]>(); // per-sender timestamps (abuse limit on the receiving side)
let sendLog: number[] = [];

function showReaction(r: LiveReaction) {
  vset((s) => ({ reactions: [...s.reactions.slice(-11), r] }));
  setTimeout(() => vset((s) => ({ reactions: s.reactions.filter((x) => x.id !== r.id) })), REACTION_TTL);
}

function onReactionData(payload: Uint8Array, from: string) {
  try {
    const msg = JSON.parse(new TextDecoder().decode(payload)) as { id?: unknown; e?: unknown };
    const id = typeof msg.id === 'string' ? msg.id.slice(0, 40) : null;
    const emoji = typeof msg.e === 'string' ? msg.e : null;
    if (!id || !emoji || !(REACTIONS as readonly string[]).includes(emoji)) return;
    const now = Date.now();
    if (seenReactions.has(id)) return;
    seenReactions.set(id, now);
    if (seenReactions.size > 300) for (const [k, t] of seenReactions) if (now - t > 60_000) seenReactions.delete(k);
    const log = (recvLog.get(from) ?? []).filter((t) => now - t < 3000);
    if (log.length >= 6) return; // someone spamming: drop
    log.push(now);
    recvLog.set(from, log);
    if (!getPrefs().reactionsEnabled) return;
    showReaction({ id, from, emoji, at: now });
  } catch {
    /* malformed: ignore */
  }
}

/** Send a reaction to everyone in the call. Returns false when the cooldown blocks it. */
export async function sendReaction(emoji: string): Promise<boolean> {
  if (!room || room.state !== ConnectionState.Connected || !(REACTIONS as readonly string[]).includes(emoji)) return false;
  const now = Date.now();
  sendLog = sendLog.filter((t) => now - t < 4000);
  if (sendLog.length >= 5 || (sendLog.length && now - sendLog[sendLog.length - 1]! < 350)) return false;
  sendLog.push(now);
  const id = `${room.localParticipant.identity}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  seenReactions.set(id, now);
  showReaction({ id, from: room.localParticipant.identity, emoji, at: now });
  try {
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ id, e: emoji })), { reliable: true, topic: 'reaction' });
  } catch {
    /* the local one already showed; others just miss it */
  }
  return true;
}

// ---------- viewer controls ----------
export function setTileFit(key: string, fit: 'contain' | 'cover') {
  vset((s) => ({ fit: { ...s.fit, [key]: fit } }));
}
/** "Auto" = best the network allows; "Leve" = cap to the light layer (only exists if the streamer offers it). */
export function setViewQuality(identity: string, q: 'auto' | 'max' | 'low') {
  const pub = room?.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare);
  // setVideoQuality also clears explicit dimensions → back to adaptive sizing
  pub?.setVideoQuality(q === 'low' ? LK.VideoQuality.LOW : LK.VideoQuality.HIGH);
  // "Máxima": ask for the top layer regardless of the tile's size on screen
  if (q === 'max') pub?.setVideoDimensions({ width: 3840, height: 2160 });
  vset((s) => ({ viewQuality: { ...s.viewQuality, [identity]: q } }));
}
/** Whether a remote stream has more than one quality layer to choose from. */
export function streamHasLayers(identity: string) {
  const pub = room?.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare);
  return (pub?.trackInfo?.layers?.length ?? 0) > 1;
}
