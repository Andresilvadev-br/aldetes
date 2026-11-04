import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useStore, set as setStore, initialState, useStoreShallow } from '@/store';
import { api, upload, setSessionToken } from '@/lib/api';
import { usePrefs, setPrefs, ACCENTS, type AccentName } from '@/lib/prefs';
import { motion } from 'motion/react';
import { spring } from '@/lib/motion';
import { Icon } from '../common/Icon';
import { ConnectionTest } from './ConnectionTest';
import { BANNERS, EFFECTS, ProfileBanner, ProfileEffect } from '../profile/Cosmetics';
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
    if (!(await confirmDialog({ title: 'Sair', body: 'Tem certeza de que deseja sair?', confirm: 'Sair', danger: true }))) return;
    await leaveVoice();
    await api('POST', '/auth/logout').catch(() => {});
    await setSessionToken(null);
    disconnectGateway();
    setStore({ ...initialState, status: 'unauthenticated' });
    onClose();
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

function ProfileTab() {
  const me = useStore((s) => s.me)!;
  const [form, setForm] = useState({ displayName: me.displayName, bio: me.bio, accentColor: me.accentColor ?? '#6c5ce7' });
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const uploadImg = async (kind: 'avatar' | 'banner', f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      await upload(`/users/@me/${kind}`, fd);
      if (kind === 'banner' && me.bannerPreset) await api('PATCH', '/users/@me', { bannerPreset: null });
      toast(kind === 'avatar' ? 'Avatar atualizado' : 'Banner atualizado', 'success');
    } catch (e) {
      toastError(e);
    }
  };
  const patch = (data: Record<string, unknown>) => api('PATCH', '/users/@me', data).catch(toastError);
  const dirty = form.displayName !== me.displayName || form.bio !== me.bio || form.accentColor !== (me.accentColor ?? '#6c5ce7');
  const preview = { ...me, ...form };
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
              <input className="input" maxLength={32} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('avatar', e.target.files[0])} />
          </div>
          {me.avatarUrl && (
            <button className="-mt-5 text-xs text-fg-muted hover:text-danger" onClick={() => api('DELETE', '/users/@me/avatar').catch(toastError)}>
              Remover avatar
            </button>
          )}

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <div className="label !mb-0.5">Banner</div>
                <div className="text-xs text-fg-muted">Animados exclusivos do Aldetes, ou envie uma imagem/GIF seu.</div>
              </div>
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => bannerInput.current?.click()}>
                <Icon name="upload" size={14} /> Enviar imagem/GIF
              </button>
              <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('banner', e.target.files[0])} />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <PickTile active={!me.bannerPreset} label={me.bannerUrl ? 'Minha imagem' : 'Cor do perfil'} onClick={() => patch({ bannerPreset: null })}>
                <ProfileBanner user={{ ...me, bannerPreset: null, accentColor: form.accentColor }} height={64} />
              </PickTile>
              {Object.entries(BANNERS).map(([id, b]) => (
                <PickTile key={id} active={me.bannerPreset === id} label={b.label} tag={b.tag} onClick={() => patch({ bannerPreset: id })}>
                  <ProfileBanner user={{ ...me, bannerPreset: id }} height={64} />
                </PickTile>
              ))}
            </div>
          </div>

          <div>
            <div className="label !mb-0.5">Efeito do perfil</div>
            <div className="mb-2 text-xs text-fg-muted">Aparece por cima do seu cartão quando alguém abre o seu perfil.</div>
            <div className="grid grid-cols-3 gap-2.5">
              <PickTile active={!me.profileEffect} label="Nenhum" onClick={() => patch({ profileEffect: null })}>
                <div className="h-16 bg-line/[0.04]" />
              </PickTile>
              {Object.entries(EFFECTS).map(([id, fx]) => (
                <PickTile key={id} active={me.profileEffect === id} label={fx.label} onClick={() => patch({ profileEffect: id })}>
                  <div className="relative h-16 overflow-hidden bg-bg-float">
                    <ProfileEffect id={id} behind />
                    <ProfileEffect id={id} />
                  </div>
                </PickTile>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Cor do perfil</label>
            <input type="color" className="h-10 w-20 cursor-pointer rounded bg-transparent" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
          </div>
          <div>
            <label className="label">Sobre mim</label>
            <textarea className="input min-h-[100px]" maxLength={190} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <div className="text-right text-xs text-fg-faint">{190 - form.bio.length}</div>
          </div>
        </div>

        <div className="w-[300px] shrink-0">
          <div className="sticky top-0">
            <div className="label">Pré-visualização</div>
            <div className="relative overflow-hidden rounded-3xl border border-line/[0.08] bg-bg-float shadow-float">
              <ProfileEffect id={me.profileEffect} behind />
              <div className="relative">
                <ProfileBanner user={preview} height={100} />
                <div className="px-4 pb-5">
                  <div className="-mt-10 mb-2 w-fit rounded-full border-[6px] border-bg-float">
                    <Avatar userId={me.id} size={76} showStatus />
                  </div>
                  <div className="text-xl font-extrabold tracking-tight text-fg-strong">{form.displayName || me.username}</div>
                  <div className="text-sm text-fg-muted">{me.username}</div>
                  {form.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{form.bio}</p>}
                </div>
              </div>
              <ProfileEffect id={me.profileEffect} />
            </div>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-2xl border border-line/[0.08] bg-bg-rail p-3 shadow-float">
          <span className="text-sm text-fg">Cuidado — você tem alterações não salvas!</span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setForm({ displayName: me.displayName, bio: me.bio, accentColor: me.accentColor ?? '#6c5ce7' })}>
              Redefinir
            </button>
            <button className="btn bg-ok text-white hover:bg-ok/80" onClick={() => api('PATCH', '/users/@me', form).then(() => toast('Perfil salvo', 'success'), toastError)}>
              Salvar alterações
            </button>
          </div>
        </div>
      )}
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
  return (
    <>
      <Toggle label="Mostrar o jogo que estou jogando" desc={desktop ? 'O app reconhece jogos abertos (VALORANT, LoL, CS2, Fortnite, Minecraft e outros) e mostra “Jogando…” no seu perfil.' : 'Disponível no app para computador.'} checked={p.shareGame} disabled={!desktop} onChange={(v) => setPrefs({ shareGame: v })} />
      <Toggle label="Mostrar a música que estou ouvindo" desc={desktop ? 'Mostra “Ouvindo…” com a música tocando no PC (Spotify, YouTube no navegador e outros).' : 'Disponível no app para computador.'} checked={p.shareMusic} disabled={!desktop} onChange={(v) => setPrefs({ shareMusic: v })} />
    </>
  );
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
        <SettingRow icon="star" tint="text-violet-400 bg-violet-400/15" title="Animação de abertura" desc="A logo se monta e o ponto de voz solta ondas sempre que o app abre. Clique para pular.">
          <Switch checked={p.introAnimation} onChange={(v) => setPrefs({ introAnimation: v })} />
        </SettingRow>
        <SettingRow icon="volume" tint="text-emerald-400 bg-emerald-400/15" title="Sons da interface" desc="Entrar/sair da voz, mudo e mensagens. Chamadas recebidas sempre tocam.">
          <Switch checked={p.uiSounds} onChange={(v) => setPrefs({ uiSounds: v })} />
        </SettingRow>
      </div>

      <h3 className="mb-3 mt-8 text-lg font-extrabold tracking-tight text-fg-strong">Fluidez</h3>
      <div className="card divide-y divide-line/[0.06] px-5">
        <SettingRow icon="signal" tint="text-brand bg-brand/15" title="Animações" desc="Ultra: física completa e morphing. Equilibrado: mesmos efeitos, mais econômicos. Desempenho: resposta instantânea, sem animações decorativas.">
          <Segmented id="motion" value={p.motion} onChange={(v) => setPrefs({ motion: v })} options={[['ultra', 'Ultra'], ['balanced', 'Equilibrado'], ['performance', 'Desempenho']]} />
        </SettingRow>
        <RefreshRateRow />
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

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, []);
  return devices;
}

