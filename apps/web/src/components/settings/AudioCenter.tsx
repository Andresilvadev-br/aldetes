import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { usePrefs, setPrefs } from '@/lib/prefs';
import { applyDevicePrefs, useVoice } from '@/lib/voice';
import { Icon } from '../common/Icon';
import { toast, toastError } from '../common/overlay';

/** Live list of media devices (re-reads on plug/unplug). */
export function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, []);
  return devices;
}

type Draft = { input: string; output: string };
const DEFAULT: Draft = { input: 'default', output: 'default' };
const canPickOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/**
 * Audio device center: explicit, persistent choice of microphone and output, a REAL input meter (Web Audio on the
 * chosen mic), mic loopback, a test sound on the chosen output, and Save / Cancel / Restore — nothing changes until
 * "Salvar". A saved device that is unplugged is shown as missing (and calls fall back to the default with a notice).
 */
export function AudioCenter() {
  const p = usePrefs();
  const devices = useDevices();
  const inCall = useVoice((v) => v.state === 'connected');
  const saved: Draft = { input: p.inputDeviceId || 'default', output: p.outputDeviceId || 'default' };
  const [draft, setDraft] = useState<Draft>(saved);
  const dirty = draft.input !== saved.input || draft.output !== saved.output;
  const [testing, setTesting] = useState(false);
  const [hear, setHear] = useState(false);
  const meter = useRef<HTMLDivElement>(null);
  const [peakDb, setPeakDb] = useState<number | null>(null);

  const ins = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const outs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const listed = devices.some((d) => d.label); // labels only after mic permission: before that, we can't judge "missing"
  const missingIn = listed && saved.input !== 'default' && !ins.some((d) => d.deviceId === saved.input);
  const missingOut = listed && saved.output !== 'default' && !outs.some((d) => d.deviceId === saved.output);

  // Mic test on the DRAFT device: level meter (rAF, written straight to the DOM — no re-render per frame) + optional loopback.
  useEffect(() => {
    if (!testing) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let audio: HTMLAudioElement | null = null;
    let peak = -100;
    let lastPeakUi = 0;
    let alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: draft.input !== 'default' ? { exact: draft.input } : undefined, noiseSuppression: p.noiseSuppression, echoCancellation: p.echoCancellation, autoGainControl: p.autoGainControl },
        });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const tick = (t: number) => {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -100;
          peak = Math.max(peak - 0.4, db);
          if (meter.current) meter.current.style.transform = `scaleX(${Math.max(0, Math.min(1, (db + 60) / 60))})`;
          if (t - lastPeakUi > 250) {
            lastPeakUi = t;
            setPeakDb(Math.round(peak));
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        if (hear) {
          audio = new Audio();
          audio.srcObject = stream;
          if (draft.output !== 'default') await (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(draft.output);
          await audio.play();
        }
      } catch (e) {
        toastError(e);
        setTesting(false);
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      audio?.pause();
      if (meter.current) meter.current.style.transform = 'scaleX(0)';
      setPeakDb(null);
    };
  }, [testing, hear, draft.input, draft.output, p.noiseSuppression, p.echoCancellation, p.autoGainControl]);

  /** Short two-note chime on the draft output (generated, no asset). */
  const testOutput = async () => {
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const g = ctx.createGain();
      g.connect(dest);
      [523.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        o.connect(g);
        const t0 = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
        o.start(t0);
        o.stop(t0 + 0.34);
      });
      const el = new Audio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      el.srcObject = dest.stream;
      if (draft.output !== 'default') await el.setSinkId?.(draft.output);
      await el.play();
      setTimeout(() => (el.pause(), void ctx.close()), 800);
    } catch (e) {
      toastError(e);
    }
  };

  const labelOf = (list: MediaDeviceInfo[], id: string) => list.find((d) => d.deviceId === id)?.label ?? '';
  const save = async () => {
    setPrefs({ inputDeviceId: draft.input, outputDeviceId: draft.output, inputDeviceLabel: labelOf(ins, draft.input), outputDeviceLabel: labelOf(outs, draft.output) });
    await applyDevicePrefs();
    toast(inCall ? 'Dispositivos salvos e aplicados na call.' : 'Dispositivos salvos.');
  };

  const select = (kind: 'in' | 'out', value: string, list: MediaDeviceInfo[], missing: boolean, savedLabel: string) => (
    <select className={clsx('input', missing && 'ring-1 ring-warn')} value={value} disabled={kind === 'out' && !canPickOutput} onChange={(e) => setDraft((d) => ({ ...d, [kind === 'in' ? 'input' : 'output']: e.target.value }))} aria-label={kind === 'in' ? 'Microfone' : 'Saída de áudio'}>
      <option value="default">Padrão do sistema</option>
      {missing && value === (kind === 'in' ? saved.input : saved.output) && <option value={value}>{savedLabel || 'Dispositivo salvo'} (desconectado)</option>}
      {list.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `${kind === 'in' ? 'Microfone' : 'Saída'} ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
  );

  return (
    <section className="mb-8 rounded-2xl border border-line/[0.07] bg-line/[0.025] p-4" aria-label="Central de áudio">
      <div className="mb-3 flex items-center gap-3">
        <span className="tile h-10 w-10 bg-emerald-400/15 text-emerald-400">
          <Icon name="mic" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-fg-strong">Central de áudio</div>
          <div className="text-xs text-fg-muted">Escolha o microfone e a saída. Teste antes; só muda quando você salvar.</div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="label">Microfone</div>
          {select('in', draft.input, ins, missingIn, p.inputDeviceLabel)}
          {missingIn && <p className="mt-1 text-xs text-warn">“{p.inputDeviceLabel || 'O microfone salvo'}” está desconectado. As calls usam o padrão do sistema até ele voltar.</p>}
        </div>
        <div>
          <div className="label">Saída de áudio</div>
          {select('out', draft.output, outs, missingOut, p.outputDeviceLabel)}
          {!canPickOutput && <p className="mt-1 text-xs text-fg-faint">Este navegador não permite escolher a saída: usa a do sistema.</p>}
          {missingOut && <p className="mt-1 text-xs text-warn">“{p.outputDeviceLabel || 'A saída salva'}” está desconectada. Usando a do sistema até ela voltar.</p>}
        </div>
      </div>
      {!listed && <p className="mt-2 text-xs text-fg-faint">Os nomes dos dispositivos aparecem depois que você permitir o microfone (clique em “Testar microfone”).</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={testing ? 'btn-secondary' : 'btn-primary'} onClick={() => setTesting((t) => !t)} aria-pressed={testing}>
          <Icon name="mic" size={15} /> {testing ? 'Parar teste' : 'Testar microfone'}
        </button>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="accent-brand" checked={hear} onChange={(e) => setHear(e.target.checked)} /> Ouvir meu microfone
        </label>
        <button className="btn-secondary" onClick={() => void testOutput()} disabled={!canPickOutput && draft.output !== 'default'}>
          <Icon name="volume" size={15} /> Tocar som de teste
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3" aria-live="off">
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-bg-rail" role="meter" aria-label="Nível do microfone" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={peakDb ?? -60}>
          <div ref={meter} className="absolute inset-0 origin-left bg-gradient-to-r from-ok via-ok to-warn" style={{ transform: 'scaleX(0)' }} />
          {/* speaking zone guide: -30 dB … -6 dB */}
          <span className="pointer-events-none absolute inset-y-0 border-l border-white/30" style={{ left: '50%' }} />
          <span className="pointer-events-none absolute inset-y-0 border-l border-white/30" style={{ left: '90%' }} />
        </div>
        <span className="w-24 text-right text-xs tabular-nums text-fg-muted">{peakDb == null ? 'parado' : peakDb <= -55 ? 'sem som' : `${peakDb} dB`}</span>
      </div>
      {testing && peakDb != null && peakDb <= -55 && <p className="mt-1 text-xs text-warn">Nada chegando deste microfone. Confira se ele está ligado/desmutado ou escolha outro.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/[0.06] pt-3">
        <button className="btn-secondary" onClick={() => setDraft(DEFAULT)} disabled={draft.input === 'default' && draft.output === 'default'}>
          Restaurar padrão
        </button>
        <span className="flex-1" />
        {dirty && <span className="text-xs text-fg-muted">Alterações não salvas</span>}
        <button className="btn-secondary" onClick={() => setDraft(saved)} disabled={!dirty}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={() => void save()} disabled={!dirty}>
          Salvar{inCall ? ' e aplicar' : ''}
        </button>
      </div>
    </section>
  );
}
