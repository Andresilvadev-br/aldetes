import { AudioCenter, useDevices } from './AudioCenter';
import { usePerf } from '@/lib/perf';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useStore, set as setStore, initialState, useStoreShallow } from '@/store';
import { api, upload, setSessionToken } from '@/lib/api';
import { usePrefs, setPrefs, ACCENTS, type AccentName } from '@/lib/prefs';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';
import { ConnectionTest } from './ConnectionTest';
import { logout as doLogout } from '@/lib/session';
import { openWhatsNew, runningVersion } from '../common/WhatsNew';
import { BANNERS, EFFECTS, ProfileBanner, ProfileEffect, AvatarDecoration, ProfileEntrance, DECORATIONS, COLLECTIONS, ENTRANCES } from '../profile/Cosmetics';
import { SettingsLayout, SettingsTitle, Toggle, Switch, Segmented } from './SettingsLayout';
import { Avatar, colorFor } from '../common/Avatar';
import { toastError, toast, confirmDialog } from '../common/overlay';
import { applyDevicePrefs, restartMic, onVoiceModeChanged, leaveVoice } from '@/lib/voice';
import { requestNotificationPermission } from '@/lib/notify';
import { desktop, type DesktopSettings } from '@/lib/desktop';
import { disconnectGateway } from '@/lib/gateway';
import type { SelfUser } from '@aldetes/shared';

export function UserSettings({ onClose, initialTab = 'account' }: { onClose: () => void; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  const logout = async () => {
    if (await doLogout()) onClose();
  };
  const sections = [
    { id: 'account', label: 'Minha conta', group: 'Configurações de usuário' },
    { id: 'profile', label: 'Perfis', group: 'Configurações de usuário' },
    { id: 'privacy', label: 'Privacidade e segurança', group: 'Configurações de usuário' },
    { id: 'devices', label: 'Dispositivos', group: 'Configurações de usuário' },
    { id: 'appearance', label: 'Aparência', group: 'Configurações do aplicativo' },
    { id: 'a11y', label: 'Acessibilidade', group: 'Configurações do aplicativo' },
    { id: 'voice', label: 'Voz e vídeo', group: 'Configurações do aplicativo' },
    { id: 'notifications', label: 'Notificações', group: 'Configurações do aplicativo' },
    { id: 'keybinds', label: 'Atalhos de teclado', group: 'Configurações do aplicativo' },
    ...(desktop ? [{ id: 'desktop', label: desktop.platform === 'win32' ? 'Windows' : desktop.platform === 'darwin' ? 'macOS' : 'Linux', group: 'Configurações do aplicativo' }] : []),
    { id: 'about', label: 'Sobre o Aldetes', group: 'Configurações do aplicativo' },
    { id: 'logout', label: 'Sair', group: ' ', danger: true, onClick: logout },
  ];
  return (
    <SettingsLayout sections={sections} active={tab} onSelect={setTab} onClose={onClose}>
      {tab === 'account' && <AccountTab />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'a11y' && <A11yTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'keybinds' && <KeybindsTab />}
      {tab === 'desktop' && <DesktopTab />}
      {tab === 'about' && <AboutTab />}
    </SettingsLayout>
  );
}

function AccountTab() {
  const me = useStore((s) => s.me)!;
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  return (
    <>
      <SettingsTitle>Minha conta</SettingsTitle>
      <div className="overflow-hidden rounded-lg bg-bg-rail">
        <div className="h-24" style={{ background: me.bannerUrl ? `center/cover url(${me.bannerUrl})` : (me.accentColor ?? colorFor(me.id)) }} />
        <div className="flex items-end gap-4 px-4 pb-4">
          <div className="-mt-10 rounded-full border-[6px] border-bg-rail">
            <Avatar userId={me.id} size={80} showStatus />
          </div>
          <div className="pb-2 text-xl font-bold text-fg-strong">{me.displayName}</div>
        </div>
        <div className="m-4 mt-0 space-y-4 rounded-lg bg-bg-side p-4">
          <div>
            <div className="label">Nome de usuário</div>
            <div className="text-fg-strong">{me.username}</div>
          </div>
          <div>
            <div className="label">E-mail</div>
            <div className="text-fg-strong">{me.email}</div>
          </div>
        </div>
      </div>
      <h3 className="mb-3 mt-8 text-lg font-semibold text-fg-strong">Senha</h3>
      <form
        className="grid max-w-sm gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('POST', '/auth/change-password', pw);
            setPw({ currentPassword: '', newPassword: '' });
            toast('Senha alterada. Outras sessões foram encerradas.', 'success');
          } catch (err) {
            toastError(err);
          }
        }}
      >
        <input className="input" type="password" placeholder="Senha atual" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required autoComplete="current-password" />
        <input className="input" type="password" placeholder="Nova senha (mín. 8 caracteres)" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required autoComplete="new-password" />
        <button className="btn-primary w-fit">Alterar senha</button>
      </form>
    </>
  );
}

type ProfileDraft = {
  displayName: string;
  bio: string;
  accentColor: string;
  bannerPreset: string | null;
  profileEffect: string | null;
  avatarDecoration: string | null;
  profileEntrance: string | null;
  pronouns: string;
  profileLinks: Array<{ label: string; url: string }>;
};
const draftOf = (me: SelfUser): ProfileDraft => ({
  displayName: me.displayName,
  bio: me.bio,
  accentColor: me.accentColor ?? '#6c5ce7',
  bannerPreset: me.bannerPreset,
  profileEffect: me.profileEffect,
  avatarDecoration: me.avatarDecoration ?? null,
  profileEntrance: me.profileEntrance ?? null,
  pronouns: me.pronouns ?? '',
  // JSONB comes back with its keys reordered: rebuild { label, url } so the draft compares equal
  profileLinks: (me.profileLinks ?? []).map((l) => ({ label: l.label, url: l.url })),
});

