import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore, set, initialState } from './store';
import { api, needsServerSetup } from './lib/api';
import { connectGateway, disconnectGateway } from './lib/gateway';
import { LoginPage, RegisterPage, ForgotPage, ResetPage } from './pages/Auth';
import { InvitePage } from './pages/Invite';
import { AppShell } from './components/layout/AppShell';
import { ContextMenuProvider, Toasts, ConfirmHost } from './components/common/overlay';
import { Logo } from './components/common/Icon';
import { ServerSetup } from './pages/ServerSetup';
import { isDesktop } from './lib/desktop';
import { leaveVoice } from './lib/voice';

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
    const publicPaths = ['/login', '/register', '/forgot', '/reset-password', '/invite', '/server-setup'];
    if (needsServerSetup()) return;
    if (status === 'unauthenticated' && !publicPaths.some((p) => loc.pathname.startsWith(p))) {
      nav(`/login?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
    }
  }, [status, loc.pathname, nav]);

  return (
    <ContextMenuProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset-password" element={<ResetPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/server-setup" element={isDesktop ? <ServerSetup /> : <Navigate to="/" />} />
        <Route path="/*" element={status === 'ready' ? <AppShell /> : status === 'unauthenticated' ? null : <Splash />} />
      </Routes>
      <Toasts />
      <ConfirmHost />
    </ContextMenuProvider>
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