function VoiceTab() {
  const p = usePrefs();
  const devices = useDevices();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [cam, setCam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [recording, setRecording] = useState(false);

  // Mic test: level meter + optional loopback
  useEffect(() => {
    if (!testing) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let audio: HTMLAudioElement | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: p.inputDeviceId !== 'default' ? { exact: p.inputDeviceId } : undefined, noiseSuppression: p.noiseSuppression, echoCancellation: p.echoCancellation, autoGainControl: p.autoGainControl },
        });
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          raf = requestAnimationFrame(tick);
        };
        tick();
        if (recording) {
          audio = new Audio();
          audio.srcObject = stream;
          if (p.outputDeviceId !== 'default') await (audio as any).setSinkId?.(p.outputDeviceId);
          await audio.play();
        }
      } catch (e) {
        toastError(e);
        setTesting(false);
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      audio?.pause();
      setLevel(0);
    };
  }, [testing, recording, p.inputDeviceId, p.outputDeviceId, p.noiseSuppression, p.echoCancellation, p.autoGainControl]);

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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="label">Dispositivo de entrada</div>
          {select('audioinput', p.inputDeviceId, (v) => (setPrefs({ inputDeviceId: v }), void applyDevicePrefs()))}
        </div>
        <div>
          <div className="label">Dispositivo de saída</div>
          {select('audiooutput', p.outputDeviceId, (v) => (setPrefs({ outputDeviceId: v }), void applyDevicePrefs()))}
          {!('setSinkId' in HTMLMediaElement.prototype) && <p className="mt-1 text-xs text-fg-faint">Este navegador não permite escolher a saída de áudio.</p>}
        </div>
      </div>
      <div className="label mt-6">Teste de microfone</div>
      <div className="flex items-center gap-3">
        <button className={testing ? 'btn-secondary' : 'btn-primary'} onClick={() => setTesting(!testing)}>
          {testing ? 'Parar' : 'Vamos checar'}
        </button>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="accent-brand" checked={recording} onChange={(e) => setRecording(e.target.checked)} /> Ouvir meu microfone
        </label>
        <div className="h-2 flex-1 overflow-hidden rounded bg-bg-rail">
          <div className="h-full bg-ok transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
      </div>

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
        <SettingRow icon="star" tint="text-amber-400 bg-amber-400/15" title="Live Island flutuante" desc="Quando o Aldetes não estiver em foco, a ilha aparece no topo da tela com a call e a música, e dá para controlar sem abrir o app.">
          <Switch checked={ds.floatingIsland} onChange={(v) => patch({ floatingIsland: v })} />
        </SettingRow>
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
        Versão do cliente: {import.meta.env.VITE_APP_VERSION ?? '0.1.0'} {desktop ? `· Desktop ${desktop.version} (${desktop.platform})` : '· Web'}
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
    </>
  );
}