/**
 * Profile identity editor: everything is a DRAFT shown live in the preview card; nothing reaches other people until
 * "Salvar". "Cancelar" drops the draft, "Restaurar padrão" clears banner/effect/decoration/entrance (name and bio stay).
 * Uploads (avatar/banner file) are the exception: they apply on upload, like before.
 */
function ProfileTab() {
  const me = useStore((s) => s.me)!;
  const [d, setD] = useState<ProfileDraft>(() => draftOf(me));
  const base = draftOf(me);
  const [replay, setReplay] = useState(0);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<ProfileDraft>) => setD((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const linksValid = d.profileLinks.every((l) => l.label.trim() && /^https:\/\/[^\s]+\.[^\s]+/i.test(l.url.trim()));
  const uploadImg = async (kind: 'avatar' | 'banner', f: File) => {
    const isVideo = f.type.startsWith('video/');
    if (isVideo && f.size > 12 * 1024 * 1024) return toast('Vídeo grande demais: até 12 MB (ele é cortado em 6 s e comprimido).', 'error');
    const fd = new FormData();
    fd.append('file', f);
    try {
      if (isVideo) toast('Convertendo o vídeo… pode levar alguns segundos.');
      await upload(`/users/@me/${kind}`, fd);
      if (kind === 'banner') {
        if (me.bannerPreset) await api('PATCH', '/users/@me', { bannerPreset: null });
        set({ bannerPreset: null });
      }
      toast(kind === 'avatar' ? 'Avatar atualizado' : 'Banner atualizado', 'success');
    } catch (e) {
      toastError(e);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api('PATCH', '/users/@me', {
        displayName: d.displayName.trim() || me.username,
        bio: d.bio,
        accentColor: d.accentColor,
        bannerPreset: d.bannerPreset,
        profileEffect: d.profileEffect,
        avatarDecoration: d.avatarDecoration,
        profileEntrance: d.profileEntrance,
        pronouns: d.pronouns.trim() || null,
        profileLinks: d.profileLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
      });
      toast('Perfil salvo — todo mundo já vê o novo visual.', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  // keep the draft in sync when the profile changes elsewhere and there is nothing pending here
  useEffect(() => {
    if (!dirty) setD(draftOf(me));
  }, [me]);
  const preview = { ...me, ...d, bannerUrl: d.bannerPreset ? null : me.bannerUrl };
  const pick = (k: keyof ProfileDraft, v: string | null) => (set({ [k]: v } as Partial<ProfileDraft>), k === 'profileEntrance' && setReplay((r) => r + 1));
  return (
    <>
      <SettingsTitle>Perfil</SettingsTitle>
      <div className="flex gap-8">
        <div className="min-w-0 flex-1 space-y-7">
          <div className="flex items-center gap-4">
            <button className="group/av relative rounded-full" title="Mudar avatar" onClick={() => avatarInput.current?.click()}>
              <Avatar userId={me.id} size={72} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover/av:opacity-100">Mudar</span>
            </button>
            <div className="flex-1">
              <label className="label">Nome de exibição</label>
              <input className="input" maxLength={32} value={d.displayName} onChange={(e) => set({ displayName: e.target.value })} />
            </div>
            <div className="w-36">
              <label className="label">Pronomes</label>
              <input className="input" maxLength={40} placeholder="opcional" value={d.pronouns} onChange={(e) => set({ pronouns: e.target.value })} />
            </div>
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('avatar', e.target.files[0])} />
          </div>
          {me.avatarUrl && (
            <button className="-mt-5 text-xs text-fg-muted hover:text-danger" onClick={() => api('DELETE', '/users/@me/avatar').catch(toastError)}>
              Remover avatar
            </button>
          )}

          <div>
            <div className="label !mb-0.5">Coleções</div>
            <div className="mb-2 text-xs text-fg-muted">Um visual completo de uma vez: banner, moldura, efeito e entrada combinando.</div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {COLLECTIONS.map((c) => {
                const on = d.bannerPreset === c.banner && d.avatarDecoration === c.decoration && d.profileEffect === c.effect && d.profileEntrance === c.entrance;
                return (
                  <PickTile key={c.id} active={on} label={c.name} onClick={() => (set({ bannerPreset: c.banner, avatarDecoration: c.decoration, profileEffect: c.effect, profileEntrance: c.entrance }), setReplay((r) => r + 1))}>
                    <div className="relative">
                      <ProfileBanner user={{ ...me, bannerPreset: c.banner }} height={64} />
                      <span className="deco-host absolute bottom-1.5 left-2 rounded-full ring-2 ring-bg-float">
                        <AvatarDecoration id={c.decoration} size={26} />
                        <Avatar userId={me.id} size={26} />
                      </span>
                    </div>
                  </PickTile>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <div className="label !mb-0.5">Banner</div>
                <div className="text-xs text-fg-muted">Cenas animadas, gradientes estáticos, ou seu arquivo: imagem, GIF ou vídeo curto (até 12 MB; cortado em 6 s, sem som).</div>
              </div>
              <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => bannerInput.current?.click()}>
                <Icon name="upload" size={14} /> Enviar arquivo
              </button>
              <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" hidden onChange={(e) => e.target.files?.[0] && uploadImg('banner', e.target.files[0])} />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <PickTile active={!d.bannerPreset} label={me.bannerUrl ? 'Meu arquivo' : 'Cor do perfil'} onClick={() => pick('bannerPreset', null)}>
                <ProfileBanner user={{ ...me, bannerPreset: null, accentColor: d.accentColor }} height={64} />
              </PickTile>
              {Object.entries(BANNERS).map(([id, b]) => (
                <PickTile key={id} active={d.bannerPreset === id} label={b.label} tag={b.tag} onClick={() => pick('bannerPreset', id)}>
                  <ProfileBanner user={{ ...me, bannerPreset: id }} height={64} />
                </PickTile>
              ))}
            </div>
            {me.bannerUrl && (
              <button className="mt-2 text-xs text-fg-muted hover:text-danger" onClick={() => api('DELETE', '/users/@me/banner').catch(toastError)}>
                Remover meu arquivo de banner
              </button>
            )}
          </div>

          <div>
            <div className="label !mb-0.5">Moldura do avatar</div>
            <div className="mb-2 text-xs text-fg-muted">Fica em volta da sua foto — a imagem original não é alterada.</div>
            <div className="flex flex-wrap gap-3">
              {[null, ...Object.keys(DECORATIONS)].map((id) => (
                <button key={id ?? 'none'} onClick={() => pick('avatarDecoration', id)} aria-pressed={d.avatarDecoration === id} className={clsx('deco-host flex w-[84px] flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 transition-colors', d.avatarDecoration === id ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-line/[0.05]')}>
                  <span className="relative">
                    <AvatarDecoration id={id} size={44} />
                    <Avatar userId={me.id} size={44} />
                  </span>
                  <span className="truncate text-[11px] font-semibold text-fg">{id ? DECORATIONS[id]!.label : 'Nenhuma'}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label !mb-0.5">Efeito do perfil</div>
            <div className="mb-2 text-xs text-fg-muted">Aparece por cima do seu cartão quando alguém abre o seu perfil.</div>
            <div className="grid grid-cols-3 gap-2.5">
              <PickTile active={!d.profileEffect} label="Nenhum" onClick={() => pick('profileEffect', null)}>
                <div className="h-16 bg-line/[0.04]" />
              </PickTile>
              {Object.entries(EFFECTS).map(([id, fx]) => (
                <PickTile key={id} active={d.profileEffect === id} label={fx.label} onClick={() => pick('profileEffect', id)}>
                  <div className="relative h-16 overflow-hidden bg-bg-float">
                    <ProfileEffect id={id} behind />
                    <ProfileEffect id={id} />
                  </div>
                </PickTile>
              ))}
            </div>
          </div>

          <div>
            <div className="label !mb-0.5">Entrada do perfil</div>
            <div className="mb-2 text-xs text-fg-muted">Um efeito curto quando alguém abre o seu cartão. Não aparece para quem usa “reduzir movimento”.</div>
            <Segmented id="entrance" value={d.profileEntrance ?? 'none'} onChange={(v) => pick('profileEntrance', v === 'none' ? null : v)} options={[['none', 'Nenhuma'], ...Object.entries(ENTRANCES)] as Array<[string, string]>} />
          </div>

          <div>
            <label className="label">Cor do perfil</label>
            <input type="color" className="h-10 w-20 cursor-pointer rounded bg-transparent" value={d.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
          </div>
          <div>
            <label className="label">Sobre mim</label>
            <textarea className="input min-h-[100px]" maxLength={190} value={d.bio} onChange={(e) => set({ bio: e.target.value })} />
            <div className="text-right text-xs text-fg-faint">{190 - d.bio.length}</div>
          </div>
          <div>
            <div className="label !mb-0.5">Links</div>
            <div className="mb-2 text-xs text-fg-muted">Até 3, só https://. Aparecem no seu cartão para quem abrir o perfil.</div>
            {d.profileLinks.map((l, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input className="input w-36" placeholder="Nome" maxLength={32} value={l.label} onChange={(e) => set({ profileLinks: d.profileLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className="input flex-1" placeholder="https://…" maxLength={200} value={l.url} onChange={(e) => set({ profileLinks: d.profileLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
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

        <div className="hidden w-[300px] shrink-0 md:block">
          <div className="sticky top-0">
            <div className="label flex items-center justify-between">
              Pré-visualização ao vivo
              {d.profileEntrance && (
                <button className="text-[11px] font-semibold normal-case text-brand hover:underline" onClick={() => setReplay((r) => r + 1)}>
                  Rever entrada
                </button>
              )}
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-float shadow-float" data-testid="profile-preview">
              <ProfileEntrance id={d.profileEntrance} play={replay} />
              <ProfileEffect id={d.profileEffect} behind />
              <div className="relative">
                <ProfileBanner user={preview} height={100} />
                <div className="px-4 pb-5">
                  <div className="deco-host relative -mt-10 mb-2 w-fit rounded-full border-[6px] border-bg-float">
                    <AvatarDecoration id={d.avatarDecoration} size={76} />
                    <Avatar userId={me.id} size={76} showStatus />
                  </div>
                  <div className="text-xl font-extrabold tracking-tight text-fg-strong">{d.displayName || me.username}</div>
                  <div className="text-sm text-fg-muted">
                    {me.username}
                    {d.pronouns.trim() ? ` · ${d.pronouns.trim()}` : ''}
                  </div>
                  {d.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{d.bio}</p>}
                  {d.profileLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.profileLinks.map((l, i) => (
                        <span key={i} className="flex items-center gap-1 rounded-lg border border-line/[0.08] bg-line/[0.04] px-2 py-1 text-xs font-semibold text-sky-400">
                          <Icon name="link" size={12} /> {l.label || 'link'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <ProfileEffect id={d.profileEffect} />
            </div>
            <p className="mt-2 text-[11px] text-fg-faint">É assim que os outros veem o seu cartão. Quem usa “reduzir movimento” vê tudo parado.</p>
          </div>
        </div>
      </div>
      <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line/[0.08] bg-bg-rail p-3 shadow-float">
        <button
          className="btn-ghost text-sm"
          onClick={() => (set({ bannerPreset: null, profileEffect: null, avatarDecoration: null, profileEntrance: null, accentColor: '#6c5ce7' }), setReplay((r) => r + 1))}
        >
          Restaurar padrão
        </button>
        <span className={clsx('flex-1 text-right text-sm', dirty ? 'text-fg' : 'text-fg-faint')}>{dirty ? 'Alterações não salvas — só você está vendo.' : 'Tudo salvo.'}</span>
        <button className="btn-ghost" disabled={!dirty} onClick={() => setD(base)}>
          Cancelar
        </button>
        <button className="btn bg-ok text-white hover:bg-ok/80 disabled:opacity-50" disabled={!dirty || saving || !linksValid} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </>
  );
}

function PickTile({ active, label, tag, onClick, children }: { active: boolean; label: string; tag?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={spring.snappy} onClick={onClick} className="group relative text-left">
      <span className={clsx('block overflow-hidden rounded-xl border-2 transition-colors', active ? 'border-brand shadow-glow' : 'border-transparent group-hover:border-line/20')}>{children}</span>
      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-fg">
        <span className="truncate">{label}</span>
        {tag && <span className="rounded bg-line/[0.07] px-1 text-[10px] font-medium text-fg-muted">{tag}</span>}
      </span>
      {active && (
        <span className="grad absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      )}
    </motion.button>
  );
}

function ActivityPrivacy() {
  const p = usePrefs();
  const game = useGameNow();
  const on = p.activityConsent;
  return (
    <>
      <h3 className="mb-1 mt-8 font-semibold text-fg-strong">Atividade (presença inteligente)</h3>
      <p className="mb-3 text-sm text-fg-muted">
        Fica desligada até você permitir. O app só reconhece jogos de uma lista conhecida pelo nome do processo; nunca lê títulos de janelas, sites, documentos ou o que você digita.
      </p>
      <Toggle
        label="Permitir mostrar minha atividade"
        desc={desktop ? 'Libera a detecção automática no app para computador. Você escolhe abaixo o que aparece.' : 'A detecção automática só existe no app para computador.'}
        checked={on}
        disabled={!desktop}
        onChange={(v) => setPrefs({ activityConsent: v, ...(v ? { presencePaused: false } : {}) })}
      />
      <div className={clsx('ml-4 border-l border-line/10 pl-4', !on && 'pointer-events-none opacity-45')}>
        <Toggle label="Mostrar o jogo que estou jogando" desc="Ex.: “Jogando VALORANT” no perfil, na lista de membros e na call." checked={p.shareGame} disabled={!on} onChange={(v) => setPrefs({ shareGame: v })} />
        <Toggle label="Mostrar a música que estou ouvindo" desc="“Ouvindo…” com a música tocando no PC (Spotify, YouTube no navegador e outros)." checked={p.shareMusic} disabled={!on} onChange={(v) => setPrefs({ shareMusic: v })} />
        <Toggle label="Pausar toda a atividade" desc="Esconde tudo agora sem perder suas escolhas." checked={p.presencePaused} disabled={!on} onChange={(v) => setPrefs({ presencePaused: v })} />
        {game && !p.ignoredGames.includes(game.name) && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line/[0.07] bg-line/[0.03] p-3 text-sm">
            <span className="flex-1 text-fg">
              Detectado agora: <b className="text-fg-strong">{game.name}</b>
            </span>
            <button className="btn-secondary h-8 px-3 text-xs" onClick={() => setPrefs({ ignoredGames: [...p.ignoredGames, game.name] })}>
              Nunca mostrar este jogo
            </button>
          </div>
        )}
        {p.ignoredGames.length > 0 && (
          <div className="mb-4">
            <div className="label">Jogos que nunca aparecem</div>
            <div className="flex flex-wrap gap-2">
              {p.ignoredGames.map((g) => (
                <button key={g} className="flex items-center gap-1.5 rounded-full bg-line/[0.07] py-1 pl-3 pr-2 text-xs text-fg hover:bg-line/[0.12]" onClick={() => setPrefs({ ignoredGames: p.ignoredGames.filter((x) => x !== g) })} title="Voltar a mostrar">
                  {g} <Icon name="x" size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function useGameNow() {
  const [g, setG] = useState<{ name: string; startedAt: number } | null>(null);
  useEffect(() => {
    if (!desktop) return;
    void desktop.getGame().then(setG);
    return desktop.onGame(setG);
  }, []);
  return g;
}

function PrivacyTab() {
  const me = useStore((s) => s.me)!;
  const blocked = useStoreShallow((s) => Object.values(s.relationships).filter((r) => r.type === 'blocked'));
  const patch = (data: Partial<SelfUser>) => api('PATCH', '/users/@me', data).catch(toastError);
  return (
    <>
      <SettingsTitle>Privacidade e segurança</SettingsTitle>
      <div className="label">Quem pode enviar mensagens diretas</div>
      <div className="mb-6 flex flex-col gap-2">
        {(
          [
            ['everyone', 'Todos'],
            ['server_members', 'Membros de servidores em comum e amigos'],
            ['friends', 'Somente amigos'],
          ] as const
        ).map(([v, l]) => (
          <label key={v} className={clsx('flex cursor-pointer items-center gap-3 rounded p-3', me.allowDmsFrom === v ? 'bg-fg/15' : 'bg-bg-side hover:bg-fg/10')}>
            <input type="radio" className="accent-brand" checked={me.allowDmsFrom === v} onChange={() => patch({ allowDmsFrom: v })} />
            <span className="text-fg-strong">{l}</span>
          </label>
        ))}
      </div>
      <Toggle label="Permitir solicitações de amizade" desc="Quando desativado, ninguém poderá te enviar novas solicitações." checked={me.allowFriendRequests} onChange={(v) => patch({ allowFriendRequests: v })} />
      <ActivityPrivacy />
      <h3 className="mb-2 mt-8 font-semibold text-fg-strong">Usuários bloqueados ({blocked.length})</h3>
      {blocked.map((b) => (
        <div key={b.userId} className="flex items-center gap-3 border-b border-line/5 py-2">
          <Avatar userId={b.userId} size={32} />
          <span className="flex-1 text-fg-strong">{b.user.displayName}</span>
          <button className="btn-secondary py-1" onClick={() => api('DELETE', `/relationships/${b.userId}`).catch(toastError)}>
            Desbloquear
          </button>
        </div>
      ))}
      {!blocked.length && <p className="text-sm text-fg-muted">Você não bloqueou ninguém.</p>}
    </>
  );
}

interface SessionInfo {
  id: string;
  deviceName: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

function DevicesTab() {
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const load = () => api<SessionInfo[]>('GET', '/auth/sessions').then(setList, toastError);
  useEffect(() => void load(), []);
  return (
    <>
      <SettingsTitle>Dispositivos</SettingsTitle>
      <p className="mb-4 text-sm text-fg-muted">Estas são as sessões conectadas à sua conta. Encerre as que você não reconhece.</p>
      {list?.map((s) => (
        <div key={s.id} className="flex items-center gap-4 border-b border-line/5 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-rail text-fg-muted">{s.deviceName.includes('Desktop') ? '🖥️' : '🌐'}</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-fg-strong">
              {s.deviceName} {s.current && <span className="ml-1 rounded bg-ok/20 px-1.5 text-xs text-ok">Esta sessão</span>}
            </div>
            <div className="truncate text-xs text-fg-muted">
              {s.ip} · último uso {new Date(s.lastUsedAt).toLocaleString('pt-BR')}
            </div>
          </div>
          {!s.current && (
            <button className="btn-secondary py-1" onClick={() => api('DELETE', `/auth/sessions/${s.id}`).then(load, toastError)}>
              Encerrar
            </button>
          )}
        </div>
      ))}
    </>
  );
}

function AppearanceTab() {
  const p = usePrefs();
  const me = useStore((s) => s.me);
  return (
    <>
      <SettingsTitle>Aparência</SettingsTitle>
      <div className="card divide-y divide-line/[0.06] px-5">
        <SettingRow icon="palette" tint="text-brand bg-brand/15" title="Cor de destaque" desc={`${ACCENTS[p.accent].label} · usada em botões, destaques, brilhos e na Live Island.`}>
          <div className="flex gap-2.5">
            {(Object.keys(ACCENTS) as AccentName[]).map((k) => {
              const a = ACCENTS[k];
              const on = p.accent === k;
              return (
                <motion.button
                  key={k}
                  title={a.label}
                  aria-label={a.label}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring.snappy}
                  onClick={() => setPrefs({ accent: k })}
                  className={clsx('flex h-9 w-9 items-center justify-center rounded-full text-white', on && 'ring-2 ring-white/80 ring-offset-2 ring-offset-bg-main')}
                  style={{ background: `linear-gradient(135deg, rgb(${a.a.join(',')}), rgb(${a.b.join(',')}))`, boxShadow: on ? `0 0 22px rgb(${a.a.join(',')} / .6)` : undefined }}
                >
                  {on && <Icon name="check" size={16} strokeWidth={3} />}
                </motion.button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow icon="globe" tint="text-sky-400 bg-sky-400/15" title="Tema" desc="Escuro é o padrão. O claro acompanha a cor de destaque.">
          <Segmented id="theme" value={p.theme} onChange={(v) => setPrefs({ theme: v })} options={[['dark', 'Escuro'], ['light', 'Claro'], ['system', 'Sistema']]} />
        </SettingRow>
        <SettingRow icon="screen" tint="text-fg bg-line/10" title="Modo preto total" desc="Fundo 100% preto. Fica lindo em telas OLED.">
          <Switch checked={p.oled} onChange={(v) => setPrefs({ oled: v })} />
        </SettingRow>
        <SettingRow icon="star" tint="text-amber-400 bg-amber-400/15" title="Luz que segue o cursor" desc="Brilho suave nos itens sob o mouse.">
          <Switch checked={p.cursorLight} onChange={(v) => setPrefs({ cursorLight: v })} />
        </SettingRow>
        <SettingRow icon="star" tint="text-brand bg-brand/15" title="Live Island abre ao passar o mouse" desc="Desligado: só abre com um clique. Arraste a alça embaixo da ilha aberta para mudar o tamanho.">
          <Switch checked={p.islandHover} onChange={(v) => setPrefs({ islandHover: v })} />
        </SettingRow>
        <SettingRow icon="star" tint="text-violet-400 bg-violet-400/15" title="Abertura Signature" desc="A logo se monta, solta ondas e voa até o botão de início. Pule com qualquer tecla ou clique. Nunca toca com “reduzir movimento”.">
          <Segmented id="intro" value={p.introMode ?? (p.introAnimation ? 'always' : 'off')} onChange={(v) => setPrefs({ introMode: v, introAnimation: v !== 'off' })} options={[['always', 'Sempre'], ['version', 'Só em versão nova'], ['off', 'Desligada']]} />
        </SettingRow>
        <SettingRow icon="volume" tint="text-emerald-400 bg-emerald-400/15" title="Sons da interface" desc="Entrar/sair da voz, mudo e mensagens. Chamadas recebidas sempre tocam.">
          <Switch checked={p.uiSounds} onChange={(v) => setPrefs({ uiSounds: v })} />
        </SettingRow>
      </div>

      <h3 className="mb-3 mt-8 text-lg font-extrabold tracking-tight text-fg-strong">Fluidez</h3>
      <div className="card divide-y divide-line/[0.06] px-5">
        <SettingRow icon="signal" tint="text-brand bg-brand/15" title="Movimento (UltraMotion 4.0)" desc="Cinema: tudo, com luz ambiente e transições completas. Equilibrado (padrão): mesmas interações, menos loops e brilhos. Econômico: fundos parados, só avatar e presença — tudo continua funcionando. Reduzido: sem transições espaciais, só o feedback de estado.">
          <Segmented
            id="motion"
            value={p.reduceMotion ? 'reduced' : p.motion}
            onChange={(v) => (v === 'reduced' ? setPrefs({ reduceMotion: true }) : setPrefs({ reduceMotion: false, motion: v }))}
            options={[['ultra', 'Cinema'], ['balanced', 'Equilibrado'], ['performance', 'Econômico'], ['reduced', 'Reduzido']]}
          />
        </SettingRow>
        <RefreshRateRow />
        <PerfRow />
      </div>
      <h3 className="mb-3 mt-8 text-lg font-extrabold tracking-tight text-fg-strong">Espaço e densidade</h3>
      <div className="card divide-y divide-line/[0.06] px-5">
        <SettingRow icon="chat" tint="text-sky-400 bg-sky-400/15" title="Densidade do chat" desc="Compacto cabe mais mensagens na tela; Espaçoso dá mais respiro.">
          <Segmented id="density" value={p.density} onChange={(v) => setPrefs({ density: v })} options={[['compact', 'Compacto'], ['cozy', 'Padrão'], ['spacious', 'Espaçoso']]} />
        </SettingRow>
        <SettingRow icon="sidebar" tint="text-violet-400 bg-violet-400/15" title="Largura das colunas" desc="Arraste a borda da barra lateral ou do painel do chat. Duplo clique na borda volta ao tamanho padrão.">
          <button className="btn-secondary" onClick={() => me && setPrefs({ panelWidths: { ...p.panelWidths, [me.id]: {} } })}>
            Restaurar larguras
          </button>
        </SettingRow>
        <SettingRow icon="focus" tint="text-brand bg-brand/15" title="Modo foco" desc="Esconde a barra de servidores e os painéis laterais para dar prioridade ao chat ou à call. Nada é desconectado. Atalho: Ctrl+Shift+F.">
          <Switch checked={p.focusMode} onChange={(v) => setPrefs({ focusMode: v })} />
        </SettingRow>
        <SettingRow icon="palette" tint="text-emerald-400 bg-emerald-400/15" title="Efeitos animados dos servidores" desc="Banners animados, entradas e efeitos que os donos configuram no Worlds. Desligue para ver tudo estático.">
          <Switch checked={p.serverEffects} onChange={(v) => setPrefs({ serverEffects: v })} />
        </SettingRow>
      </div>

      <div className="label mt-8">Tamanho da fonte do chat: {p.fontSize}px</div>
      <input type="range" min={12} max={20} value={p.fontSize} className="mb-6 w-full accent-brand" onChange={(e) => setPrefs({ fontSize: +e.target.value })} />
    </>
  );
}

function SettingRow({ icon, tint, title, desc, children }: { icon: Parameters<typeof Icon>[0]['name']; tint: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <span className={clsx('tile h-11 w-11', tint)}>
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-fg-strong">{title}</div>
        <div className="text-sm text-fg-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Measures the real presentation rate with requestAnimationFrame (median of ~1s of frames). */
function RefreshRateRow() {
  const [hz, setHz] = useState<number | null>(null);
  const [frame, setFrame] = useState<number | null>(null);
  const measure = () => {
    setHz(null);
    const times: number[] = [];
    let last = 0;
    const tick = (t: number) => {
      if (last) times.push(t - last);
      last = t;
      if (times.length < 120) requestAnimationFrame(tick);
      else {
        const sorted = times.sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)]!;
        setFrame(med);
        setHz(Math.round(1000 / med));
      }
    };
    requestAnimationFrame(tick);
  };
  useEffect(measure, []);
  return (
    <div className="flex items-center gap-4 py-4">
      <span className="tile h-11 w-11 bg-ok/15 text-ok">
        <Icon name="screen" size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-fg-strong">Taxa de atualização medida</div>
        <div className="text-sm text-fg-muted">As animações rodam no ritmo real da sua tela, sem limite fixo de 60 FPS. Medição feita agora pelo navegador/app.</div>
      </div>
      <button onClick={measure} className="shrink-0 rounded-xl border border-line/[0.08] bg-line/[0.03] px-4 py-2 text-right transition-transform active:scale-95" title="Medir de novo">
        <div className="grad-text text-2xl font-extrabold tabular-nums leading-none">{hz ? `${hz} Hz` : '…'}</div>
        <div className="mt-1 text-[11px] text-fg-faint">{frame ? `${frame.toFixed(1)} ms por quadro` : 'medindo'}</div>
      </button>
    </div>
  );
}

/** Real numbers from lib/perf (sampled frames + Event Timing). */
function PerfRow() {
  const pf = usePerf();
  return (
    <div className="flex items-center gap-4 py-4">
      <span className={clsx('tile h-11 w-11', pf.level !== 'normal' ? 'bg-warn/15 text-warn' : 'bg-sky-400/15 text-sky-400')}>
        <Icon name="zap" size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-fg-strong">Fluidez agora</div>
        <div className="text-sm text-fg-muted">
          {pf.level === 'high' ? 'PC sob carga: efeitos decorativos parados (como no Econômico) até aliviar.' : pf.level === 'mid' ? 'Alguns quadros perdidos: menos loops e brilhos por enquanto (como no Equilibrado).' : 'Medido a cada 20 segundos enquanto o app está aberto. Voz e vídeo nunca são reduzidos por isso.'}
        </div>
      </div>
      <div className="shrink-0 text-right text-[12px] tabular-nums text-fg-muted">
        <div>
          Quadros perdidos: <b className={clsx(pf.droppedPct != null && pf.droppedPct >= 25 ? 'text-warn' : 'text-fg-strong')}>{pf.droppedPct == null ? '—' : `${pf.droppedPct}%`}</b>
        </div>
        <div>
          Quadro p95: <b className="text-fg-strong">{pf.p95 ? `${pf.p95} ms` : '—'}</b>
        </div>
        <div>
          Resposta ao toque (p75): <b className="text-fg-strong">{pf.inputP75 ? `${pf.inputP75} ms` : '—'}</b>
        </div>
      </div>
    </div>
  );
}

function A11yTab() {
  const p = usePrefs();
  return (
    <>
      <SettingsTitle>Acessibilidade</SettingsTitle>
      <Toggle label="Reduzir movimento" desc="Desativa animações e transições da interface." checked={p.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
      <div className="label mt-6">Escala da fonte: {p.fontSize}px</div>
      <input type="range" min={12} max={20} value={p.fontSize} className="w-full accent-brand" onChange={(e) => setPrefs({ fontSize: +e.target.value })} />
    </>
  );
}

function VoiceTab() {
  const p = usePrefs();
  const devices = useDevices();
  const [cam, setCam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!cam) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: p.videoDeviceId ? { exact: p.videoDeviceId } : undefined, width: 1280, height: 720 } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => {
        toastError(e);
        setCam(false);
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [cam, p.videoDeviceId]);

  const select = (kind: MediaDeviceKind, value: string, onChange: (v: string) => void) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {kind !== 'videoinput' && <option value="default">Padrão</option>}
      {devices
        .filter((d) => d.kind === kind && d.deviceId !== 'default')
        .map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${kind} ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
    </select>
  );

  const [bindingKey, setBindingKey] = useState(false);
  useEffect(() => {
    if (!bindingKey) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      setPrefs({ pttKey: e.code });
      setBindingKey(false);
    };
    window.addEventListener('keydown', h, { once: true });
    return () => window.removeEventListener('keydown', h);
  }, [bindingKey]);

  return (
    <>
      <SettingsTitle>Voz e vídeo</SettingsTitle>
      <ConnectionTest />
      <div className="mb-6">
        <div className="label">Reações nas calls</div>
        <Toggle label="Mostrar reações" desc="Corações, risadas, aplausos… que o pessoal manda durante a call (Alt+1…8). Sem som." checked={p.reactionsEnabled} onChange={(v) => setPrefs({ reactionsEnabled: v })} />
        <Toggle label="Mostrar reações por cima das transmissões" desc="Aparecem discretas no canto do vídeo. Desligue para assistir sem nada na tela." checked={p.reactionsOverStreams} disabled={!p.reactionsEnabled} onChange={(v) => setPrefs({ reactionsOverStreams: v })} />
      </div>
      <AudioCenter />

      <div className="label mt-8">Modo de entrada</div>
      {(
        [
          ['vad', 'Detecção de voz (microfone aberto, indicador de quem fala)'],
          ['ptt', 'Aperte para falar'],
        ] as const
      ).map(([v, l]) => (
        <label key={v} className={clsx('mb-2 flex cursor-pointer items-center gap-3 rounded p-3', p.voiceMode === v ? 'bg-fg/15' : 'bg-bg-side hover:bg-fg/10')}>
          <input type="radio" className="accent-brand" checked={p.voiceMode === v} onChange={() => (setPrefs({ voiceMode: v }), void onVoiceModeChanged())} />
          <span className="text-fg-strong">{l}</span>
        </label>
      ))}
      {p.voiceMode === 'ptt' && (
        <div className="mt-2 flex items-center gap-4">
          <div>
            <div className="label">Tecla</div>
            <button className="btn-secondary min-w-[140px]" onClick={() => setBindingKey(true)}>
              {bindingKey ? 'Pressione uma tecla…' : p.pttKey}
            </button>
          </div>
          <div className="flex-1">
            <div className="label">Atraso ao soltar: {p.pttReleaseDelay} ms</div>
            <input type="range" min={0} max={1000} step={20} value={p.pttReleaseDelay} className="w-full accent-brand" onChange={(e) => setPrefs({ pttReleaseDelay: +e.target.value })} />
          </div>
        </div>
      )}
      {p.voiceMode === 'ptt' && !desktop && <p className="mt-2 text-xs text-fg-faint">No navegador, o aperte-para-falar só funciona com a janela do Aldetes em foco. No app desktop ele funciona globalmente.</p>}

      <div className="label mt-8">Processamento de voz</div>
      <Toggle label="Supressão de ruído" desc="Usa a supressão de ruído nativa do WebRTC (navegador/Electron)." checked={p.noiseSuppression} onChange={(v) => (setPrefs({ noiseSuppression: v }), void restartMic())} />
      <Toggle label="Cancelamento de eco" checked={p.echoCancellation} onChange={(v) => (setPrefs({ echoCancellation: v }), void restartMic())} />
      <Toggle label="Controle automático de ganho" checked={p.autoGainControl} onChange={(v) => (setPrefs({ autoGainControl: v }), void restartMic())} />

      <div className="label mt-8">Câmera</div>
      <div className="grid grid-cols-2 gap-4">
        {select('videoinput', p.videoDeviceId, (v) => setPrefs({ videoDeviceId: v }))}
        <button className="btn-primary" onClick={() => setCam(!cam)}>
          {cam ? 'Parar pré-visualização' : 'Testar vídeo'}
        </button>
      </div>
      <div className="mt-3 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-bg-rail">
        {cam ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" /> : <span className="text-fg-faint">Pré-visualização desligada</span>}
      </div>
    </>
  );
}

function NotificationsTab() {
  const p = usePrefs();
  return (
    <>
      <SettingsTitle>Notificações</SettingsTitle>
      <Toggle
        label="Ativar notificações na área de trabalho"
        desc="Para mensagens diretas e menções a você."
        checked={p.desktopNotifications}
        onChange={async (v) => {
          if (v && !(await requestNotificationPermission())) return toast('Permissão de notificação negada pelo navegador.', 'error');
          setPrefs({ desktopNotifications: v });
        }}
      />
      <Toggle label="Sons de notificação" checked={p.notificationSounds} onChange={(v) => setPrefs({ notificationSounds: v })} />
      <p className="mt-4 text-sm text-fg-muted">No status "Não perturbe", nenhuma notificação é exibida.</p>
    </>
  );
}

function KeybindsTab() {
  const rows: Array<[string, string]> = [
    ['Ctrl + K', 'Troca rápida de canais/conversas'],
    ['Ctrl + Shift + M', 'Silenciar/ativar microfone'],
    ['Ctrl + Shift + D', 'Ensurdecer/desensurdecer'],
    [usePrefs.getState().pttKey, 'Aperte para falar (quando ativado)'],
    ['Enter', 'Enviar mensagem'],
    ['Shift + Enter', 'Nova linha'],
    ['Esc', 'Fechar modal / cancelar resposta ou edição'],
    ['Duplo clique no vídeo', 'Tela cheia'],
  ];
  return (
    <>
      <SettingsTitle>Atalhos de teclado</SettingsTitle>
      {rows.map(([k, d]) => (
        <div key={d} className="flex items-center justify-between border-b border-line/5 py-3">
          <span className="text-fg">{d}</span>
          <kbd className="rounded bg-bg-rail px-2 py-1 font-mono text-sm text-fg-strong">{k}</kbd>
        </div>
      ))}
    </>
  );
}

function DesktopTab() {
  const [ds, setDs] = useState<DesktopSettings | null>(null);
  useEffect(() => void desktop?.getDesktopSettings().then(setDs), []);
  if (!ds) return null;
  const os = desktop!.platform === 'win32' ? 'Windows' : desktop!.platform === 'darwin' ? 'macOS' : 'sistema';
  const patch = (p: Partial<DesktopSettings>) => desktop!.setDesktopSettings(p).then(setDs, toastError);
  return (
    <>
      <SettingsTitle>Aplicativo no {os}</SettingsTitle>
      <div className="card divide-y divide-line/[0.06] px-5">
        <SettingRow icon="logout" tint="text-brand bg-brand/15" title={`Iniciar com o ${os}`} desc="O Aldetes abre sozinho quando você liga o computador e já fica conectado.">
          <Switch checked={ds.autoStart} onChange={(v) => patch({ autoStart: v })} />
        </SettingRow>
        <SettingRow icon="inbox" tint="text-sky-400 bg-sky-400/15" title="Iniciar minimizado" desc="Ao iniciar com o sistema, fica só na bandeja, perto do relógio, sem abrir a janela.">
          <Switch checked={ds.startHidden} onChange={(v) => patch({ startHidden: v })} />
        </SettingRow>
        <SettingRow icon="x" tint="text-fg bg-line/10" title="Fechar para a bandeja" desc="O X minimiza para a bandeja e você continua recebendo mensagens e chamadas. Para sair de vez, use “Sair” no ícone da bandeja.">
          <Switch checked={ds.minimizeToTray} onChange={(v) => patch({ minimizeToTray: v })} />
        </SettingRow>
        <SettingRow icon="star" tint="text-amber-400 bg-amber-400/15" title="Live Island flutuante" desc="Quando o Aldetes não estiver em foco, a ilha aparece com a call e a música e dá para controlar sem abrir o app. Clicar nela nunca tira o foco do jogo.">
          <Switch checked={ds.floatingIsland} onChange={(v) => patch({ floatingIsland: v })} />
        </SettingRow>
        {ds.islandOverFullscreen !== undefined && (
          <SettingRow icon="screen" tint="text-violet-400 bg-violet-400/15" title="Ilha por cima de jogos em tela cheia" desc="Arraste a ilha pela superfície para qualquer lugar; ela gruda no topo, nos cantos e nas bordas. Se algum jogo em tela cheia exclusiva piscar ou perder o foco, desligue: a ilha fica só sobre janelas normais.">
            <Switch checked={ds.islandOverFullscreen} disabled={!ds.floatingIsland} onChange={(v) => patch({ islandOverFullscreen: v })} />
          </SettingRow>
        )}
      </div>
      <p className="mt-4 text-sm text-fg-muted">Sua sessão fica salva com a criptografia do sistema e se renova sozinha enquanto você usar o app, então não precisa entrar de novo.</p>
    </>
  );
}

function AboutTab() {
  const [upd, setUpd] = useState<string | null>(null);
  return (
    <>
      <SettingsTitle>Sobre o Aldetes</SettingsTitle>
      <p className="text-fg">Aldetes — plataforma de comunicação de código aberto e auto-hospedável.</p>
      <p className="mt-2 text-sm text-fg-muted">
        Versão: {runningVersion()} {desktop ? `· Desktop ${desktop.version} (${desktop.platform})` : '· Web'}
      </p>
      {desktop && (
        <button
          className="btn-primary mt-4"
          onClick={async () => {
            const r = await desktop!.checkForUpdates();
            setUpd(r.error ? `Erro: ${r.error}` : r.available ? (desktop!.onUpdate ? `Nova versão ${r.version} encontrada!` : `Nova versão ${r.version} disponível — será instalada ao reiniciar.`) : 'Você está na versão mais recente.');
          }}
        >
          Verificar atualizações
        </button>
      )}
      {upd && <p className="mt-2 text-sm text-fg">{upd}</p>}
      <div className="mt-6 flex gap-2">
        <button className="btn-secondary" onClick={() => openWhatsNew(false)}>
          Ver novidades
        </button>
        <button className="btn-ghost" onClick={() => openWhatsNew(true)}>
          Histórico de versões
        </button>
      </div>
    </>
  );
}
