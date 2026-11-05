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
import { IdentityStudio } from '../profile/IdentityStudio';
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
      {tab === 'profile' && <IdentityStudio />}
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
        <SettingRow icon="signal" tint="text-brand bg-brand/15" title="Movimento (UltraMotion 4.0)" desc="Ultra: tudo, com luz ambiente, partículas e transições completas. Equilibrado (padrão): mesmas interações, menos loops, partículas e brilhos. Essencial: banners, molduras e efeitos parados (versão estática), tudo continua funcionando. Reduzido: sem transições espaciais, só o feedback de estado.">
          <Segmented
            id="motion"
            value={p.reduceMotion ? 'reduced' : p.motion}
            onChange={(v) => (v === 'reduced' ? setPrefs({ reduceMotion: true }) : setPrefs({ reduceMotion: false, motion: v }))}
            options={[['ultra', 'Ultra'], ['balanced', 'Equilibrado'], ['performance', 'Essencial'], ['reduced', 'Reduzido']]}
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
          {pf.level === 'high' ? 'PC sob carga: efeitos decorativos parados (como no Essencial) até aliviar.' : pf.level === 'mid' ? 'Alguns quadros perdidos: menos loops e brilhos por enquanto (como no Equilibrado).' : 'Medido a cada 20 segundos enquanto o app está aberto. Voz e vídeo nunca são reduzidos por isso.'}
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
