import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore, set, initialState } from './store';
import { api, needsServerSetup } from './lib/api';
import { connectGateway, disconnectGateway } from './lib/gateway';
import { LoginPage, RegisterPage, ForgotPage, ResetPage } from './pages/Auth';
import { InvitePage } from './pages/Invite';
import { LandingPage } from './pages/Landing';
import { AppShell } from './components/layout/AppShell';
import { ContextMenuProvider, Toasts, ConfirmHost } from './components/common/overlay';
import { Logo } from './components/common/Icon';
import { ServerSetup } from './pages/ServerSetup';
import { isDesktop } from './lib/desktop';
import { leaveVoice } from './lib/voice';
import { MotionConfig } from 'motion/react';
import { usePrefs } from './lib/prefs';
import { spring } from './lib/motion';

export async function bootSession() {
  try {
    await api('GET', '/users/@me');
    connectGateway();
  } catch {
    set({ status: 'unauthenticated' });
  }
}

export function App() {
  const status = useStore((s) => s.status);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (needsServerSetup()) {
      set({ status: 'unauthenticated' });
      nav('/server-setup', { replace: true });
      return;
    }
    void bootSession();
    const onUnauth = () => {
      void leaveVoice();
      disconnectGateway();
      set({ ...initialState, status: 'unauthenticated' });
    };
    window.addEventListener('aldetes:unauthorized', onUnauth);
    return () => window.removeEventListener('aldetes:unauthorized', onUnauth);
  }, []);

  useEffect(() => {
    const publicPaths = ['/login', '/register', '/forgot', '/reset-password', '/invite', '/server-setup', '/welcome', '/download'];
    if (needsServerSetup()) return;
    // Browser visitors landing on the root see the site (download page); the desktop app goes straight to login.
    if (status === 'unauthenticated' && loc.pathname === '/' && !isDesktop) {
      nav('/welcome', { replace: true });
      return;
    }
    if (status === 'unauthenticated' && !publicPaths.some((p) => loc.pathname.startsWith(p))) {
      nav(`/login?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
    }
  }, [status, loc.pathname, nav]);

  const motionLevel = usePrefs((p) => (p.reduceMotion ? 'performance' : p.motion));
  return (
    <MotionConfig reducedMotion={motionLevel === 'performance' ? 'always' : 'never'} transition={spring.responsive}>
    <ContextMenuProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset-password" element={<ResetPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/download" element={<LandingPage />} />
        <Route path="/server-setup" element={isDesktop ? <ServerSetup /> : <Navigate to="/" />} />
        <Route path="/*" element={status === 'ready' ? <AppShell /> : status === 'unauthenticated' ? null : <Splash />} />
      </Routes>
      {isDesktop && status !== 'ready' && <div className="drag fixed inset-x-0 top-0 z-[90] h-9" />}
      <Toasts />
      <ConfirmHost />
    </ContextMenuProvider>
    </MotionConfig>
  );
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg-rail text-brand">
      <div className="animate-pulse">
        <Logo size={72} />
      </div>
      <p className="text-sm text-fg-muted">Conectando ao Aldetes…</p>
    </div>
  );
}
