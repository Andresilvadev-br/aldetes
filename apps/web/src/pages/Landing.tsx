import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Icon, Logo, type IconName } from '@/components/common/Icon';
import { spring } from '@/lib/motion';

/** GitHub repository whose Releases host the desktop installers. */
const REPO = (import.meta.env.VITE_RELEASES_REPO as string | undefined) ?? 'Andresilvadev-br/aldetes';
const dl = (file: string) => `https://github.com/${REPO}/releases/latest/download/${file}`;

export const DOWNLOADS = {
  windows: { file: 'Aldetes-Setup.exe', label: 'Windows', sub: 'Windows 10 e 11 · 64 bits', icon: 'screen' as IconName },
  appimage: { file: 'Aldetes-Linux.AppImage', label: 'Linux (AppImage)', sub: 'Qualquer distribuição · 64 bits', icon: 'file' as IconName },
  deb: { file: 'Aldetes-Linux.deb', label: 'Linux (.deb)', sub: 'Ubuntu, Debian, Mint · 64 bits', icon: 'download' as IconName },
};
type DlKey = keyof typeof DOWNLOADS;

interface ReleaseInfo {
  version: string;
  date: string;
  sizes: Partial<Record<DlKey, number>>;
}

function detectOs(): DlKey {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Ubuntu|Debian|Mint/i.test(ua)) return 'deb';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'appimage';
  return 'windows';
}

function useRelease() {
  const [info, setInfo] = useState<ReleaseInfo | null | 'none'>(null);
  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r: { tag_name: string; published_at: string; assets: Array<{ name: string; size: number }> }) => {
        const sizes: ReleaseInfo['sizes'] = {};
        for (const [k, d] of Object.entries(DOWNLOADS)) {
          const a = r.assets.find((x) => x.name === d.file);
          if (a) sizes[k as DlKey] = a.size;
        }
        setInfo({ version: r.tag_name.replace(/^v/, ''), date: r.published_at, sizes });
      })
      .catch(() => setInfo('none'));
  }, []);
  return info;
}

const mb = (b?: number) => (b ? `${Math.round(b / 1048576)} MB` : '');

