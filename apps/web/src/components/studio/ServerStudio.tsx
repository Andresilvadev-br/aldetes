import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_STUDIO, SERVER_SCENES, SERVER_ICON_ANIMS, SERVER_AMBIENTS, WORLD_TEMPLATES, type Server, type StudioTheme } from '@aldetes/shared';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { useOffscreenPause } from '@/lib/perf';
import { useStore } from '@/store';
import { api, upload } from '@/lib/api';
import { SettingsTitle, Segmented, Switch } from '../settings/SettingsLayout';
import { Icon } from '../common/Icon';
import { toast, toastError, confirmDialog } from '../common/overlay';
import { ServerIcon } from '../layout/ServerRail';
import { BANNERS, BADGE_LABEL, Badge, bannerVars, borderClass } from '../profile/Cosmetics';
import { ServerCover, IconFrame, themeOf, luminance, ServerAmbient, ServerName, PresentationBg } from './ServerScene';

const WCATS = [
  ['themes', 'Temas'],
  ['banners', 'Banners'],
  ['icons', 'Ícones animados'],
  ['effects', 'Efeitos de servidor'],
  ['decor', 'Decorações'],
  ['collections', 'Coleções'],
] as const;
type WCat = (typeof WCATS)[number][0];
const NEW_TEMPLATES = new Set(['cyber-district', 'royal-obsidian', 'celestial', 'crimson-pulse', 'crystal-dimension']);
const NEW_SCENES = new Set(['neon-skyline', 'cosmic-horizon', 'digital-matrix', 'dreamscape', 'energy-core']);
const ICON_ANIM_LABEL: Record<StudioTheme['iconAnim'], string> = { none: 'Parado', 'orbit-glow': 'Orbit Glow', 'crystal-shine': 'Crystal Shine', 'pulse-beacon': 'Pulse Beacon', 'neon-trace': 'Neon Trace', hologram: 'Hologram' };
const AMBIENT_LABEL: Record<StudioTheme['ambient'], string> = { none: 'Nenhum', 'ambient-particles': 'Ambient Particles', 'aurora-background': 'Aurora Background', 'reactive-glow': 'Reactive Glow', 'digital-atmosphere': 'Digital Atmosphere', starlight: 'Starlight' };
/** Server side of the 5 collections (the profile side lives in Cosmetics COLLECTIONS, same ids). Data only. */
export const WORLD_COLLECTIONS: Array<{ id: string; name: string; theme: Partial<StudioTheme> }> = [
  { id: 'neon-genesis', name: 'NEON GENESIS', theme: { ...WORLD_TEMPLATES['cyber-district'], template: 'cyber-district', emblem: 'bolt' } },
  { id: 'cosmic-legacy', name: 'COSMIC LEGACY', theme: { ...WORLD_TEMPLATES.celestial, template: 'celestial', iconAnim: 'orbit-glow', ambient: 'starlight' } },
  { id: 'obsidian-elite', name: 'OBSIDIAN ELITE', theme: { ...WORLD_TEMPLATES['royal-obsidian'], template: 'royal-obsidian' } },
  { id: 'holographic', name: 'HOLOGRAPHIC', theme: { ...WORLD_TEMPLATES['crystal-dimension'], template: 'crystal-dimension', scene: 'digital-matrix', sceneC1: '#a5f3fc', sceneC2: '#f0abfc', iconAnim: 'hologram' } },
  { id: 'eternal-flame', name: 'ETERNAL FLAME', theme: { ...WORLD_TEMPLATES['crimson-pulse'], template: 'crimson-pulse', accent: '#f97316', sceneC1: '#f97316', sceneC2: '#7c2d12', emblem: 'heart', ambient: 'ambient-particles' } },
];

const TEMPLATE_LABEL = { neon: 'Neon', minimal: 'Minimal', aurora: 'Aurora', cosmic: 'Cosmic', studio: 'Studio', arcade: 'Arcade', 'cyber-district': 'Cyber District', 'royal-obsidian': 'Royal Obsidian', celestial: 'Celestial', 'crimson-pulse': 'Crimson Pulse', 'crystal-dimension': 'Crystal Dimension' } as const;

