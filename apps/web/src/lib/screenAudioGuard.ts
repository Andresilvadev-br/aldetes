/**
 * Echo guard for the PC sound of a screen share.
 *
 * Problem: the system ("loopback") capture is the whole PC mix, which also contains what Aldetes itself plays — the
 * call's voices. Viewers then hear themselves back inside the stream. Chromium can exclude the app's own process
 * (restrictOwnAudio → Windows process loopback), but that depends on the Windows build and the capture path, and we
 * can't trust it blindly.
 *
 * What this does (deterministic, cheap, no change to bitrate/FPS/resolution/presets):
 *  1. The captured PC sound goes through a GainNode before being sent (the original capture track stays local).
 *  2. Remote voices are measured LOCALLY (analysers on the decoded tracks we are about to play) every 20 ms — the
 *     loopback copy of a voice is captured only after it is rendered, so the gate closes before the echo arrives.
 *  3. Ducking (gain → 0.08 while a remote voice is active, 250 ms hold, smooth release) runs when exclusion isn't
 *     confirmed, or when an echo is DETECTED anyway: the PC-sound envelope correlating with the remote voices'
 *     envelope (Pearson r > 0.55 over 3 s, with real speech in the window).
 * Viewers still hear every voice directly through the call; they only stop hearing it twice.
 */
import { Room, RoomEvent, Track, type LocalTrackPublication, type RemoteTrack } from 'livekit-client';

export type GuardState = 'isolated' | 'ducking' | 'echo-detected';

export function guardScreenAudio(room: Room, pub: LocalTrackPublication, confirmedIsolated: boolean, onState: (s: GuardState) => void): () => void {
  const track = pub.track;
  const orig = track?.mediaStreamTrack;
  if (!track || !orig) return () => {};
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const src = ctx.createMediaStreamSource(new MediaStream([orig]));
  const gain = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  const screenAn = ctx.createAnalyser();
  screenAn.fftSize = 512;
  src.connect(gain).connect(dest);
  src.connect(screenAn);
  let disposed = false;
  void track.replaceTrack(dest.stream.getAudioTracks()[0]!, true).catch(() => {});

  // analysers on the remote microphones (rebuilt when people come and go)
  const voices = new Map<string, { an: AnalyserNode; node: MediaStreamAudioSourceNode }>();
  const sync = () => {
    const seen = new Set<string>();
    for (const p of room.remoteParticipants.values()) {
      const t = p.getTrackPublication(Track.Source.Microphone)?.track as RemoteTrack | undefined;
      const mst = t?.mediaStreamTrack;
      if (!mst || mst.readyState !== 'live') continue;
      seen.add(mst.id);
      if (voices.has(mst.id)) continue;
      const node = ctx.createMediaStreamSource(new MediaStream([mst]));
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      node.connect(an);
      voices.set(mst.id, { an, node });
    }
    for (const [id, v] of voices)
      if (!seen.has(id)) {
        v.node.disconnect();
        voices.delete(id);
      }
  };
  sync();
  const evs = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.ParticipantDisconnected] as const;
  for (const e of evs) room.on(e, sync);

  const buf = new Float32Array(512);
  const rms = (an: AnalyserNode) => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
    return Math.sqrt(s / buf.length);
  };
  const R: number[] = [];
  const S: number[] = [];
  let echo = false;
  let hold = 0;
  let ducked = false;
  let state: GuardState | null = null;
  const setState = (s: GuardState) => s !== state && onState((state = s));
  setState(confirmedIsolated ? 'isolated' : 'ducking');

  const tick = setInterval(() => {
    if (disposed) return;
    if (ctx.state === 'suspended') void ctx.resume();
    let voice = 0;
    for (const v of voices.values()) voice = Math.max(voice, rms(v.an));
    const screen = rms(screenAn);
    R.push(voice);
    S.push(screen);
    if (R.length > 150) (R.shift(), S.shift());
    const active = voice > 0.015;
    hold = active ? 12 : Math.max(0, hold - 1); // 12 × 20 ms = 240 ms hold
    // echo detection (only meaningful while not already ducking)
    if (!echo && confirmedIsolated && R.length === 150 && R.filter((x) => x > 0.015).length > 20) {
      const n = R.length;
      const mr = R.reduce((a, b) => a + b, 0) / n;
      const ms = S.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let dr = 0;
      let ds = 0;
      for (let i = 0; i < n; i++) {
        num += (R[i]! - mr) * (S[i]! - ms);
        dr += (R[i]! - mr) ** 2;
        ds += (S[i]! - ms) ** 2;
      }
      const r = num / Math.sqrt(dr * ds || 1);
      if (r > 0.55) {
        echo = true;
        setState('echo-detected');
      }
    }
    const shouldDuck = (!confirmedIsolated || echo) && hold > 0;
    if (shouldDuck !== ducked) {
      ducked = shouldDuck;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(ducked ? 0.08 : 1, ctx.currentTime, ducked ? 0.008 : 0.12);
    }
  }, 20);

  return () => {
    if (disposed) return;
    disposed = true;
    clearInterval(tick);
    for (const e of evs) room.off(e, sync);
    for (const v of voices.values()) v.node.disconnect();
    voices.clear();
    src.disconnect();
    orig.stop(); // the real capture (LiveKit only knows and stops the processed track)
    void ctx.close();
  };
}
