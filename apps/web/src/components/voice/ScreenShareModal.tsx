import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Modal } from '../common/overlay';
import { desktop, type DesktopSource } from '@/lib/desktop';
import { startScreenShare, STREAM_PRESETS } from '@/lib/voice';
import { usePrefs } from '@/lib/prefs';

const QUALITY_LABEL: Record<keyof typeof STREAM_PRESETS, string> = {
  '720p30': '720p · 30 FPS',
  '720p60': '720p · 60 FPS',
  '1080p30': '1080p · 30 FPS',
  '1080p60': '1080p · 60 FPS',
};

/** Browser getDisplayMedia can share tab audio (Chromium) and system audio on Windows/ChromeOS only. */
function browserAudioHint(): string {
  const ua = navigator.userAgent;
  const chromium = /Chrome\//.test(ua);
  if (!chromium) return 'Seu navegador não suporta captura de áudio da tela.';
  if (/Windows/.test(ua)) return 'Áudio disponível ao compartilhar uma aba ou a tela inteira.';
  return 'Áudio disponível apenas ao compartilhar uma aba do navegador.';
}

export function ScreenShareModal({ onClose }: { onClose: () => void }) {
  const [quality, setQuality] = useState(usePrefs.getState().streamQuality);
  const [audio, setAudio] = useState(true);
  const [hint, setHint] = useState<'motion' | 'detail'>('motion');
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const screenW = window.screen.width * devicePixelRatio;

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const load = () => desktop!.getScreenSources().then((s) => alive && setSources(s));
    void load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const audioSupported = desktop ? desktop.supportsSystemAudio : /Chrome\//.test(navigator.userAgent);

  const go = async () => {
    setBusy(true);
    await startScreenShare({ quality, audio: audio && audioSupported, desktopSourceId: selected ?? undefined, contentHint: hint });
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      title="Compartilhar tela"
      wide={!!desktop}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={busy || (!!desktop && !selected)} onClick={go}>
            {desktop ? 'Transmitir' : 'Escolher o que compartilhar…'}
          </button>
        </>
      }
    >
      {desktop && (
        <>
          <div className="mb-3 flex gap-2">
            {(['screen', 'window'] as const).map((t) => (
              <button key={t} className={clsx('rounded px-3 py-1 text-sm', tab === t ? 'bg-fg/15 text-fg-strong' : 'text-fg-muted hover:bg-fg/10')} onClick={() => setTab(t)}>
                {t === 'screen' ? 'Telas' : 'Aplicativos e janelas'}
              </button>
            ))}
          </div>
          <div className="mb-4 grid max-h-72 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {sources === null && <p className="col-span-3 py-6 text-center text-fg-muted">Carregando fontes…</p>}
            {sources
              ?.filter((s) => s.kind === tab)
              .map((s) => (
                <button key={s.id} onClick={() => setSelected(s.id)} className={clsx('rounded-lg p-1 text-left ring-2', selected === s.id ? 'ring-brand' : 'ring-transparent hover:ring-fg-faint')}>
                  <img src={s.thumbnail} alt="" className="aspect-video w-full rounded bg-black object-contain" />
                  <div className="mt-1 flex items-center gap-1 truncate text-xs text-fg">
                    {s.appIcon && <img src={s.appIcon} alt="" className="h-4 w-4" />}
                    <span className="truncate">{s.name}</span>
                  </div>
                </button>
              ))}
          </div>
        </>
      )}
      <label className="label">Qualidade da transmissão</label>
      <div className="mb-1 grid grid-cols-2 gap-2">
        {(Object.keys(STREAM_PRESETS) as Array<keyof typeof STREAM_PRESETS>).map((q) => {
          const tooBig = STREAM_PRESETS[q].height === 1080 && screenW < 1900 && !desktop;
          return (
            <button key={q} onClick={() => setQuality(q)} className={clsx('rounded border px-3 py-2 text-sm', quality === q ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/10 text-fg-muted hover:border-fg-faint')}>
              {QUALITY_LABEL[q]}
              {tooBig && <span className="block text-[10px] text-fg-faint">sua tela é menor que 1080p</span>}
            </button>
          );
        })}
      </div>
      <p className="mb-4 text-xs text-fg-faint">A resolução e o FPS reais dependem da fonte, do hardware e da rede; o LiveKit reduz a qualidade automaticamente para quem tem conexão pior.</p>
      <label className="label">Otimizar para</label>
      <div className="mb-4 flex gap-2">
        <button className={clsx('flex-1 rounded border px-3 py-2 text-sm', hint === 'motion' ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/10 text-fg-muted')} onClick={() => setHint('motion')}>
          Movimento (jogos, vídeo)
        </button>
        <button className={clsx('flex-1 rounded border px-3 py-2 text-sm', hint === 'detail' ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/10 text-fg-muted')} onClick={() => setHint('detail')}>
          Nitidez (texto, código)
        </button>
      </div>
      <label className={clsx('flex items-center gap-2 text-sm', !audioSupported && 'opacity-50')}>
        <input type="checkbox" className="accent-brand" checked={audio && audioSupported} disabled={!audioSupported} onChange={(e) => setAudio(e.target.checked)} />
        Compartilhar áudio
      </label>
      <p className="mt-1 text-xs text-fg-faint">
        {desktop ? (desktop.supportsSystemAudio ? 'Captura o áudio do sistema (loopback).' : 'Captura de áudio do sistema não é suportada neste sistema operacional pelo Electron.') : browserAudioHint()}
      </p>
    </Modal>
  );
}
