// Original UI sounds synthesized with WebAudio (no bundled audio assets).
let ctx: AudioContext | null = null;
function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freqs: number[], dur = 0.09, gap = 0.07, type: OscillatorType = 'sine', vol = 0.08) {
  try {
    const a = ac();
    freqs.forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = f;
      const t = a.currentTime + i * gap;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  } catch {
    /* audio unavailable */
  }
}

export type SoundName = 'message' | 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'ring';

export function playSound(name: SoundName) {
  switch (name) {
    case 'message':
      return tone([880, 1320], 0.12, 0.08);
    case 'join':
      return tone([523, 784], 0.14, 0.09, 'triangle');
    case 'leave':
      return tone([784, 523], 0.14, 0.09, 'triangle');
    case 'mute':
      return tone([440], 0.08, 0, 'square', 0.03);
    case 'unmute':
      return tone([660], 0.08, 0, 'square', 0.03);
    case 'deafen':
      return tone([392, 330], 0.08, 0.06, 'square', 0.03);
    case 'ring':
      return tone([660, 880, 660, 880], 0.18, 0.2, 'sine', 0.06);
  }
}
