import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_STUDIO, SERVER_SCENES, WORLD_TEMPLATES, studioLevel, type Server, type StudioTheme } from '@aldetes/shared';
import { useStore } from '@/store';
import { api, upload } from '@/lib/api';
import { SettingsTitle, Segmented, Switch } from '../settings/SettingsLayout';
import { Icon } from '../common/Icon';
import { toast, toastError, confirmDialog } from '../common/overlay';
import { ServerIcon } from '../layout/ServerRail';
import { BANNERS } from '../profile/Cosmetics';
import { ServerCover, IconFrame, themeOf, luminance } from './ServerScene';

const TEMPLATE_LABEL = { neon: 'Neon', minimal: 'Minimal', aurora: 'Aurora', cosmic: 'Cosmic', studio: 'Studio', arcade: 'Arcade' } as const;

type Remote = { live: StudioTheme | null; draft: StudioTheme | null; prev: StudioTheme | null };
const LEVEL_LABEL = { essencial: 'Essencial', alive: 'Alive', signature: 'Signature' } as const;
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
  const level = studioLevel(t);
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

  return (
    <>
      <SettingsTitle>Worlds</SettingsTitle>
      <p className="-mt-3 mb-5 text-sm text-fg-muted">Dê identidade ao servidor. Ninguém vê nada até você publicar. Quem preferir pode desligar os efeitos animados de servidores nas próprias configurações.</p>

      {/* preview */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented id="studio-compare" value={compare} onChange={setCompare} options={[['after', 'Depois (edição)'], ['before', 'Antes (publicado)']]} />
        <Segmented id="studio-zoom" value={String(zoom) as '1' | '1.5'} onChange={(v) => setZoom(v === '1.5' ? 1.5 : 1)} options={[['1', '100%'], ['1.5', '150%']]} />
        <button className="btn-secondary h-9 px-3 text-xs" onClick={() => setReplay((r) => r + 1)} disabled={shown.entrance === 'none'}>
          <Icon name="play" size={13} /> Ver entrada
        </button>
        <span className="flex-1" />
        <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider', level === 'signature' ? 'grad text-white' : level === 'alive' ? 'bg-sky-400/15 text-sky-400' : 'bg-line/[0.08] text-fg-muted')}>Nível {LEVEL_LABEL[level]}</span>
      </div>
      <div className="mb-8 overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-rail p-4" data-testid="studio-preview">
        <div className="origin-top-left transition-transform duration-300" style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%` }}>
          <StudioPreview server={server} theme={shown} replay={replay} />
        </div>
      </div>

      {/* Worlds templates (data only) */}
      <Section title="Modelos" desc="Um ponto de partida completo. Tudo continua editável abaixo.">
        <div className="grid grid-cols-3 gap-2 py-4 md:grid-cols-6">
          {(Object.keys(WORLD_TEMPLATES) as Array<keyof typeof WORLD_TEMPLATES>).map((id) => {
            const tpl = { ...t, ...WORLD_TEMPLATES[id], template: id };
            return (
              <button key={id} onClick={() => setT(tpl)} aria-pressed={t.template === id} className={clsx('overflow-hidden rounded-xl border-2 text-left', t.template === id ? 'border-brand' : 'border-transparent hover:border-line/20')}>
                <span className="relative block h-14 overflow-hidden">
                  <ServerCover server={{ ...server, bannerUrl: null }} theme={tpl} fade={false} still />
                </span>
                <span className="block px-1.5 py-1 text-[11px] font-bold capitalize text-fg">{TEMPLATE_LABEL[id]}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Essencial */}
      <Section title="Essencial" desc="Cor, ícone e banner estático.">
        <Row label="Cor do servidor">
          <div className="flex flex-wrap items-center gap-2">
            <button className={clsx('h-8 rounded-full border px-3 text-xs font-semibold', !t.accent ? 'border-brand text-fg-strong' : 'border-line/[0.1] text-fg-muted')} onClick={() => set({ accent: null })}>
              Do tema de cada um
            </button>
            {SWATCHES.map((c) => (
              <button key={c} aria-label={`Cor ${c}`} aria-pressed={t.accent === c} onClick={() => set({ accent: c })} className={clsx('h-8 w-8 rounded-full', t.accent === c && 'ring-2 ring-white ring-offset-2 ring-offset-bg-main')} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Outra cor" className="h-8 w-10 cursor-pointer rounded bg-transparent" value={t.accent ?? '#ff2d78'} onChange={(e) => set({ accent: e.target.value })} />
          </div>
        </Row>
        {t.accent && luminance(t.accent) > 0.62 && (
          <div className="py-2 text-xs text-warn">Cor bem clara: textos brancos por cima dela ficam difíceis de ler. Os nomes continuam sobre o fundo escuro do cabeçalho, mas prefira um tom um pouco mais forte.</div>
        )}
        <Row label="Ícone e banner">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => iconInput.current?.click()}>
              <Icon name="upload" size={14} /> Ícone (imagem)
            </button>
            <button className="btn-secondary" onClick={() => bannerInput.current?.click()}>
              <Icon name="upload" size={14} /> Banner (imagem, GIF ou vídeo curto)
            </button>
            {server.bannerUrl && (
              <button className="btn-ghost text-xs hover:text-danger" onClick={() => api('DELETE', `/servers/${serverId}/banner`).catch(toastError)}>
                Remover banner
              </button>
            )}
          </div>
          <input ref={iconInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && void uploadFile('icon', e.target.files[0])} />
          <input ref={bannerInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" onChange={(e) => e.target.files?.[0] && void uploadFile('banner', e.target.files[0])} />
          <p className="mt-1 text-[11px] text-fg-faint">PNG, JPEG, GIF ou WebP até 8 MB. Vídeo: MP4/WebM até 12 MB, convertido para 6 s sem som. SVG e HTML não são aceitos. Ícone e banner valem na hora (não passam pelo rascunho).</p>
        </Row>
        <Row label="Posição do banner">
          <Segmented id="bpos" value={t.bannerPosition} onChange={(v) => set({ bannerPosition: v })} options={[['top', 'Topo'], ['center', 'Centro'], ['bottom', 'Base']]} />
        </Row>
        <Row label="Posição do ícone">
          <Segmented id="ipos" value={t.iconPosition} onChange={(v) => set({ iconPosition: v })} options={[['left', 'À esquerda'], ['center', 'Centralizado']]} />
        </Row>
      </Section>

      {/* Alive */}
      <Section title="Alive" desc="Cena animada no cabeçalho, luz, textura e efeito ao passar o mouse no ícone.">
        <Row label="Cena animada">
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            <SceneTile active={!t.scene} label="Sem cena" onClick={() => set({ scene: null })}>
              <div className="h-12 bg-line/[0.05]" />
            </SceneTile>
            {SERVER_SCENES.map((id) => (
              <SceneTile key={id} active={t.scene === id} label={BANNERS[id]?.label ?? id} onClick={() => set({ scene: id })}>
                <div className="relative h-12 overflow-hidden">{BANNERS[id]?.render()}</div>
              </SceneTile>
            ))}
          </div>
        </Row>
        <Row label="Iluminação">
          <Segmented id="light" value={t.lighting} onChange={(v) => set({ lighting: v })} options={[['soft', 'Suave'], ['vivid', 'Viva'], ['dim', 'Baixa']]} />
        </Row>
        <Row label="Textura">
          <Segmented id="tex" value={t.texture} onChange={(v) => set({ texture: v })} options={[['none', 'Nenhuma'], ['grain', 'Grão'], ['grid', 'Grade'], ['dots', 'Pontos']]} />
        </Row>
        <Row label="Superfícies">
          <Segmented id="surface" value={t.surface} onChange={(v) => set({ surface: v })} options={[['default', 'Padrão'], ['deep', 'Profunda'], ['tinted', 'Com a cor']]} />
        </Row>
        <Row label={`Intensidade dos efeitos · ${t.intensity}%`}>
          <input type="range" min={0} max={100} step={5} value={t.intensity} onChange={(e) => set({ intensity: +e.target.value })} className="w-full accent-brand" aria-label="Intensidade dos efeitos" />
          <p className="mt-1 text-[11px] text-fg-faint">Quem usa movimento reduzido, modo Econômico ou "Usar aparência padrão" sempre vê a versão leve.</p>
        </Row>
        <Row label="Ícone ao passar o mouse">
          <Segmented id="hover" value={t.hover} onChange={(v) => set({ hover: v })} options={[['lift', 'Subir'], ['glow', 'Brilhar'], ['tilt', 'Inclinar'], ['none', 'Nada']]} />
        </Row>
      </Section>

      {/* Signature */}
      <Section title="Signature" desc="Moldura, separadores, entrada curta e cena de boas-vindas no primeiro acesso.">
        <Row label="Moldura do ícone">
          <Segmented id="frame" value={t.iconFrame} onChange={(v) => set({ iconFrame: v })} options={[['none', 'Nenhuma'], ['ring', 'Anel'], ['neon', 'Neon'], ['orbital', 'Orbital']]} />
        </Row>
        <Row label="Separadores de categoria">
          <Segmented id="sep" value={t.separator} onChange={(v) => set({ separator: v })} options={[['line', 'Linha'], ['glow', 'Brilho'], ['dots', 'Pontos']]} />
        </Row>
        <Row label="Entrada ao abrir o servidor">
          <Segmented id="entr" value={t.entrance} onChange={(v) => (set({ entrance: v }), setReplay((r) => r + 1))} options={[['none', 'Nenhuma'], ['sweep', 'Varredura'], ['bloom', 'Flor de luz'], ['glitch', 'Glitch']]} />
        </Row>
        <Row label="Boas-vindas no primeiro acesso">
          <div className="flex items-center gap-3">
            <Switch checked={t.welcome.enabled} onChange={(v) => set({ welcome: { ...t.welcome, enabled: v } })} />
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

      {/* actions */}
      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line/[0.08] bg-bg-rail p-3 shadow-float [&>span.w-full]:order-first">
        <button className="btn-ghost text-sm" disabled={busy || !remote?.prev} title={remote?.prev ? 'Volta para o visual publicado antes deste' : 'Ainda não há uma versão anterior'} onClick={async () => (await confirmDialog({ title: 'Reverter visual', body: 'Volta para o visual publicado anteriormente. O atual vira a "versão anterior" (dá para desfazer reverter de novo).', confirm: 'Reverter' })) && void run(() => api('POST', `/servers/${serverId}/studio/revert`), 'Visual anterior restaurado para todos.')}>
          Reverter
        </button>
        <button className="btn-ghost text-sm" onClick={() => setT(DEFAULT_STUDIO)}>
          Padrão
        </button>
        <span className="flex-1" />
        <span className="w-full text-right text-xs text-fg-muted 2xl:w-auto" aria-live="polite">
          {dirty ? 'Alterações não salvas' : unpublished ? 'Rascunho salvo, ainda não publicado' : 'Publicado'}
        </span>
        <button className="btn-ghost" disabled={!dirty || busy} onClick={() => setT(base)}>
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

/** What members will see: header + channel list + welcome card, rendered with the real renderer. */
function StudioPreview({ server, theme, replay }: { server: Server; theme: StudioTheme; replay: number }) {
  return (
    <div className="flex gap-3" style={theme.accent ? ({ '--sa': theme.accent } as React.CSSProperties) : undefined} data-sep={theme.separator}>
      <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-bg-rail py-3">
        <IconFrame frame={theme.iconFrame} accent={theme.accent}>
          <ServerIcon name={server.name} iconUrl={server.iconUrl} active />
        </IconFrame>
        <span className="h-12 w-12 rounded-2xl bg-line/[0.06]" />
        <span className="h-12 w-12 rounded-2xl bg-line/[0.06]" />
      </div>
      <div className="w-[272px] shrink-0 overflow-hidden rounded-2xl border border-line/[0.06] bg-bg-side">
        <div className="relative overflow-hidden">
          <ServerCover server={server} theme={theme} />
          {theme.entrance !== 'none' && replay > 0 && <span key={replay} className={`studio-entr studio-entr-${theme.entrance}`} aria-hidden />}
          <div className={clsx('relative flex items-end gap-3 px-4 pb-3 pt-7', theme.iconPosition === 'center' && 'flex-col items-center text-center')}>
            <span className="rounded-[18px] ring-2 ring-bg-side">
              <IconFrame frame={theme.iconFrame} accent={theme.accent}>
                <ServerIcon name={server.name} iconUrl={server.iconUrl} size={46} active />
              </IconFrame>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-black text-fg-strong">{server.name}</span>
              <span className="text-[11px] text-fg-muted">● online agora</span>
            </span>
          </div>
        </div>
        <div className="space-y-1 p-2">
          {theme.welcome.enabled && theme.welcome.title && (
            <div className="mb-2 rounded-2xl border border-line/[0.08] p-3" style={{ background: `linear-gradient(135deg, ${theme.accent ?? 'rgb(var(--brand))'}33, transparent 70%)` }}>
              <div className="text-[13px] font-extrabold text-fg-strong">{theme.welcome.title}</div>
              {theme.welcome.body && <p className="text-[12px] text-fg-muted">{theme.welcome.body}</p>}
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
  );
}
