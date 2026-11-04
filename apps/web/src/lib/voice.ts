import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  ConnectionQuality,
  DisconnectReason,
  VideoPresets,
  VideoPreset,
  AudioPresets,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type ScreenShareCaptureOptions,
} from 'livekit-client';
import { api } from './api';
import { emit } from './gateway';
import { getPrefs, setPrefs } from './prefs';
import { playSound } from './sounds';
import { desktop } from './desktop';
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
}));
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
  p.setVolume(vol, Track.Source.ScreenShareAudio);
}

function attachRoomEvents(r: Room) {
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
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
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      bump();
    })
    .on(RoomEvent.ParticipantConnected, (p) => {
      playSound('join');
      applyRemoteAudio(p);
      bump();
    })
    .on(RoomEvent.ParticipantDisconnected, (p) => {
      playSound('leave');
      if (vget().focused?.startsWith(p.identity + ':')) vset({ focused: null });
      bump();
    })
    .on(RoomEvent.TrackPublished, bump)
    .on(RoomEvent.TrackUnpublished, (pub, p) => {
      if (vget().focused === `${p.identity}:${pub.source}`) vset({ focused: null });
      bump();
    })
    .on(RoomEvent.TrackMuted, bump)
    .on(RoomEvent.TrackUnmuted, bump)
    .on(RoomEvent.LocalTrackPublished, bump)
    .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.ScreenShare) {
        vset({ screen: false });
        publishSelfState();
      }
      if (pub.source === Track.Source.Camera) {
        vset({ camera: false });
        publishSelfState();
      }
      bump();
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      vset({ speaking: Object.fromEntries(speakers.map((s) => [s.identity, true])) });
    })
    .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
      vset((s) => ({ quality: { ...s.quality, [p.identity]: q } }));
    })
    .on(RoomEvent.Reconnecting, () => vset({ state: 'reconnecting' }))
    .on(RoomEvent.Reconnected, () => {
      vset({ state: 'connected' });
      publishSelfState();
    })
    .on(RoomEvent.ParticipantPermissionsChanged, () => {
      const perms = r.localParticipant.permissions;
      const canMic = !!perms?.canPublishSources?.includes(2 /* MICROPHONE */) || (!!perms?.canPublish && !perms?.canPublishSources?.length);
      vset({ canSpeak: canMic });
      if (perms && !perms.canSubscribe) toast('Você foi ensurdecido por um moderador.');
      if (!canMic) toast('Você foi silenciado por um moderador.');
      bump();
    })
    .on(RoomEvent.MediaDevicesError, (e: Error) => toast(micError(e), 'error'))
    .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      cleanupRoom();
      if (intentionalLeave) return;
      const cid = vget().channelId;
      // Kicked / moved / room deleted: don't auto-rejoin
      if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.DUPLICATE_IDENTITY) {
        vset({ state: 'idle', channelId: null, serverId: null });
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) toast('Você foi desconectado do canal de voz.');
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
  vset({ speaking: {}, quality: {}, camera: false, screen: false, focused: null, pingMs: null, screenSince: null });
  bump();
}

export async function joinVoice(channelId: string, isRejoin = false) {
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
    const r = new Room({
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
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      publishDefaults: {
        simulcast: true,
        dtx: true,
        red: true,
        videoCodec: 'vp8',
        audioPreset: AudioPresets.musicHighQuality, // 64 kbps Opus: clearer voices than the 32 kbps speech default
        videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 },
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      },
    });
    room = r;
    attachRoomEvents(r);
    await r.connect(t.url, t.token, { autoSubscribe: true });
    rejoinAttempts = 0;
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
  await syncMic();
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
  try {
    const p = getPrefs();
    await room.localParticipant.setCameraEnabled(on, {
      deviceId: p.videoDeviceId || undefined,
      resolution: VideoPresets.h720.resolution,
    });
    vset({ camera: on });
  } catch (err) {
    const name = (err as Error)?.name;
    toast(name === 'NotAllowedError' ? 'Permissão de câmera negada.' : name === 'NotFoundError' ? 'Nenhuma câmera encontrada.' : `Falha na câmera: ${(err as Error).message}`, 'error');
    vset({ camera: false });
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
 * pixelates quickly when starved. Viewers on weaker connections automatically get the lower layer.
 */
export const STREAM_PRESETS = {
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 3_500_000 },
  '720p60': { width: 1280, height: 720, frameRate: 60, maxBitrate: 5_500_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 6_500_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 10_000_000 },
} as const;

/** Browser: getDisplayMedia shows the native picker. Desktop: `sourceId` was pre-selected through the bridge. */
export async function startScreenShare(opts: { quality: keyof typeof STREAM_PRESETS; audio: boolean; desktopSourceId?: string; contentHint?: 'motion' | 'detail' }) {
  if (!room) return;
  // Switching source/quality while live: stop the current stream first, then start the new one.
  if (vget().screen) await room.localParticipant.setScreenShareEnabled(false);
  const preset = STREAM_PRESETS[opts.quality];
  if (desktop && opts.desktopSourceId) await desktop.selectScreenSource(opts.desktopSourceId, opts.audio);
  const capture: ScreenShareCaptureOptions = {
    audio: opts.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
    contentHint: opts.contentHint ?? 'detail',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: opts.audio ? 'include' : 'exclude',
    suppressLocalAudioPlayback: true,
  };
  try {
    const motion = opts.contentHint === 'motion';
    await room.localParticipant.setScreenShareEnabled(true, capture, {
      screenShareEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate, priority: 'high' },
      // One lower layer (720p/15) for viewers with weak connections; everyone else gets full quality.
      screenShareSimulcastLayers: [new VideoPreset(1280, 720, 1_500_000, 15, 'medium')],
      // Text/detail: VP9 is sharper per bit. Games/motion at high FPS: H.264 usually runs on the GPU's hardware encoder.
      videoCodec: motion ? 'h264' : 'vp9',
      backupCodec: { codec: 'vp8' },
      simulcast: true,
      // Never drop resolution for text; for motion, balance FPS and sharpness instead of blurring.
      degradationPreference: motion ? 'balanced' : 'maintain-resolution',
    });
    vset({ screen: true, screenSince: Date.now() });
    setPrefs({ streamQuality: opts.quality });
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const settings = (pub?.track?.mediaStreamTrack as MediaStreamTrack | undefined)?.getSettings();
    if (settings?.height) vset({ screenInfo: `${settings.height}p · ${Math.round(settings.frameRate ?? preset.frameRate)} FPS` });
    if (settings && (settings.height ?? 0) < preset.height - 10) {
      toast(`Transmitindo em ${settings.width}x${settings.height}@${Math.round(settings.frameRate ?? 0)} (limitado pela fonte capturada).`);
    }
    const hasAudio = !!room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (opts.audio && !hasAudio) toast('O sistema/navegador não forneceu áudio para esta fonte; transmitindo apenas vídeo.');
  } catch (err) {
    const name = (err as Error)?.name;
    if (name !== 'NotAllowedError' && name !== 'AbortError') toast(`Falha ao compartilhar a tela: ${(err as Error).message}`, 'error');
    vset({ screen: false });
  }
  publishSelfState();
}

export async function stopScreenShare() {
  await room?.localParticipant.setScreenShareEnabled(false);
  vset({ screen: false, screenInfo: null, screenSince: null });
  publishSelfState();
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

export async function applyDevicePrefs() {
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
}
export function focusStream(identity: string) {
  setWatching(identity, true);
  vset({ focused: `${identity}:${Track.Source.ScreenShare}` });
}
