import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { desktop, type DesktopSource } from '@/lib/desktop';
import { startScreenShare, STREAM_PRESETS, SERVER_UPLINK_MBPS } from '@/lib/voice';
import { usePrefs } from '@/lib/prefs';
import { spring } from '@/lib/motion';
import { Icon, type IconName } from '../common/Icon';
import { Switch, Segmented } from '../settings/SettingsLayout';

type Res = '720p' | '1080p' | '1440p';
type Fps = '30' | '60' | '120';
type Hint = 'motion' | 'detail';

function audioNote(): { ok: boolean; text: string } {
  if (desktop) return desktop.supportsSystemAudio ? { ok: true, text: 'Leva junto o som do PC (jogo, música, vídeo).' } : { ok: false, text: 'Este sistema não permite capturar o som do PC.' };
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua)) return { ok: false, text: 'Este navegador não captura áudio da tela.' };
  return { ok: true, text: /Windows/.test(ua) ? 'Funciona ao compartilhar uma aba ou a tela inteira.' : 'Funciona ao compartilhar uma aba do navegador.' };
}

/** Screen share setup — Ultra Motion: one panel, live previews, physical selection, honest numbers. */
export function ScreenShareModal({ onClose }: { onClose: () => void }) {
  const saved = usePrefs.getState().streamQuality;
  const [res, setRes] = useState<Res>(saved.startsWith('1440') ? '1440p' : saved.startsWith('1080') ? '1080p' : '720p');
  const [fps, setFps] = useState<Fps>(saved.endsWith('120') ? '120' : saved.endsWith('60') ? '60' : '30');
  const [hint, setHint] = useState<Hint>('motion');
  const aNote = audioNote();
  const [audio, setAudio] = useState(aNote.ok);
  const [lite, setLite] = useState(() => usePrefs.getState().streamLite);
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const load = () =>
      desktop!.getScreenSources().then((s) => {
        if (!alive) return;
        setSources(s);
        setSelected((cur) => cur ?? s.find((x) => x.kind === 'screen')?.id ?? s[0]?.id ?? null);
      });
    void load();
    const t = setInterval(load, 2500); // live thumbnails
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const quality = `${res}${fps}` as keyof typeof STREAM_PRESETS;
  const preset = STREAM_PRESETS[quality];
  const mbps = (preset.maxBitrate / 1_000_000).toFixed(preset.maxBitrate % 1_000_000 ? 1 : 0);
  const chosen = sources?.find((s) => s.id === selected);
  const list = sources?.filter((s) => s.kind === tab) ?? [];

  const pickHint = (h: Hint) => {
    setHint(h);
    // sensible defaults: games want FPS, text wants pixels
    if (h === 'motion') setFps('60');
    else {
      setFps('30');
      if (res === '720p') setRes('1080p');
    }
  };

  const go = async () => {
    setBusy(true);
    await startScreenShare({ quality, audio: audio && aNote.ok, desktopSourceId: selected ?? undefined, contentHint: hint, lite });
    setBusy(false);
    onClose();
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal
        aria-label="Compartilhar tela"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.gentle}
        className="haze flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[28px] border border-line/[0.08] bg-bg-side shadow-float"
      >
        {/* header */}
        <div className="flex items-center gap-4 px-7 pb-4 pt-6">
          <span className="grad flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow">
            <Icon name="screen" size={22} />
          </span>
          <div className="flex-1">
            <h2 className="text-[22px] font-extrabold tracking-tight text-fg-strong">Transmitir sua tela</h2>
            <p className="text-sm text-fg-muted">Escolha o que mostrar e como a call vai ver.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-7 pb-2">
          {/* 1. source */}
          <Section n={1} title="O que compartilhar">
            {desktop ? (
              <>
                <div className="mb-3">
                  <Segmented id="share-tab" value={tab} onChange={setTab} options={[['screen', 'Telas'], ['window', 'Janelas e apps']]} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sources === null &&
                    [0, 1, 2].map((i) => <div key={i} className="aspect-video animate-pulse rounded-2xl bg-line/[0.05]" />)}
                  {list.map((s, i) => (
                    <motion.button
                      key={s.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...spring.gentle, delay: Math.min(i, 8) * 0.03 }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelected(s.id)}
                      className="group relative rounded-2xl p-1.5 text-left"
                    >
                      {selected === s.id && (
                        <motion.span layoutId="share-pick" transition={spring.responsive} className="absolute inset-0 rounded-2xl border-2 border-brand bg-brand/10 shadow-glow" />
                      )}
                      <span className="relative block overflow-hidden rounded-xl bg-black">
                        <img src={s.thumbnail} alt="" className="aspect-video w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                        {selected === s.id && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy} className="grad absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-glow">
                            <Icon name="check" size={13} strokeWidth={3} />
                          </motion.span>
                        )}
                      </span>
                      <span className="relative mt-1.5 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-fg">
                        {s.appIcon ? <img src={s.appIcon} alt="" className="h-4 w-4" /> : <Icon name={s.kind === 'screen' ? 'screen' : 'file'} size={14} className="text-fg-muted" />}
                        <span className="truncate">{s.kind === 'screen' && /entire|screen/i.test(s.name) ? 'Tela inteira' : s.name}</span>
                      </span>
                    </motion.button>
                  ))}
                  {sources && !list.length && <p className="col-span-full py-6 text-center text-sm text-fg-muted">Nada para mostrar aqui.</p>}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-line/[0.07] bg-line/[0.03] p-4">
                <span className="tile h-11 w-11 bg-sky-400/15 text-sky-400">
                  <Icon name="globe" size={20} />
                </span>
                <p className="text-sm text-fg-muted">
                  Ao clicar em <b className="text-fg-strong">Começar transmissão</b>, o navegador abre a janela dele para você escolher uma aba, janela ou tela.
                </p>
              </div>
            )}
          </Section>

          {/* 2. optimize */}
          <Section n={2} title="Otimizar para">
            <div className="grid grid-cols-2 gap-3">
              <HintCard active={hint === 'motion'} icon="signal" title="Jogos e vídeos" desc="Mais FPS e movimento suave." onClick={() => pickHint('motion')} />
              <HintCard active={hint === 'detail'} icon="file" title="Texto e código" desc="Letras nítidas, sem borrão." onClick={() => pickHint('detail')} />
            </div>
          </Section>

          {/* 3. quality */}
          <Section n={3} title="Qualidade">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented id="share-res" value={res} onChange={setRes} options={[['720p', '720p'], ['1080p', '1080p Full HD'], ['1440p', '1440p 2K']]} />
              <Segmented id="share-fps" value={fps} onChange={setFps} options={[['30', '30 FPS'], ['60', '60 FPS'], ['120', '120 FPS']]} />
              <span className="ml-auto flex items-center gap-2 rounded-xl border border-line/[0.07] bg-line/[0.03] px-3 py-2 text-xs text-fg-muted">
                <Icon name="upload" size={14} className="text-brand" />
                usa até <b className="tabular-nums text-fg-strong">{mbps} Mbps</b> de upload
              </span>
            </div>
            <p className="mt-2 text-xs text-fg-faint">
              {hint === 'motion' || fps !== '30'
                ? 'Codificado pela placa de vídeo (quando disponível), para não roubar FPS do seu jogo. Se a rede apertar, o FPS é mantido.'
                : 'Codificação focada em nitidez: a resolução nunca cai, mesmo se a rede apertar.'}
              {res === '1440p' && ' 1440p só faz diferença se o seu monitor for 2K ou maior.'}
            </p>
            {fps === '120' && (
              <p className="mt-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
                120 FPS só sai se o seu monitor for de <b>120 Hz ou mais</b> (a captura não pega mais quadros do que a tela desenha) e a placa de vídeo codificar. A barra "ao vivo" mostra o FPS real.
              </p>
            )}
            <p className="mt-2 text-xs text-fg-faint">
              O servidor aguenta cerca de <b className="text-fg">{Math.max(1, Math.floor(SERVER_UPLINK_MBPS / (preset.maxBitrate / 1_000_000)))} pessoas assistindo</b> nessa qualidade ao mesmo tempo.
            </p>
          </Section>

          {/* light version for weak connections (optional: costs some extra encoding) */}
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-line/[0.07] bg-line/[0.03] p-4">
            <span className="tile h-11 w-11 bg-sky-400/15 text-sky-400">
              <Icon name="signal" size={19} />
            </span>
            <div className="flex-1">
              <div className="font-bold text-fg-strong">Versão leve para internet fraca</div>
              <div className="text-sm text-fg-muted">Quem tiver conexão ruim recebe em resolução menor, no mesmo FPS. Usa um pouco mais do seu PC. Deixe desligado se todos têm boa internet.</div>
            </div>
            <Switch checked={lite} onChange={setLite} />
          </div>

          {/* 4. audio */}
          <div className={clsx('mb-5 flex items-center gap-4 rounded-2xl border border-line/[0.07] bg-line/[0.03] p-4', !aNote.ok && 'opacity-60')}>
            <span className="tile h-11 w-11 bg-emerald-400/15 text-emerald-400">
              <Icon name="volume" size={19} />
            </span>
            <div className="flex-1">
              <div className="font-bold text-fg-strong">Compartilhar o som</div>
              <div className="text-sm text-fg-muted">{aNote.text}</div>
            </div>
            <Switch checked={audio && aNote.ok} disabled={!aNote.ok} onChange={setAudio} />
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 border-t border-line/[0.06] bg-line/[0.02] px-7 py-4">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={`${chosen?.id}-${quality}-${audio}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="min-w-0 flex-1 truncate text-sm text-fg-muted">
              <span className="rec-dot mr-2 inline-block h-2 w-2 rounded-full bg-danger align-middle" />
              {desktop ? <b className="text-fg-strong">{chosen ? (chosen.kind === 'screen' ? 'Tela inteira' : chosen.name) : 'Escolha uma fonte'}</b> : <b className="text-fg-strong">Você escolhe no navegador</b>}
              {' · '}
              {res} {fps} FPS{audio && aNote.ok ? ' · com som' : ''}
            </motion.div>
          </AnimatePresence>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <motion.button whileTap={{ scale: 0.96 }} className="btn-primary px-6 py-2.5" disabled={busy || (!!desktop && !selected)} onClick={go}>
            <Icon name="screen" size={17} />
            {busy ? 'Iniciando…' : 'Começar transmissão'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grad flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-white">{n}</span>
        <span className="eyebrow !text-fg-muted">{title}</span>
      </div>
      {children}
    </section>
  );
}

function HintCard({ active, icon, title, desc, onClick }: { active: boolean; icon: IconName; title: string; desc: string; onClick: () => void }) {
  return (
    <motion.button
      data-glow
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={clsx('relative flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors', active ? 'border-brand/50' : 'border-line/[0.07] bg-line/[0.03] hover:border-line/15')}
    >
      {active && <motion.span layoutId="share-hint" transition={spring.responsive} className="absolute inset-0 -z-10 rounded-2xl bg-brand/10" />}
      <span className={clsx('tile h-11 w-11 transition-colors', active ? 'grad text-white shadow-glow' : 'bg-line/[0.07] text-fg-muted')}>
        <Icon name={icon} size={20} />
      </span>
      <span>
        <span className="block font-bold text-fg-strong">{title}</span>
        <span className="block text-xs text-fg-muted">{desc}</span>
      </span>
    </motion.button>
  );
}
