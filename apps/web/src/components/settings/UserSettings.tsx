import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useStore, set as setStore, initialState, useStoreShallow } from '@/store';
import { api, upload, setSessionToken } from '@/lib/api';
import { usePrefs, setPrefs } from '@/lib/prefs';
import { SettingsLayout, SettingsTitle, Toggle } from './SettingsLayout';
import { Avatar, colorFor } from '../common/Avatar';
import { toastError, toast, confirmDialog } from '../common/overlay';
import { applyDevicePrefs, restartMic, onVoiceModeChanged, leaveVoice } from '@/lib/voice';
import { requestNotificationPermission } from '@/lib/notify';
import { desktop } from '@/lib/desktop';
import { disconnectGateway } from '@/lib/gateway';
import type { SelfUser } from '@aldetes/shared';

export function UserSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState('account');
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
      toast('Imagem atualizada', 'success');
    } catch (e) {
      toastError(e);
    }
  };
  const dirty = form.displayName !== me.displayName || form.bio !== me.bio || form.accentColor !== (me.accentColor ?? '#6c5ce7');
  return (
    <>
      <SettingsTitle>Perfil</SettingsTitle>
      <div className="flex gap-8">
        <div className="flex-1 space-y-5">
          <div>
            <label className="label">Nome de exibição</label>
            <input className="input" maxLength={32} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <label className="label">Avatar</label>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => avatarInput.current?.click()}>
                Alterar avatar
              </button>
              {me.avatarUrl && (
                <button className="btn-ghost" onClick={() => api('DELETE', '/users/@me/avatar').catch(toastError)}>
                  Remover
                </button>
              )}
            </div>
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('avatar', e.target.files[0])} />
          </div>
          <div>
            <label className="label">Banner do perfil</label>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => bannerInput.current?.click()}>
                Alterar banner
              </button>
              {me.bannerUrl && (
                <button className="btn-ghost" onClick={() => api('DELETE', '/users/@me/banner').catch(toastError)}>
                  Remover
                </button>
              )}
            </div>
            <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadImg('banner', e.target.files[0])} />
          </div>
          <div>
            <label className="label">Cor de destaque</label>
            <input type="color" className="h-10 w-20 cursor-pointer rounded bg-transparent" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
          </div>
          <div>
            <label className="label">Sobre mim</label>
            <textarea className="input min-h-[100px]" maxLength={190} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <div className="text-right text-xs text-fg-faint">{190 - form.bio.length}</div>
          </div>
        </div>
        <div className="w-72">
          <div className="label">Pré-visualização</div>
          <div className="overflow-hidden rounded-lg bg-bg-float shadow-lg">
            <div className="h-16" style={{ background: me.bannerUrl ? `center/cover url(${me.bannerUrl})` : form.accentColor }} />
            <div className="px-4 pb-4">
              <div className="-mt-9 mb-2 w-fit rounded-full border-[5px] border-bg-float">
                <Avatar userId={me.id} size={72} showStatus />
              </div>
              <div className="text-lg font-bold text-fg-strong">{form.displayName || me.username}</div>
              <div className="text-sm text-fg-muted">{me.username}</div>
              {form.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{form.bio}</p>}
            </div>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-lg bg-bg-rail p-3 shadow-xl">
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
      <div className="label">Tema</div>
      <div className="mb-6 flex gap-4">
        {(
          [
            ['dark', 'Escuro', '#2e2f38'],
            ['light', 'Claro', '#ffffff'],
            ['system', 'Sistema', 'linear-gradient(135deg,#fff 50%,#2e2f38 50%)'],
          ] as const
        ).map(([v, l, bg]) => (
          <button key={v} onClick={() => setPrefs({ theme: v })} className="text-center">
            <span className={clsx('block h-14 w-14 rounded-full border-2', p.theme === v ? 'border-brand ring-2 ring-brand' : 'border-line/20')} style={{ background: bg }} />
            <span className="mt-1 block text-sm text-fg">{l}</span>
          </button>
        ))}
      </div>
      <div className="label">Tamanho da fonte do chat: {p.fontSize}px</div>
      <input type="range" min={12} max={20} value={p.fontSize} className="mb-6 w-full accent-brand" onChange={(e) => setPrefs({ fontSize: +e.target.value })} />
    </>
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
            setUpd(r.error ? `Erro: ${r.error}` : r.available ? `Nova versão ${r.version} disponível — será instalada ao reiniciar.` : 'Você está na versão mais recente.');
          }}
        >
          Verificar atualizações
        </button>
      )}
      {upd && <p className="mt-2 text-sm text-fg">{upd}</p>}
    </>
  );
}
