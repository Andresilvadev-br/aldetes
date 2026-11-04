import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePwa, applyWebUpdate, promptInstall, isIos } from '@/lib/pwa';
import { useVoice } from '@/lib/voice';
import { desktop } from '@/lib/desktop';
import { useIsMobile } from '@/lib/mobile';
import { spring } from '@/lib/motion';
import { Icon, Logo } from './Icon';

const DISMISS = 'aldetes.installDismissed';

/**
 * Browser-only banners:
 * - offline: calls and streams need the internet (the cache only keeps the app shell),
 * - new web version: offered only outside a call (never reloads in the middle of one),
 * - install (phones): Android uses the native prompt; iPhone gets the Safari steps.
 */
export function PwaBanners() {
  const { online, updateReady, canInstall, standalone } = usePwa();
  const inCall = useVoice((v) => !!v.channelId);
  const mobile = useIsMobile();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS) === '1';
    } catch {
      return false;
    }
  });
  if (desktop) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS, '1');
    } catch {
      /* ignore */
    }
  };
  const showInstall = mobile && !standalone && !dismissed && (canInstall || isIos());

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {!online && (
          <motion.div key="off" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={spring.gentle} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-warn/30 bg-bg-float/95 px-4 py-3 text-sm shadow-float">
            <Icon name="wifiOff" size={18} className="shrink-0 text-warn" />
            <span className="text-fg">
              <b className="text-fg-strong">Sem internet.</b> Mensagens, calls e transmissões voltam quando a conexão voltar.
            </span>
          </motion.div>
        )}
        {online && updateReady && !inCall && (
          <motion.div key="upd" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={spring.gentle} className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand/30 bg-bg-float/95 py-2 pl-4 pr-2 text-sm shadow-float">
            <Logo size={18} />
            <span className="text-fg-strong">Nova versão do Aldetes disponível</span>
            <button className="btn-primary h-9 px-4 text-xs" onClick={applyWebUpdate}>
              Atualizar
            </button>
          </motion.div>
        )}
        {showInstall && (
          <motion.div key="inst" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={spring.gentle} className="pointer-events-auto w-full max-w-md rounded-2xl border border-line/10 bg-bg-float/95 p-4 shadow-float">
            <div className="flex items-start gap-3">
              <img src="./icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-fg-strong">Instale o Aldetes no celular</div>
                {canInstall ? (
                  <p className="mt-0.5 text-xs text-fg-muted">Abre em tela cheia pelo ícone, sem a barra do navegador.</p>
                ) : (
                  <p className="mt-0.5 text-xs text-fg-muted">
                    No Safari: toque em <b className="text-fg">Compartilhar</b> <Icon name="upload" size={12} className="inline" /> → <b className="text-fg">Adicionar à Tela de Início</b> → abra pelo ícone.
                  </p>
                )}
              </div>
              <button className="-mr-1 -mt-1 flex h-11 w-11 items-center justify-center rounded-xl text-fg-muted" onClick={dismiss} aria-label="Agora não">
                <Icon name="x" size={18} />
              </button>
            </div>
            {canInstall && (
              <button className="btn-primary mt-3 h-11 w-full" onClick={() => void promptInstall().then((ok) => ok && dismiss())}>
                <Icon name="download" size={17} /> Instalar
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
