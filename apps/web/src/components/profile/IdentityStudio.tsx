import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import type { BannerOptions, ProfileDecor, SelfUser } from '@aldetes/shared';
import { useStore } from '@/store';
import { api, upload } from '@/lib/api';
import { spring } from '@/lib/motion';
import { useOffscreenPause } from '@/lib/perf';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { toast, toastError } from '../common/overlay';
import { SettingsTitle, Segmented } from '../settings/SettingsLayout';
import {
  BANNERS, EFFECTS, DECORATIONS, COLLECTIONS, ENTRANCES, PROFILE_THEMES, BADGE_LABEL,
  ProfileBanner, ProfileEffect, ProfileEntrance, ThemeLayer, themeStyle, nameClass, borderClass, Badge,
} from './Cosmetics';

/* ------------------------------------------------------------------------------------------------------------------
 * Identity Studio (2.1). Everything is a DRAFT shown live in the preview; nothing reaches other people until "Salvar".
 * Undo (Ctrl+Z too), before/after, compact/expanded preview, "Restaurar padrão", "Cancelar". Uploads (avatar/banner
 * file) apply on upload as before. Only thumbnails on screen animate (IntersectionObserver → data-offscreen).
 * ---------------------------------------------------------------------------------------------------------------- */

export type ProfileDraft = {
  displayName: string;
  bio: string;
  accentColor: string;
  bannerPreset: string | null;
  bannerOptions: BannerOptions | null;
  profileEffect: string | null;
  avatarDecoration: string | null;
  profileEntrance: string | null;
  profileTheme: string | null;
  profileDecor: ProfileDecor | null;
  pronouns: string;
  profileLinks: Array<{ label: string; url: string }>;
};
const DEFAULT_OPTS: BannerOptions = { c1: null, c2: null, intensity: 80, speed: 100, reduced: false };
const DEFAULT_DECOR: ProfileDecor = { nameEffect: 'none', badge: null, cardBorder: 'none' };
// JSONB comes back with its keys reordered: rebuild objects in a fixed key order so the draft compares equal
const opts = (o: Partial<BannerOptions> | null | undefined): BannerOptions | null => (o ? { c1: o.c1 ?? null, c2: o.c2 ?? null, intensity: o.intensity ?? 80, speed: o.speed ?? 100, reduced: !!o.reduced } : null);
const decorOf = (d: Partial<ProfileDecor> | null | undefined): ProfileDecor | null =>
  d ? { nameEffect: (d.nameEffect ?? 'none') as ProfileDecor['nameEffect'], badge: (d.badge ?? null) as ProfileDecor['badge'], cardBorder: (d.cardBorder ?? 'none') as ProfileDecor['cardBorder'] } : null;