export function LandingPage() {
  const os = detectOs();
  const rel = useRelease();
  const main = DOWNLOADS[os];
  const available = (k: DlKey) => rel !== null && rel !== 'none' && !!rel.sizes[k];

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-bg-rail text-fg">
      {/* nav */}
      <nav className="sticky top-0 z-20 border-b border-line/[0.06] bg-bg-rail/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <span className="grad flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
            <Logo size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-fg-strong">Aldetes</span>
          <span className="flex-1" />
          <a href="#download" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg-strong sm:block">
            Download
          </a>
          <a href="#recursos" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg-strong sm:block">
            Recursos
          </a>
          <Link to="/login" className="btn-secondary px-4 py-2">
            Entrar
          </Link>
        </div>
      </nav>

      {/* hero */}
      <header className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgb(var(--brand) / .22), transparent 70%), radial-gradient(40% 40% at 85% 30%, rgb(var(--brand-2) / .14), transparent 70%)' }} />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-line/[0.04] px-3 py-1 text-xs font-semibold text-fg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_rgb(var(--ok))]" /> Grátis · código aberto · servidor próprio
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight text-fg-strong sm:text-6xl">
              Suas calls com <span className="grad-text">a turma</span>, do jeito que tem que ser.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-fg-muted">
              Voz cristalina, vídeo, tela em até 1080p60 e a <b className="text-fg-strong">Live Island</b>: tudo o que acontece na call, numa cápsula que se transforma na hora. Fluido no ritmo do seu monitor.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.08 }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <DownloadButton k={os} big disabled={rel === 'none'} />
            <Link to="/register" className="btn-secondary px-6 py-3.5 text-[15px]">
              <Icon name="globe" size={18} /> Usar no navegador
            </Link>
          </motion.div>
          <p className="mt-3 text-xs text-fg-faint">
            {rel && rel !== 'none' ? `Versão ${rel.version} · ${main.sub}${rel.sizes[os] ? ` · ${mb(rel.sizes[os])}` : ''}` : rel === 'none' ? 'O primeiro instalador está sendo publicado. Enquanto isso, use no navegador.' : main.sub}
          </p>

          <div className="mt-16 flex justify-center">
            <IslandDemo />
          </div>
        </div>
      </header>

      {/* features */}
      <section id="recursos" className="mx-auto max-w-6xl px-6 py-16">
        <div className="eyebrow text-center">Recursos</div>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-fg-strong">Feito pra jogar, conversar e transmitir</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon="mic" tint="bg-ok/15 text-ok" title="Voz cristalina">
            WebRTC com supressão de ruído e eco, volume por pessoa, aperte-para-falar global e reconexão automática.
          </Feature>
          <Feature icon="screen" tint="bg-sky-400/15 text-sky-400" title="Tela em até 1080p60">
            Escolha a tela ou a janela, otimize para movimento ou nitidez e transmita com áudio no Windows.
          </Feature>
          <Feature icon="star" tint="bg-brand/15 text-brand" title="Live Island">
            Call, transmissão, chamadas recebidas e menções numa cápsula viva, com 1 a 3 ações na hora certa.
          </Feature>
          <Feature icon="signal" tint="bg-amber-400/15 text-amber-400" title="Fluido no seu Hz">
            Animações com física de mola que acompanham 60, 144, 165 Hz ou mais — sem limite fixo de quadros.
          </Feature>
          <Feature icon="shield" tint="bg-violet-400/15 text-violet-400" title="Servidores do seu jeito">
            Canais de texto, voz, fórum e anúncios, cargos com cores, permissões por canal e moderação completa.
          </Feature>
          <Feature icon="lock" tint="bg-rose-400/15 text-rose-400" title="Seu servidor, suas regras">
            Auto-hospedado e de código aberto. Suas conversas ficam no seu servidor, sem anúncios.
          </Feature>
        </div>
      </section>

      {/* downloads */}
      <section id="download" className="mx-auto max-w-6xl px-6 pb-24 pt-8">
        <div className="eyebrow text-center">Download</div>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-fg-strong">Baixe o Aldetes</h2>
        <p className="mt-2 text-center text-fg-muted">O app já vem conectado a este servidor. É só instalar e entrar.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(Object.keys(DOWNLOADS) as DlKey[]).map((k, i) => (
            <motion.div
              key={k}
              data-glow
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring.gentle, delay: i * 0.05 }}
              className={clsx('card flex flex-col p-6', k === os && 'border-brand/40 shadow-glow')}
            >
              <div className="flex items-center gap-3">
                <span className={clsx('tile h-12 w-12', k === os ? 'grad text-white' : 'bg-line/[0.07] text-fg-strong')}>
                  <Icon name={DOWNLOADS[k].icon} size={22} />
                </span>
                <div>
                  <div className="font-extrabold text-fg-strong">{DOWNLOADS[k].label}</div>
                  <div className="text-xs text-fg-muted">{DOWNLOADS[k].sub}</div>
                </div>
                {k === os && <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand">seu sistema</span>}
              </div>
              <div className="mt-5 flex-1 text-sm text-fg-muted">
                {k === 'windows' && 'Instalador com atalho no menu Iniciar. Atualiza sozinho quando sair versão nova.'}
                {k === 'appimage' && 'Baixe, dê permissão de execução (chmod +x) e abra. Atualiza sozinho.'}
                {k === 'deb' && 'Instale com duplo clique ou: sudo apt install ./Aldetes-Linux.deb'}
              </div>
              <a
                href={available(k) ? dl(DOWNLOADS[k].file) : undefined}
                aria-disabled={!available(k)}
                className={clsx('mt-5', available(k) ? (k === os ? 'btn-primary' : 'btn-secondary') : 'btn-secondary pointer-events-none opacity-50')}
              >
                <Icon name="download" size={17} />
                {rel === null ? 'Verificando…' : available(k) ? `Baixar ${mb((rel as ReleaseInfo).sizes[k])}` : 'Em breve'}
              </a>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-line/[0.07] bg-line/[0.02] p-5 text-sm text-fg-muted">
          <div className="mb-1 flex items-center gap-2 font-bold text-fg-strong">
            <Icon name="shield" size={16} className="text-warn" /> Aviso do Windows na primeira instalação
          </div>
          Como o instalador ainda não tem assinatura digital paga, o Windows pode mostrar <b className="text-fg">“O Windows protegeu o computador”</b>. Clique em <b className="text-fg">Mais informações → Executar assim mesmo</b>. O código é aberto e está no{' '}
          <a className="text-brand hover:underline" href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </div>
      </section>

      <footer className="border-t border-line/[0.06] py-8 text-center text-xs text-fg-faint">
        Aldetes · código aberto ·{' '}
        <a href={`https://github.com/${REPO}`} className="hover:text-fg-muted" target="_blank" rel="noreferrer">
          github.com/{REPO}
        </a>
      </footer>
    </div>
  );
}