type Remote = { live: StudioTheme | null; draft: StudioTheme | null; prev: StudioTheme | null };
const SWATCHES = ['#ff2d78', '#8b5cf6', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#eab308', '#14b8a6'];

/**
 * Server Studio (MANAGE_SERVER only — the API enforces it again). Three levels:
 * Essencial (color, icon, static banner) · Alive (animated scene/video banner, hover, on-demand animation) ·
 * Signature (cover framing, frames, separators, entrance, welcome scene).
 * Edits are local until "Salvar rascunho" (server-side draft) or "Publicar" (everyone sees it). "Reverter" swaps
 * back to the previously published look. Uploads are validated by type/size on the server (no SVG/HTML), and
 * video banners are re-encoded.
 */
export function ServerStudio({ serverId }: { serverId: string }) {
  const server = useStore((s) => s.servers[serverId])!;
  const [remote, setRemote] = useState<Remote | null>(null);
  const [t, setT] = useState<StudioTheme>(themeOf(server));
  const [compare, setCompare] = useState<'after' | 'before'>('after');
  const [zoom, setZoom] = useState<1 | 1.5>(1);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(0);
  const [sceneFilter, setSceneFilter] = useState<'all' | 'new'>('all');
  const bannerInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);

  const load = () =>
    api<Remote>('GET', `/servers/${serverId}/studio`).then((r) => {
      setRemote(r);
      setT(r.draft ?? r.live ?? DEFAULT_STUDIO);
    }, toastError);
  useEffect(() => void load(), [serverId]);

  const live = remote?.live ?? DEFAULT_STUDIO;
  const base = remote?.draft ?? live;
  const dirty = JSON.stringify(t) !== JSON.stringify(base);
  const unpublished = JSON.stringify(t) !== JSON.stringify(live);
  const set = (p: Partial<StudioTheme>) => setT((x) => ({ ...x, ...p }));
  const shown = compare === 'before' ? live : t;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, 'success');
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const uploadFile = async (kind: 'banner' | 'icon', f: File) => {
    if (f.type.startsWith('video/') && f.size > 12 * 1024 * 1024) return toast('Vídeo grande demais: até 12 MB.', 'error');
    const fd = new FormData();
    fd.append('file', f);
    if (f.type.startsWith('video/')) toast('Convertendo o vídeo… pode levar alguns segundos.');
    await upload(`/servers/${serverId}/${kind}`, fd).then(() => toast(kind === 'icon' ? 'Ícone atualizado' : 'Banner atualizado', 'success'), toastError);
  };

  const [cat, setCat] = useState<WCat>('themes');
  const [view, setView] = useState<'compact' | 'expanded'>('expanded');
  const [hist, setHist] = useState<StudioTheme[]>([]);
  /** every visual change can be undone */
  const apply = (p: Partial<StudioTheme>) => {
    setHist((h) => [...h.slice(-49), t]);
    set(p);
  };
  const undo = () => {
    const prev = hist.at(-1);
    if (!prev) return;
    setHist((h) => h.slice(0, -1));
    setT(prev);
  };
  const collection = WORLD_COLLECTIONS.find((c) => Object.entries(c.theme).every(([k, v]) => JSON.stringify(t[k as keyof StudioTheme]) === JSON.stringify(v)));

  return (
    <>
      <SettingsTitle>Worlds Studio</SettingsTitle>
      <p className="-mt-3 mb-4 text-sm text-fg-muted">Dê identidade ao servidor. Ninguém vê nada até você publicar. Quem preferir pode desligar os efeitos animados de servidores nas próprias configurações.</p>

      {/* preview */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented id="studio-compare" value={compare} onChange={setCompare} options={[['after', 'Depois (edição)'], ['before', 'Antes (publicado)']]} />
        <Segmented id="studio-view" value={view} onChange={setView} options={[['compact', 'Compacto'], ['expanded', 'Combinado']]} />
        <Segmented id="studio-zoom" value={String(zoom) as '1' | '1.5'} onChange={(v) => setZoom(v === '1.5' ? 1.5 : 1)} options={[['1', '100%'], ['1.5', '150%']]} />
        <button className="btn-secondary h-9 px-3 text-xs" onClick={() => setReplay((r) => r + 1)} disabled={shown.entrance === 'none'}>
          <Icon name="play" size={13} /> Ver entrada
        </button>
      </div>
      <div className="mb-6 overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-rail p-4" data-testid="studio-preview">
        <div className="origin-top-left transition-transform duration-300" style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%` }}>
          <StudioPreview server={server} theme={shown} replay={replay} expanded={view === 'expanded'} />
        </div>
      </div>

      <div role="tablist" aria-label="Categorias" className="scroll-thin -mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
        {WCATS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={cat === id} onClick={() => setCat(id)} className={clsx('relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors', cat === id ? 'text-white' : 'text-fg-muted hover:bg-line/[0.05] hover:text-fg-strong')}>
            {cat === id && <motion.span layoutId="wds-cat" transition={spring.responsive} className="grad absolute inset-0 rounded-xl" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {cat === 'themes' && (
        <Section title="Temas" desc="Um ponto de partida completo (cores, cena, ícone, ambiente e decorações). Tudo continua editável nas outras abas.">
          <div className="grid grid-cols-2 gap-2 py-4 md:grid-cols-4">
            {(Object.keys(WORLD_TEMPLATES) as Array<keyof typeof WORLD_TEMPLATES>).map((id) => {
              const tpl = { ...DEFAULT_STUDIO, welcome: t.welcome, ...WORLD_TEMPLATES[id], template: id };
              return (
                <button key={id} onClick={() => (setHist((h) => [...h.slice(-49), t]), setT(tpl))} aria-pressed={t.template === id} className={clsx('overflow-hidden rounded-xl border-2 text-left', t.template === id ? 'border-brand' : 'border-transparent hover:border-line/20')}>
                  <Thumb className="relative block h-16 overflow-hidden">
                    <ServerCover server={{ ...server, bannerUrl: null }} theme={tpl} fade={false} />
                  </Thumb>
                  <span className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-bold text-fg">
                    {TEMPLATE_LABEL[id]}
                    {NEW_TEMPLATES.has(id) && <span className="rounded bg-brand/20 px-1 text-[9px] text-brand">novo</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {cat === 'banners' && (
        <Section title="Banners" desc="Cena animada no cabeçalho, com cores, velocidade e intensidade. Ou envie sua imagem, GIF ou vídeo curto.">
          <Row label="Cena animada">
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
              {([['all', 'Todas'], ['new', 'Novas']] as const).map(([id, label]) => (
                <button key={id} aria-pressed={sceneFilter === id} onClick={() => setSceneFilter(id)} className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', sceneFilter === id ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/[0.1] text-fg-muted')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              <SceneTile active={!t.scene} label="Sem cena" onClick={() => apply({ scene: null })}>
                <div className="h-12 bg-line/[0.05]" />
              </SceneTile>
              {SERVER_SCENES.filter((id) => sceneFilter === 'all' || NEW_SCENES.has(id)).map((id) => (
                <SceneTile key={id} active={t.scene === id} label={BANNERS[id]?.label ?? id} onClick={() => apply({ scene: id })}>
                  <Thumb className="relative h-12 overflow-hidden" style={t.scene === id ? bannerVars({ c1: t.sceneC1, c2: t.sceneC2, speed: t.speed }) : undefined}>
                    {BANNERS[id]?.render()}
                  </Thumb>
                </SceneTile>
              ))}
            </div>
          </Row>
          {t.scene && (
            <Row label="Ajustes da cena">
              <div className="flex flex-wrap items-center gap-4">
                <ColorPick label="Cor 1" value={t.sceneC1} onChange={(sceneC1) => apply({ sceneC1 })} />
                <ColorPick label="Cor 2" value={t.sceneC2} onChange={(sceneC2) => apply({ sceneC2 })} />
              </div>
              <label className="mt-3 flex items-center gap-3 text-sm">
                <span className="w-24 font-semibold text-fg">Velocidade</span>
                <input type="range" min={25} max={200} step={5} value={t.speed} aria-label="Velocidade" onPointerDown={() => setHist((h) => [...h.slice(-49), t])} onChange={(e) => set({ speed: +e.target.value })} className="flex-1 accent-brand" />
                <span className="w-12 text-right tabular-nums text-fg-muted">{t.speed}%</span>
              </label>
            </Row>
          )}
          <Row label={`Intensidade dos efeitos · ${t.intensity}%`}>
            <input type="range" min={0} max={100} step={5} value={t.intensity} onPointerDown={() => setHist((h) => [...h.slice(-49), t])} onChange={(e) => set({ intensity: +e.target.value })} className="w-full accent-brand" aria-label="Intensidade dos efeitos" />
            <p className="mt-1 text-[11px] text-fg-faint">Quem usa movimento reduzido, o perfil Essencial ou "Usar aparência padrão" sempre vê a versão leve.</p>
          </Row>
          <Row label="Banner próprio">
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => bannerInput.current?.click()}>
                <Icon name="upload" size={14} /> Banner (imagem, GIF ou vídeo curto)
              </button>
              {server.bannerUrl && (
                <button className="btn-ghost text-xs hover:text-danger" onClick={() => api('DELETE', `/servers/${serverId}/banner`).catch(toastError)}>
                  Remover banner
                </button>
              )}
            </div>
            <input ref={bannerInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" onChange={(e) => e.target.files?.[0] && void uploadFile('banner', e.target.files[0])} />
            <p className="mt-1 text-[11px] text-fg-faint">PNG, JPEG, GIF ou WebP até 8 MB. Vídeo: MP4/WebM até 12 MB, convertido para 6 s sem som. SVG e HTML não são aceitos. Vale na hora (não passa pelo rascunho). A cena animada, se escolhida, fica por cima.</p>
          </Row>
          <Row label="Posição do banner">
            <Segmented id="bpos" value={t.bannerPosition} onChange={(v) => apply({ bannerPosition: v })} options={[['top', 'Topo'], ['center', 'Centro'], ['bottom', 'Base']]} />
          </Row>
        </Section>
      )}

      {cat === 'icons' && (
        <Section title="Ícones animados" desc="O ícone anima no cabeçalho do servidor aberto. No trilho fica parado (só o servidor selecionado anima), para não rodar um efeito por servidor.">
          <Row label="Cor e ícone">
            <div className="flex flex-wrap items-center gap-2">
              <button className={clsx('h-8 rounded-full border px-3 text-xs font-semibold', !t.accent ? 'border-brand text-fg-strong' : 'border-line/[0.1] text-fg-muted')} onClick={() => apply({ accent: null })}>
                Do tema de cada um
              </button>
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`Cor ${c}`} aria-pressed={t.accent === c} onClick={() => apply({ accent: c })} className={clsx('h-8 w-8 rounded-full', t.accent === c && 'ring-2 ring-white ring-offset-2 ring-offset-bg-main')} style={{ background: c }} />
              ))}
              <input type="color" aria-label="Outra cor" className="h-8 w-10 cursor-pointer rounded bg-transparent" value={t.accent ?? '#ff2d78'} onChange={(e) => apply({ accent: e.target.value })} />
              <button className="btn-secondary ml-2" onClick={() => iconInput.current?.click()}>
                <Icon name="upload" size={14} /> Trocar ícone
              </button>
            </div>
            <input ref={iconInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && void uploadFile('icon', e.target.files[0])} />
            {t.accent && luminance(t.accent) > 0.62 && <div className="pt-2 text-xs text-warn">Cor bem clara: textos brancos por cima dela ficam difíceis de ler. Prefira um tom um pouco mais forte.</div>}
          </Row>
          <Row label="Animação do ícone">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {SERVER_ICON_ANIMS.map((a) => (
                <button key={a} aria-pressed={t.iconAnim === a} onClick={() => apply({ iconAnim: a })} className={clsx('flex flex-col items-center gap-2 rounded-2xl border-2 p-3', t.iconAnim === a ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-line/[0.05]')}>
                  <IconFrame frame="none" accent={t.accent} anim={a} live active>
                    <ServerIcon name={server.name} iconUrl={server.iconUrl} active />
                  </IconFrame>
                  <span className="text-[11px] font-semibold text-fg">{ICON_ANIM_LABEL[a]}</span>
                </button>
              ))}
            </div>
            {t.iconAnim === 'pulse-beacon' && <p className="mt-2 text-[11px] text-fg-faint">Pulsa só quando há atividade de verdade: gente em call no servidor ou mensagens não lidas.</p>}
          </Row>
          <Row label="Moldura do ícone">
            <Segmented id="frame" value={t.iconFrame} onChange={(v) => apply({ iconFrame: v })} options={[['none', 'Nenhuma'], ['ring', 'Anel'], ['neon', 'Neon'], ['orbital', 'Orbital']]} />
          </Row>
          <Row label="Ícone ao passar o mouse">
            <Segmented id="hover" value={t.hover} onChange={(v) => apply({ hover: v })} options={[['lift', 'Subir'], ['glow', 'Brilhar'], ['tilt', 'Inclinar'], ['none', 'Nada']]} />
          </Row>
          <Row label="Posição do ícone">
            <Segmented id="ipos" value={t.iconPosition} onChange={(v) => apply({ iconPosition: v })} options={[['left', 'À esquerda'], ['center', 'Centralizado']]} />
          </Row>
        </Section>
      )}

      {cat === 'effects' && (
        <Section title="Efeitos de servidor" desc="Ambiente atrás da lista de canais — nunca por cima das mensagens. Para sozinho no Essencial, com o PC sob carga ou fora da tela.">
          <Row label="Ambiente">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {SERVER_AMBIENTS.map((a) => (
                <button key={a} aria-pressed={t.ambient === a} onClick={() => apply({ ambient: a })} className={clsx('overflow-hidden rounded-xl border-2 text-left', t.ambient === a ? 'border-brand' : 'border-transparent hover:border-line/20')}>
                  <Thumb className="relative block h-20 bg-bg-side">
                    <ServerAmbient theme={{ ...t, ambient: a, intensity: Math.max(60, t.intensity) }} serverId={serverId} />
                  </Thumb>
                  <span className="block px-1.5 py-1 text-[11px] font-bold text-fg">{AMBIENT_LABEL[a]}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Entrada ao abrir o servidor">
            <Segmented id="entr" value={t.entrance} onChange={(v) => (apply({ entrance: v }), setReplay((r) => r + 1))} options={[['none', 'Nenhuma'], ['sweep', 'Varredura'], ['bloom', 'Flor de luz'], ['glitch', 'Glitch']]} />
          </Row>
        </Section>
      )}

      {cat === 'decor' && (
        <Section title="Decorações" desc="Emblema e destaque do nome, borda dos cartões, separadores, luz, superfícies e fundo de apresentação.">
          <Row label="Emblema do servidor">
            <div className="flex flex-wrap gap-2">
              <button aria-pressed={!t.emblem} onClick={() => apply({ emblem: null })} className={clsx('h-10 rounded-xl border-2 px-3 text-xs font-semibold', !t.emblem ? 'border-brand bg-brand/10 text-fg-strong' : 'border-line/[0.08] text-fg-muted')}>
                Nenhum
              </button>
              {Object.keys(BADGE_LABEL).map((b) => (
                <button key={b} aria-pressed={t.emblem === b} aria-label={BADGE_LABEL[b]} title={BADGE_LABEL[b]} onClick={() => apply({ emblem: b as StudioTheme['emblem'] })} className={clsx('flex h-10 w-10 items-center justify-center rounded-xl border-2', t.emblem === b ? 'border-brand bg-brand/10' : 'border-line/[0.08] hover:bg-line/[0.05]')}>
                  <Badge id={b} size={20} />
                </button>
              ))}
            </div>
          </Row>
          <Row label="Destaque do nome">
            <Segmented id="snm" value={t.nameEffect} onChange={(v) => apply({ nameEffect: v })} options={[['none', 'Nenhum'], ['glow', 'Brilho'], ['gradient', 'Gradiente'], ['shimmer', 'Reflexo']]} />
          </Row>
          <Row label="Borda animada dos cartões">
            <Segmented id="scb" value={t.cardBorder} onChange={(v) => apply({ cardBorder: v })} options={[['none', 'Nenhuma'], ['flow', 'Fluxo'], ['pulse', 'Pulso']]} />
          </Row>
          <Row label="Separadores de categoria">
            <Segmented id="sep" value={t.separator} onChange={(v) => apply({ separator: v })} options={[['line', 'Linha'], ['glow', 'Brilho'], ['dots', 'Pontos']]} />
          </Row>
          <Row label="Iluminação temática">
            <Segmented id="light" value={t.lighting} onChange={(v) => apply({ lighting: v })} options={[['soft', 'Suave'], ['vivid', 'Viva'], ['dim', 'Baixa']]} />
          </Row>
          <Row label="Textura">
            <Segmented id="tex" value={t.texture} onChange={(v) => apply({ texture: v })} options={[['none', 'Nenhuma'], ['grain', 'Grão'], ['grid', 'Grade'], ['dots', 'Pontos']]} />
          </Row>
          <Row label="Superfícies">
            <Segmented id="surface" value={t.surface} onChange={(v) => apply({ surface: v })} options={[['default', 'Padrão'], ['deep', 'Profunda'], ['tinted', 'Com a cor']]} />
          </Row>
          <Row label="Fundo de apresentação (boas-vindas e convite)">
            <Segmented id="pres" value={t.presentation} onChange={(v) => apply({ presentation: v })} options={[['none', 'Nenhum'], ['nebula', 'Nebulosa'], ['grid', 'Grade'], ['waves', 'Ondas']]} />
          </Row>
          <Row label="Boas-vindas no primeiro acesso">
            <div className="flex items-center gap-3">
              <Switch checked={t.welcome.enabled} onChange={(v) => apply({ welcome: { ...t.welcome, enabled: v } })} />
              <span className="text-sm text-fg-muted">Um cartão discreto na lista de canais. Não bloqueia nada e some quando a pessoa fecha.</span>
            </div>
            {t.welcome.enabled && (
              <div className="mt-2 grid gap-2">
                <input className="input" maxLength={60} placeholder="Título (ex.: Bem-vindo à base!)" value={t.welcome.title} onChange={(e) => set({ welcome: { ...t.welcome, title: e.target.value } })} />
                <textarea className="input min-h-[64px]" maxLength={240} placeholder="Uma frase sobre o servidor, regras ou por onde começar" value={t.welcome.body} onChange={(e) => set({ welcome: { ...t.welcome, body: e.target.value } })} />
              </div>
            )}
          </Row>
        </Section>
      )}

      {cat === 'collections' && (
        <Section title="Coleções" desc="Banner, ícone animado, efeito, tema e decorações que combinam — as mesmas coleções do Identity Studio do perfil.">
          <div className="grid grid-cols-1 gap-3 py-4 md:grid-cols-2">
            {WORLD_COLLECTIONS.map((c) => {
              const full = { ...DEFAULT_STUDIO, welcome: t.welcome, ...c.theme };
              return (
                <button key={c.id} aria-pressed={collection?.id === c.id} onClick={() => (setHist((h) => [...h.slice(-49), t]), setT(full))} className={clsx('overflow-hidden rounded-2xl border-2 text-left', collection?.id === c.id ? 'border-brand' : 'border-transparent hover:border-line/20')}>
                  <Thumb className="relative block h-24 overflow-hidden bg-bg-side">
                    <ServerCover server={{ ...server, bannerUrl: null }} theme={full} fade={false} />
                    <span className="absolute bottom-2 left-2 flex items-center gap-2">
                      <IconFrame frame={full.iconFrame} accent={full.accent} anim={full.iconAnim} live active>
                        <ServerIcon name={server.name} iconUrl={server.iconUrl} size={36} active />
                      </IconFrame>
                      <ServerName name={server.name} theme={full} className="text-sm font-black text-white drop-shadow" />
                    </span>
                  </Thumb>
                  <span className="block px-2 py-1.5 text-xs font-black tracking-wider text-fg-strong">{c.name}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* actions */}
      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line/[0.08] bg-bg-rail p-3 shadow-float [&>span.w-full]:order-first">
        <button className="btn-ghost text-sm" disabled={busy || !remote?.prev} title={remote?.prev ? 'Volta para o visual publicado antes deste' : 'Ainda não há uma versão anterior'} onClick={async () => (await confirmDialog({ title: 'Reverter visual', body: 'Volta para o visual publicado anteriormente. O atual vira a "versão anterior" (dá para desfazer reverter de novo).', confirm: 'Reverter' })) && void run(() => api('POST', `/servers/${serverId}/studio/revert`), 'Visual anterior restaurado para todos.')}>
          Reverter
        </button>
        <button className="btn-ghost text-sm" onClick={() => (setHist((h) => [...h.slice(-49), t]), setT(DEFAULT_STUDIO))}>
          Restaurar padrão
        </button>
        <button className="btn-ghost text-sm" disabled={!hist.length} onClick={undo}>
          <Icon name="arrowLeft" size={14} /> Desfazer
        </button>
        <span className="flex-1" />
        <span className="w-full text-right text-xs text-fg-muted 2xl:w-auto" aria-live="polite" data-testid="studio-status">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warn" /> Alterações não salvas
            </span>
          ) : unpublished ? (
            'Rascunho salvo, ainda não publicado'
          ) : (
            'Publicado'
          )}
        </span>
        <button className="btn-ghost" disabled={!dirty || busy} onClick={() => (setT(base), setHist([]))}>
          Cancelar
        </button>
        <button className="btn-secondary" disabled={!dirty || busy} onClick={() => void run(() => api('PUT', `/servers/${serverId}/studio/draft`, t), 'Rascunho salvo (só quem gerencia o servidor vê).')}>
          Salvar rascunho
        </button>
        <button className="btn-primary" disabled={!unpublished || busy} onClick={() => void run(() => api('POST', `/servers/${serverId}/studio/publish`, t), 'Publicado! Todos já veem o novo visual.')}>
          Publicar
        </button>
      </div>
    </>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-lg font-extrabold tracking-tight text-fg-strong">{title}</h3>
      <p className="mb-3 text-xs text-fg-muted">{desc}</p>
      <div className="card divide-y divide-line/[0.06] px-5">{children}</div>
    </section>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-4">
      <div className="mb-2 text-sm font-bold text-fg-strong">{label}</div>
      {children}
    </div>
  );
}
function SceneTile({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="text-left">
      <span className={clsx('block overflow-hidden rounded-xl border-2', active ? 'border-brand shadow-glow' : 'border-transparent hover:border-line/20')}>{children}</span>
      <span className="mt-1 block truncate text-[11px] font-semibold text-fg">{label}</span>
    </button>
  );
}

/** Pauses its content while off screen: only visible thumbnails animate. */
function Thumb({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const pause = useOffscreenPause();
  return (
    <span ref={pause} className={clsx('block', className)} style={style}>
      {children}
    </span>
  );
}
function ColorPick({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-fg">
      {label}
      <input type="color" aria-label={label} className="h-8 w-12 cursor-pointer rounded bg-transparent" value={value ?? '#7c5cff'} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button className="text-[11px] text-fg-muted hover:text-fg-strong" onClick={() => onChange(null)}>
          original
        </button>
      ) : (
        <span className="text-[11px] text-fg-faint">original</span>
      )}
    </label>
  );
}

/** What members will see: rail, header, channel list with the ambient behind, welcome card and the invite card. */
function StudioPreview({ server, theme, replay, expanded }: { server: Server; theme: StudioTheme; replay: number; expanded: boolean }) {
  return (
    <div className="flex flex-wrap gap-3" style={theme.accent ? ({ '--sa': theme.accent } as React.CSSProperties) : undefined} data-sep={theme.separator}>
      <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-bg-rail py-3">
        <IconFrame frame={theme.iconFrame} accent={theme.accent} anim={theme.iconAnim} live active>
          <ServerIcon name={server.name} iconUrl={server.iconUrl} active />
        </IconFrame>
        <span className="h-12 w-12 rounded-2xl bg-line/[0.06]" />
        <span className="h-12 w-12 rounded-2xl bg-line/[0.06]" />
      </div>
      <div className="relative w-[272px] shrink-0 overflow-hidden rounded-2xl border border-line/[0.06] bg-bg-side" style={theme.surface === 'deep' ? { background: 'linear-gradient(rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.18)), rgb(var(--bg-side))' } : theme.surface === 'tinted' && theme.accent ? { background: `linear-gradient(180deg, ${theme.accent}14, transparent 60%), rgb(var(--bg-side))` } : undefined}>
        <div className="relative overflow-hidden">
          <ServerCover server={server} theme={theme} />
          {theme.entrance !== 'none' && replay > 0 && <span key={replay} className={`studio-entr studio-entr-${theme.entrance}`} aria-hidden />}
          <div className={clsx('relative flex items-end gap-3 px-4 pb-3 pt-7', theme.iconPosition === 'center' && 'flex-col items-center text-center')}>
            <span className="rounded-[18px] ring-2 ring-bg-side">
              <IconFrame frame={theme.iconFrame} accent={theme.accent} anim={theme.iconAnim} live active>
                <ServerIcon name={server.name} iconUrl={server.iconUrl} size={46} active />
              </IconFrame>
            </span>
            <span className="min-w-0">
              <ServerName name={server.name} theme={theme} className="block text-[17px] font-black text-fg-strong" />
              <span className="block text-[11px] text-fg-muted">● online agora</span>
            </span>
          </div>
        </div>
        <div className="relative">
          <ServerAmbient theme={theme} serverId={server.id} />
          <div className="relative z-10 space-y-1 p-2">
            {theme.welcome.enabled && theme.welcome.title && (
              <div className={clsx('relative mb-2 overflow-hidden rounded-2xl border border-line/[0.08] p-3', borderClass(theme.cardBorder))} style={{ background: `linear-gradient(135deg, ${theme.accent ?? 'rgb(var(--brand))'}33, transparent 70%)` }}>
                <PresentationBg kind={theme.presentation} accent={theme.accent} />
                <div className="relative text-[13px] font-extrabold text-fg-strong">{theme.welcome.title}</div>
                {theme.welcome.body && <p className="relative text-[12px] text-fg-muted">{theme.welcome.body}</p>}
              </div>
            )}
            {['Canais de texto', 'Canais de voz'].map((cat) => (
              <div key={cat}>
                <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-fg-faint">
                  {cat} <span className="cat-sep h-px flex-1 bg-gradient-to-r from-line/15 to-transparent" />
                </div>
                {['geral', 'clipes'].map((c) => (
                  <div key={c} className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-fg-muted">
                    <Icon name={cat.includes('voz') ? 'speaker' : 'hash'} size={15} /> {c}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {expanded && (
        <div className={clsx('relative w-[240px] shrink-0 overflow-hidden rounded-2xl border border-line/[0.08] bg-bg-main p-4 text-center', borderClass(theme.cardBorder))} data-testid="studio-invite-preview">
          <PresentationBg kind={theme.presentation} accent={theme.accent} />
          <div className="absolute inset-x-0 top-0 h-20 overflow-hidden">
            <ServerCover server={server} theme={theme} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg-main" />
          </div>
          <div className="relative mt-6 flex justify-center">
            <IconFrame frame={theme.iconFrame} accent={theme.accent} anim={theme.iconAnim} live active>
              <ServerIcon name={server.name} iconUrl={server.iconUrl} size={56} active />
            </IconFrame>
          </div>
          <p className="relative mt-2 text-[11px] text-fg-muted">Você recebeu um convite para</p>
          <div className="relative flex justify-center text-base font-bold text-fg-strong">
            <ServerName name={server.name} theme={theme} />
          </div>
          <span className="relative mt-3 block rounded-lg bg-brand py-1.5 text-xs font-bold text-white" style={theme.accent ? { background: theme.accent } : undefined}>
            Aceitar convite
          </span>
          <span className="relative mt-1 block text-[10px] text-fg-faint">pré-visualização do convite</span>
        </div>
      )}
    </div>
  );
}