export const draftOf = (me: SelfUser): ProfileDraft => ({
  displayName: me.displayName,
  bio: me.bio,
  accentColor: me.accentColor ?? '#6c5ce7',
  bannerPreset: me.bannerPreset,
  bannerOptions: opts(me.bannerOptions),
  profileEffect: me.profileEffect,
  avatarDecoration: me.avatarDecoration ?? null,
  profileEntrance: me.profileEntrance ?? null,
  profileTheme: me.profileTheme ?? null,
  profileDecor: decorOf(me.profileDecor),
  pronouns: me.pronouns ?? '',
  profileLinks: (me.profileLinks ?? []).map((l) => ({ label: l.label, url: l.url })),
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const CATS = [
  ['collections', 'Coleções'],
  ['banners', 'Banners'],
  ['frames', 'Molduras'],
  ['effects', 'Efeitos'],
  ['themes', 'Temas'],
  ['decor', 'Decorações'],
  ['about', 'Sobre você'],
] as const;
type Cat = (typeof CATS)[number][0];

const NEW_BANNERS = new Set(['nebula-flow', 'cyber-rain-x', 'aurora-dream', 'liquid-chrome', 'galaxy-drift']);
const NEW_FRAMES = new Set(['quantum-orbit', 'plasma-crown', 'crystal-prism', 'neon-circuit', 'solar-eclipse']);
const NEW_EFFECTS = new Set(['cosmic-arrival', 'holographic-shift', 'electric-pulse', 'ethereal-mist', 'celestial-wings']);
const PROFILE_BANNERS = Object.entries(BANNERS).filter(([, b]) => b.tag !== 'servidor');

export function IdentityStudio() {
  const me = useStore((s) => s.me)!;
  const base = draftOf(me);
  const [d, setD] = useState<ProfileDraft>(() => draftOf(me));
  const [hist, setHist] = useState<ProfileDraft[]>([]);
  const [cat, setCat] = useState<Cat>('collections');
  const [compare, setCompare] = useState<'after' | 'before'>('after');
  const [view, setView] = useState<'compact' | 'expanded'>('compact');
  const [replay, setReplay] = useState(0);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const dirty = !same(d, base);
  const linksValid = d.profileLinks.every((l) => l.label.trim() && /^https:\/\/[^\s]+\.[^\s]+/i.test(l.url.trim()));

  /** every visual change goes through here so it can be undone */
  const set = (p: Partial<ProfileDraft>, { again = false } = {}) => {
    setHist((h) => [...h.slice(-49), d]);
    setD((x) => ({ ...x, ...p }));
    if (again) setReplay((r) => r + 1);
  };
  /** text fields: no undo entry per keystroke */
  const type = (p: Partial<ProfileDraft>) => setD((x) => ({ ...x, ...p }));
  const undo = () => {
    const prev = hist.at(-1);
    if (!prev) return;
    setHist((h) => h.slice(0, -1));
    setD(prev);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  // keep the draft in sync when the profile changes elsewhere (other session) and nothing is pending here
  useEffect(() => {
    if (!dirty) setD(draftOf(me));
  }, [me]);

  const uploadImg = async (kind: 'avatar' | 'banner', f: File) => {
    const isVideo = f.type.startsWith('video/');
    if (isVideo && f.size > 12 * 1024 * 1024) return toast('Vídeo grande demais: até 12 MB (ele é cortado em 6 s e comprimido).', 'error');
    if (!isVideo && f.size > 8 * 1024 * 1024) return toast('Imagem grande demais: até 8 MB.', 'error');
    const fd = new FormData();
    fd.append('file', f);
    try {
      if (isVideo) toast('Convertendo o vídeo… pode levar alguns segundos.');
      await upload(`/users/@me/${kind}`, fd);
      if (kind === 'banner') {
        if (me.bannerPreset) await api('PATCH', '/users/@me', { bannerPreset: null });
        setD((x) => ({ ...x, bannerPreset: null }));
      }
      toast(kind === 'avatar' ? 'Avatar atualizado' : 'Banner atualizado', 'success');
    } catch (e) {
      toastError(e);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const o = d.bannerOptions && !same(d.bannerOptions, DEFAULT_OPTS) ? d.bannerOptions : null;
      const dec = d.profileDecor && !same(d.profileDecor, DEFAULT_DECOR) ? d.profileDecor : null;
      await api('PATCH', '/users/@me', {
        displayName: d.displayName.trim() || me.username,
        bio: d.bio,
        accentColor: d.accentColor,
        bannerPreset: d.bannerPreset,
        bannerOptions: o,
        profileEffect: d.profileEffect,
        avatarDecoration: d.avatarDecoration,
        profileEntrance: d.profileEntrance,
        profileTheme: d.profileTheme,
        profileDecor: dec,
        pronouns: d.pronouns.trim() || null,
        profileLinks: d.profileLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
      });
      setD((x) => ({ ...x, bannerOptions: o, profileDecor: dec }));
      setHist([]);
      toast('Perfil salvo — todo mundo já vê o novo visual.', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const shown = compare === 'before' ? base : d;
  const o = d.bannerOptions ?? DEFAULT_OPTS;
  const dec = d.profileDecor ?? DEFAULT_DECOR;
  const setOpt = (p: Partial<BannerOptions>) => set({ bannerOptions: { ...o, ...p } });
  /** sliders: live preview while dragging, one undo step per drag */
  const liveOpt = (p: Partial<BannerOptions>) => type({ bannerOptions: { ...o, ...p } });
  const mark = () => setHist((h) => [...h.slice(-49), d]);
  const setDec = (p: Partial<ProfileDecor>) => set({ profileDecor: { ...dec, ...p } });

  return (
    <>
      <SettingsTitle>Identity Studio</SettingsTitle>
      <p className="-mt-3 mb-4 text-sm text-fg-muted">Monte seu visual: banner, moldura, efeito, tema e decorações. Misture como quiser — nada é exclusivo de uma coleção.</p>
      <div role="tablist" aria-label="Categorias" className="scroll-thin -mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
        {CATS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={cat === id} onClick={() => setCat(id)} className={clsx('relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors', cat === id ? 'text-white' : 'text-fg-muted hover:bg-line/[0.05] hover:text-fg-strong')}>
            {cat === id && <motion.span layoutId="ids-cat" transition={spring.responsive} className="grad absolute inset-0 rounded-xl" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-8">
        <div className="min-w-0 flex-1 space-y-6" data-testid="identity-gallery">
          {cat === 'collections' && (
            <Group title="Coleções" desc="Um visual completo de uma vez — banner, moldura, efeito, tema e decorações. Depois você troca qualquer peça.">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {COLLECTIONS.map((c) => {
                  const on = d.bannerPreset === c.banner && d.avatarDecoration === c.decoration && d.profileEffect === c.effect && (c.theme ?? null) === d.profileTheme;
                  return (
                    <Tile key={c.id} active={on} label={c.name} tag={c.premium ? '2.1' : undefined} onClick={() => set({ bannerPreset: c.banner, bannerOptions: c.bannerOptions ? { ...DEFAULT_OPTS, ...c.bannerOptions } : null, avatarDecoration: c.decoration, profileEffect: c.effect, profileEntrance: c.entrance, profileTheme: c.theme ?? null, profileDecor: c.decor ? (c.decor as ProfileDecor) : null }, { again: true })}>
                      <div className="relative h-[92px]" style={themeStyle(c.theme)}>
                        <ProfileBanner user={{ ...me, bannerPreset: c.banner, bannerOptions: c.bannerOptions ? { ...DEFAULT_OPTS, ...c.bannerOptions } : null }} height={58} />
                        <span className="absolute bottom-2 left-2 rounded-full ring-2 ring-bg-float">
                          <Avatar userId={me.id} size={30} decoration={c.decoration} />
                        </span>
                        <span className={clsx('absolute bottom-2.5 left-12 text-[12px] font-extrabold text-fg-strong', nameClass(c.decor?.nameEffect))}>{d.displayName || me.username}</span>
                      </div>
                    </Tile>
                  );
                })}
              </div>
            </Group>
          )}

          {cat === 'banners' && (
            <>
              <Group
                title="Banners"
                desc="Cenas animadas, gradientes estáticos ou seu arquivo: imagem, GIF ou vídeo curto (até 12 MB; cortado em 6 s, sem som)."
                action={
                  <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => bannerInput.current?.click()}>
                    <Icon name="upload" size={14} /> Enviar arquivo
                  </button>
                }
              >
                <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" hidden onChange={(e) => e.target.files?.[0] && uploadImg('banner', e.target.files[0])} />
                <Filtered
                  filters={[['all', 'Todos'], ['new', 'Novos'], ['anim', 'Animados'], ['static', 'Estáticos']]}
                  items={[[null, { label: me.bannerUrl ? 'Meu arquivo' : 'Cor do perfil', tag: 'estático' }] as const, ...PROFILE_BANNERS]}
                  match={(f, [id, b]) => f === 'all' || (f === 'new' ? !!id && NEW_BANNERS.has(id) : f === 'static' ? b.tag === 'estático' : b.tag !== 'estático')}
                  render={([id, b]) => (
                    <Tile key={id ?? 'none'} active={d.bannerPreset === id} label={b.label} tag={id && NEW_BANNERS.has(id) ? 'novo' : b.tag} onClick={() => set({ bannerPreset: id })}>
                      <ProfileBanner user={{ ...me, bannerPreset: id, accentColor: d.accentColor, bannerOptions: id === d.bannerPreset ? d.bannerOptions : null }} height={64} />
                    </Tile>
                  )}
                />
                {me.bannerUrl && (
                  <button className="mt-2 text-xs text-fg-muted hover:text-danger" onClick={() => api('DELETE', '/users/@me/banner').catch(toastError)}>
                    Remover meu arquivo de banner
                  </button>
                )}
              </Group>
              {d.bannerPreset && BANNERS[d.bannerPreset]?.tag !== 'estático' && (
                <Group title="Ajustes do banner" desc="Valem para o banner escolhido. As cores novas trocam as duas cores principais da cena.">
                  <div className="card space-y-4 p-4" data-testid="banner-options">
                    <div className="flex flex-wrap items-center gap-4">
                      <ColorField label="Cor 1" value={o.c1} onChange={(c1) => setOpt({ c1 })} />
                      <ColorField label="Cor 2" value={o.c2} onChange={(c2) => setOpt({ c2 })} />
                    </div>
                    <Slider label="Intensidade" value={o.intensity} min={0} max={100} unit="%" onStart={mark} onChange={(intensity) => liveOpt({ intensity })} />
                    <Slider label="Velocidade" value={o.speed} min={25} max={200} unit="%" onStart={mark} onChange={(speed) => liveOpt({ speed })} />
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-sm font-semibold text-fg">Animação</span>
                      <Segmented id="bn-reduced" value={o.reduced ? 'reduced' : 'normal'} onChange={(v) => setOpt({ reduced: v === 'reduced' })} options={[['normal', 'Normal'], ['reduced', 'Reduzida']]} />
                    </div>
                    <button className="text-xs font-semibold text-fg-muted hover:text-fg-strong" onClick={() => set({ bannerOptions: null })}>
                      Voltar ao original do banner
                    </button>
                  </div>
                </Group>
              )}
            </>
          )}

          {cat === 'frames' && (
            <Group title="Molduras" desc="Ficam em volta da sua foto (a imagem não é alterada). Em avatares pequenos — chat, listas, participantes — aparece a versão parada, para não pesar.">
              <Filtered
                filters={[['all', 'Todas'], ['new', 'Novas']]}
                items={[null, ...Object.keys(DECORATIONS)]}
                match={(f, id) => f === 'all' || (!!id && NEW_FRAMES.has(id))}
                render={(id) => (
                  <Thumb key={id ?? 'none'}>
                    <button onClick={() => set({ avatarDecoration: id })} aria-pressed={d.avatarDecoration === id} className={clsx('flex w-full flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-colors', d.avatarDecoration === id ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-line/[0.05]')}>
                      <span className="p-1.5">
                        <Avatar userId={me.id} size={56} decoration={id} />
                      </span>
                      <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-fg">
                        {id ? DECORATIONS[id]!.label : 'Nenhuma'}
                        {id && NEW_FRAMES.has(id) && <span className="rounded bg-brand/20 px-1 text-[9px] font-bold text-brand">novo</span>}
                      </span>
                    </button>
                  </Thumb>
                )}
                cols="grid-cols-3 lg:grid-cols-4"
              />
            </Group>
          )}

          {cat === 'effects' && (
            <>
              <Group title="Efeitos do perfil" desc="Cada efeito tem entrada, permanência leve e saída quando o cartão fecha. Quem usa movimento reduzido vê tudo parado.">
                <Filtered
                  filters={[['all', 'Todos'], ['new', 'Novos']]}
                  items={[null, ...Object.keys(EFFECTS)]}
                  match={(f, id) => f === 'all' || (!!id && NEW_EFFECTS.has(id))}
                  render={(id) => (
                    <Tile key={id ?? 'none'} active={d.profileEffect === id} label={id ? EFFECTS[id]!.label : 'Nenhum'} tag={id && NEW_EFFECTS.has(id) ? 'novo' : undefined} onClick={() => set({ profileEffect: id }, { again: true })}>
                      <div className="relative h-16 overflow-hidden bg-bg-float">
                        {id && <ProfileEffect id={id} behind />}
                        {id && <ProfileEffect id={id} />}
                      </div>
                    </Tile>
                  )}
                />
              </Group>
              <Group title="Entrada do cartão" desc="Um efeito curto quando alguém abre o seu cartão.">
                <Segmented id="entrance" value={d.profileEntrance ?? 'none'} onChange={(v) => set({ profileEntrance: v === 'none' ? null : v }, { again: true })} options={[['none', 'Nenhuma'], ...Object.entries(ENTRANCES)] as Array<[string, string]>} />
              </Group>
            </>
          )}

          {cat === 'themes' && (
            <Group title="Temas do perfil" desc="Muda o fundo do cartão e a cor de destaque dos botões e realces. Combina com qualquer banner e moldura.">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Tile active={!d.profileTheme} label="Padrão do app" onClick={() => set({ profileTheme: null })}>
                  <div className="h-20 bg-bg-float" />
                </Tile>
                {Object.entries(PROFILE_THEMES).map(([id, t]) => (
                  <Tile key={id} active={d.profileTheme === id} label={t.label} onClick={() => set({ profileTheme: id })}>
                    <div className="relative h-20 p-2.5" style={themeStyle(id)}>
                      <ThemeLayer id={id} />
                      <span className="relative block text-[10px] text-white/70">{t.desc}</span>
                      <span className="absolute bottom-2.5 left-2.5 h-5 w-14 rounded-md" style={{ background: `rgb(${t.a})` }} />
                      <span className="absolute bottom-2.5 left-[72px] h-5 w-8 rounded-md" style={{ background: `rgb(${t.b} / .6)` }} />
                    </div>
                  </Tile>
                ))}
              </div>
            </Group>
          )}

          {cat === 'decor' && (
            <Group title="Decorações" desc="Detalhes do cartão: destaque do nome, um emblema ao lado dele e a borda animada.">
              <div className="card space-y-5 p-4">
                <div>
                  <div className="mb-2 text-sm font-bold text-fg-strong">Destaque do nome</div>
                  <Segmented id="nm" value={dec.nameEffect} onChange={(v) => setDec({ nameEffect: v })} options={[['none', 'Nenhum'], ['glow', 'Brilho'], ['gradient', 'Gradiente'], ['shimmer', 'Reflexo']]} />
                </div>
                <div>
                  <div className="mb-2 text-sm font-bold text-fg-strong">Emblema</div>
                  <div className="flex flex-wrap gap-2">
                    <button aria-pressed={!dec.badge} onClick={() => setDec({ badge: null })} className={clsx('h-10 rounded-xl border-2 px-3 text-xs font-semibold', !dec.badge ? 'border-brand bg-brand/10 text-fg-strong' : 'border-line/[0.08] text-fg-muted')}>
                      Nenhum
                    </button>
                    {Object.keys(BADGE_LABEL).map((b) => (
                      <button key={b} aria-pressed={dec.badge === b} title={BADGE_LABEL[b]} aria-label={BADGE_LABEL[b]} onClick={() => setDec({ badge: b as ProfileDecor['badge'] })} className={clsx('flex h-10 w-10 items-center justify-center rounded-xl border-2', dec.badge === b ? 'border-brand bg-brand/10' : 'border-line/[0.08] hover:bg-line/[0.05]')}>
                        <Badge id={b} size={20} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-bold text-fg-strong">Borda do cartão</div>
                  <Segmented id="cb" value={dec.cardBorder} onChange={(v) => setDec({ cardBorder: v })} options={[['none', 'Nenhuma'], ['flow', 'Fluxo'], ['pulse', 'Pulso']]} />
                </div>
              </div>
            </Group>
          )}

          {cat === 'about' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button className="group/av relative rounded-full" title="Mudar avatar" onClick={() => avatarInput.current?.click()}>
                  <Avatar userId={me.id} size={72} decoration={null} />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover/av:opacity-100">Mudar</span>
                </button>
                <div className="flex-1">
                  <label className="label">Nome de exibição</label>
                  <input className="input" maxLength={32} value={d.displayName} onChange={(e) => type({ displayName: e.target.value })} />
                </div>
                <div className="w-36">
                  <label className="label">Pronomes</label>
                  <input className="input" maxLength={40} placeholder="opcional" value={d.pronouns} onChange={(e) => type({ pronouns: e.target.value })} />
                </div>
                <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('avatar', e.target.files[0])} />
              </div>
              {me.avatarUrl && (
                <button className="-mt-5 text-xs text-fg-muted hover:text-danger" onClick={() => api('DELETE', '/users/@me/avatar').catch(toastError)}>
                  Remover avatar
                </button>
              )}
              <div>
                <label className="label">Cor do perfil</label>
                <input type="color" className="h-10 w-20 cursor-pointer rounded bg-transparent" value={d.accentColor} onChange={(e) => type({ accentColor: e.target.value })} />
              </div>
              <div>
                <label className="label">Sobre mim</label>
                <textarea className="input min-h-[100px]" maxLength={190} value={d.bio} onChange={(e) => type({ bio: e.target.value })} />
                <div className="text-right text-xs text-fg-faint">{190 - d.bio.length}</div>
              </div>
              <div>
                <div className="label !mb-0.5">Links</div>
                <div className="mb-2 text-xs text-fg-muted">Até 3, só https://. Aparecem no seu cartão para quem abrir o perfil.</div>
                {d.profileLinks.map((l, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <input className="input w-36" placeholder="Nome" maxLength={32} value={l.label} onChange={(e) => type({ profileLinks: d.profileLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <input className="input flex-1" placeholder="https://…" maxLength={200} value={l.url} onChange={(e) => type({ profileLinks: d.profileLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <button className="icon-btn hover:text-danger" aria-label="Remover link" onClick={() => set({ profileLinks: d.profileLinks.filter((_, j) => j !== i) })}>
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
                {d.profileLinks.length < 3 && (
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => set({ profileLinks: [...d.profileLinks, { label: '', url: 'https://' }] })}>
                    <Icon name="plus" size={13} /> Adicionar link
                  </button>
                )}
                {!linksValid && <p className="mt-1 text-xs text-warn">Cada link precisa de um nome e de um endereço https:// válido.</p>}
              </div>
            </div>
          )}
        </div>

        {/* live preview */}
        <div className={clsx('hidden shrink-0 md:block', view === 'expanded' ? 'w-[340px]' : 'w-[300px]')}>
          <div className="sticky top-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Segmented id="ids-compare" value={compare} onChange={setCompare} options={[['after', 'Depois'], ['before', 'Antes']]} />
              <Segmented id="ids-view" value={view} onChange={setView} options={[['compact', 'Compacto'], ['expanded', 'Combinado']]} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-fg-faint">
              <span>{compare === 'before' ? 'Como está salvo agora' : 'Pré-visualização ao vivo'}</span>
              <button className="font-semibold text-brand hover:underline" onClick={() => setReplay((r) => r + 1)}>
                Rever animação
              </button>
            </div>
            <PreviewCard me={me} d={shown} replay={replay} />
            {view === 'expanded' && <CombinedPreview me={me} d={shown} />}
            <p className="text-[11px] text-fg-faint">É assim que os outros veem. Quem usa movimento reduzido ou o perfil Essencial vê a versão parada.</p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line/[0.08] bg-bg-rail p-3 shadow-float">
        <button
          className="btn-ghost text-sm"
          onClick={() => set({ bannerPreset: null, bannerOptions: null, profileEffect: null, avatarDecoration: null, profileEntrance: null, profileTheme: null, profileDecor: null, accentColor: '#6c5ce7' }, { again: true })}
        >
          Restaurar padrão
        </button>
        <button className="btn-ghost text-sm" disabled={!hist.length} onClick={undo} title="Desfazer (Ctrl+Z)">
          <Icon name="arrowLeft" size={14} /> Desfazer
        </button>
        <span className={clsx('flex-1 text-right text-sm', dirty ? 'text-fg' : 'text-fg-faint')} aria-live="polite" data-testid="unsaved">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warn" /> Alterações não salvas — só você está vendo.
            </span>
          ) : (
            'Tudo salvo.'
          )}
        </span>
        <button className="btn-ghost" disabled={!dirty} onClick={() => (setD(base), setHist([]))}>
          Cancelar
        </button>
        <button className="btn bg-ok text-white hover:bg-ok/80 disabled:opacity-50" disabled={!dirty || saving || !linksValid} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </>
  );
}

/** The real profile card look (same pieces as UserPopout). */
function PreviewCard({ me, d, replay }: { me: SelfUser; d: ProfileDraft; replay: number }) {
  const user = { ...me, ...d, bannerUrl: d.bannerPreset ? null : me.bannerUrl };
  return (
    <div key={`${replay}`} data-testid="profile-preview" className={clsx('relative overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-float shadow-float', borderClass(d.profileDecor?.cardBorder))} style={themeStyle(d.profileTheme)}>
      <ThemeLayer id={d.profileTheme} />
      <ProfileEntrance id={d.profileEntrance} play={replay} />
      <ProfileEffect id={d.profileEffect} behind />
      <div className="relative">
        <ProfileBanner user={user} height={100} />
        <div className="px-4 pb-5">
          <div className="relative -mt-10 mb-2 w-fit rounded-full border-[6px] border-bg-float">
            <Avatar userId={me.id} size={76} showStatus decoration={d.avatarDecoration} />
          </div>
          <div className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight text-fg-strong">
            <span className={nameClass(d.profileDecor?.nameEffect)}>{d.displayName || me.username}</span>
            <Badge id={d.profileDecor?.badge} size={18} />
          </div>
          <div className="text-sm text-fg-muted">
            {me.username}
            {d.pronouns.trim() ? ` · ${d.pronouns.trim()}` : ''}
          </div>
          {d.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{d.bio}</p>}
          <div className="mt-3 flex gap-2">
            <span className="flex-1 rounded-xl bg-brand py-1.5 text-center text-xs font-bold text-white">Mensagem</span>
            <span className="rounded-xl bg-line/[0.08] px-3 py-1.5 text-xs font-bold text-fg">Ligar</span>
          </div>
        </div>
      </div>
      <ProfileEffect id={d.profileEffect} />
    </div>
  );
}

/** How the pieces look elsewhere: chat message, friends list, call participant (small = static frame). */
function CombinedPreview({ me, d }: { me: SelfUser; d: ProfileDraft }) {
  // chat and lists show the plain name (a highlight per message would mean dozens of loops); the card has the full look
  const name = <span className="font-bold text-fg-strong">{d.displayName || me.username}</span>;
  return (
    <div className="space-y-2 rounded-2xl border border-line/[0.08] bg-bg-main p-3 text-sm" data-testid="combined-preview">
      <div className="text-[10px] font-black uppercase tracking-wider text-fg-faint">No chat</div>
      <div className="flex gap-2.5">
        <Avatar userId={me.id} size={40} decoration={d.avatarDecoration} />
        <div>
          <div className="flex items-center gap-1">
            {name}
            <span className="text-[11px] text-fg-faint">hoje às 21:04</span>
          </div>
          <div className="text-fg">bora jogar hoje?</div>
        </div>
      </div>
      <div className="text-[10px] font-black uppercase tracking-wider text-fg-faint">Lista de amigos</div>
      <div className="flex items-center gap-2 rounded-lg bg-line/[0.04] px-2 py-1.5">
        <Avatar userId={me.id} size={32} decoration={d.avatarDecoration} showStatus />
        {name}
      </div>
      <div className="text-[10px] font-black uppercase tracking-wider text-fg-faint">Na call</div>
      <div className="flex items-center gap-3 rounded-xl bg-bg-side p-3">
        <Avatar userId={me.id} size={64} decoration={d.avatarDecoration} />
        <Avatar userId={me.id} size={28} decoration={d.avatarDecoration} />
        <span className="text-[11px] text-fg-muted">grande anima · pequeno fica parado</span>
      </div>
    </div>
  );
}

function Group({ title, desc, action, children }: { title: string; desc: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-fg-strong">{title}</h3>
          <p className="text-xs text-fg-muted">{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Filtered<T>({ filters, items, match, render, cols = 'grid-cols-2 lg:grid-cols-3' }: { filters: Array<[string, string]>; items: readonly T[]; match: (f: string, it: T) => boolean; render: (it: T) => ReactNode; cols?: string }) {
  const [f, setF] = useState(filters[0]![0]);
  const list = items.filter((it) => match(f, it));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
        {filters.map(([id, label]) => (
          <button key={id} aria-pressed={f === id} onClick={() => setF(id)} className={clsx('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', f === id ? 'border-brand bg-brand/15 text-fg-strong' : 'border-line/[0.1] text-fg-muted hover:text-fg-strong')}>
            {label}
          </button>
        ))}
      </div>
      <div className={clsx('grid gap-3', cols)}>{list.map(render)}</div>
    </>
  );
}

/** Pauses everything inside while off screen (gallery thumbnails). */
function Thumb({ children }: { children: ReactNode }) {
  const pause = useOffscreenPause();
  return <div ref={pause}>{children}</div>;
}

function Tile({ active, label, tag, onClick, children }: { active: boolean; label: string; tag?: string; onClick: () => void; children: ReactNode }) {
  const pause = useOffscreenPause();
  return (
    <motion.button ref={pause} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={spring.snappy} onClick={onClick} aria-pressed={active} className="group relative text-left">
      <span className={clsx('relative block overflow-hidden rounded-xl border-2 transition-colors', active ? 'border-brand shadow-glow' : 'border-transparent group-hover:border-line/20')}>
        {children}
        {tag && <span className={clsx('absolute left-1.5 top-1.5 rounded-md px-1.5 py-px text-[9px] font-bold uppercase tracking-wide backdrop-blur-sm', tag === 'novo' || tag === '2.1' ? 'bg-brand/80 text-white' : 'bg-black/50 text-white/80')}>{tag}</span>}
      </span>
      <span className="mt-1 block truncate text-xs font-semibold text-fg" title={label}>
        {label}
      </span>
      {active && (
        <span className="grad absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      )}
    </motion.button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-fg">
      {label}
      <input type="color" className="h-8 w-12 cursor-pointer rounded bg-transparent" value={value ?? '#7c5cff'} onChange={(e) => onChange(e.target.value)} aria-label={label} />
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

function Slider({ label, value, min, max, unit, onStart, onChange }: { label: string; value: number; min: number; max: number; unit: string; onStart: () => void; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-24 font-semibold text-fg">{label}</span>
      <input type="range" min={min} max={max} step={5} value={value} aria-label={label} onPointerDown={onStart} onKeyDown={(e) => !e.repeat && onStart()} onChange={(e) => onChange(+e.target.value)} className="flex-1 accent-brand" />
      <span className="w-12 text-right tabular-nums text-fg-muted">
        {value}
        {unit}
      </span>
    </label>
  );
}