function DownloadButton({ k, big, disabled }: { k: DlKey; big?: boolean; disabled?: boolean }) {
  const d = DOWNLOADS[k];
  return (
    <a href={disabled ? '#download' : dl(d.file)} className={clsx('btn-primary', big && 'px-7 py-3.5 text-[15px]')}>
      <Icon name="download" size={18} /> Baixar para {k === 'windows' ? 'Windows' : 'Linux'}
    </a>
  );
}

function Feature({ icon, tint, title, children }: { icon: IconName; tint: string; title: string; children: ReactNode }) {
  return (
    <motion.div
      data-glow
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={spring.gentle}
      whileHover={{ y: -3 }}
      className="card p-6"
    >
      <span className={clsx('tile h-11 w-11', tint)}>
        <Icon name={icon} size={20} />
      </span>
      <div className="mt-4 text-lg font-extrabold tracking-tight text-fg-strong">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{children}</p>
    </motion.div>
  );
}

/** Marketing demo of the Live Island states (decorative; the real one runs inside the app). */
function IslandDemo() {
  const steps = ['idle', 'call', 'split', 'message', 'ring'] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), 2600);
    return () => clearInterval(t);
  }, []);
  const s = steps[i]!;
  const big = s === 'ring';
  const Av = ({ c, l }: { c: string; l: string }) => (
    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-black" style={{ background: c }}>
      {l}
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        layout
        transition={spring.island}
        style={{ borderRadius: big ? 26 : 22 }}
        className={clsx('overflow-hidden border bg-black text-white', s === 'idle' || s === 'message' ? 'border-white/10' : 'border-brand/40 shadow-glow', big ? 'w-[380px]' : '')}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={s} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.2 }}>
            {s === 'idle' && (
              <div className="flex h-10 items-center gap-2.5 px-4 text-[13px] font-semibold">
                <span className="grad flex h-5 w-5 items-center justify-center rounded-md">
                  <Logo size={12} />
                </span>
                21:30 <span className="ml-6 font-normal text-white/40">tudo em dia</span>
              </div>
            )}
            {(s === 'call' || s === 'split') && (
              <div className="flex h-10 items-center gap-2.5 px-4 text-[13px] font-semibold">
                <span className="h-2 w-2 rounded-full bg-ok shadow-[0_0_10px_rgb(var(--ok))]" /> Ranked da noite
                <span className="flex -space-x-1.5">
                  <Av c="#6c5ce7" l="A" />
                  <span className="speaking rounded-full">
                    <Av c="#00b894" l="B" />
                  </span>
                  <Av c="#e17055" l="C" />
                </span>
                <span className="ml-3 tabular-nums text-white/60">12:48</span>
                {s === 'split' && (
                  <>
                    <span className="mx-1 h-5 w-px bg-white/15" />
                    <span className="rec-dot h-2 w-2 rounded-full bg-danger" />
                    <span className="text-[12px] font-bold text-danger">AO VIVO</span>
                  </>
                )}
              </div>
            )}
            {s === 'message' && (
              <div className="flex items-center gap-3 px-3 py-2.5 text-left">
                <Av c="#0984e3" l="M" />
                <div>
                  <div className="text-[13px] font-bold">Mari em #geral</div>
                  <div className="text-[12px] text-white/60">bora mais uma? 🎮</div>
                </div>
                <span className="ml-6 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">Abrir</span>
              </div>
            )}
            {s === 'ring' && (
              <div className="flex items-center gap-3 p-3.5 text-left">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e84393] text-lg font-bold">L</span>
                <div className="flex-1">
                  <div className="text-[15px] font-bold">Lucas</div>
                  <div className="text-xs text-white/60">está te chamando</div>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger">
                  <Icon name="hangup" size={18} />
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok">
                  <Icon name="phone" size={18} />
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <div className="flex gap-1.5">
        {steps.map((x, j) => (
          <span key={x} className={clsx('h-1.5 rounded-full transition-all duration-300', j === i ? 'grad w-6' : 'w-1.5 bg-line/20')} />
        ))}
      </div>
    </div>
  );
}
