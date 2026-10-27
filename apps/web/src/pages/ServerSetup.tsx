import { useState } from 'react';
import { desktop } from '@/lib/desktop';
import { Logo } from '@/components/common/Icon';

/** Desktop only: choose which self-hosted Aldetes server to connect to. */
export function ServerSetup() {
  const [url, setUrl] = useState('https://');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const u = url.trim().replace(/\/$/, '');
    try {
      const r = await fetch(`${u}/api/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await desktop!.setServerUrl(u);
      await desktop!.setToken(null);
      window.location.hash = '#/login';
      window.location.reload();
    } catch (e) {
      setErr(`Não foi possível conectar a ${u}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center bg-bg-rail p-4">
      <div className="w-full max-w-md rounded-lg bg-bg-main p-8 shadow-2xl">
        <div className="mb-4 flex justify-center text-brand">
          <Logo size={40} />
        </div>
        <h1 className="mb-2 text-center text-xl font-bold text-fg-strong">Servidor Aldetes</h1>
        <p className="mb-6 text-center text-sm text-fg-muted">Informe o endereço da API do servidor que você quer usar (auto-hospedado).</p>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://aldetes.exemplo.com" onKeyDown={(e) => e.key === 'Enter' && save()} />
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <button className="btn-primary mt-4 w-full" disabled={busy} onClick={save}>
          Conectar
        </button>
      </div>
    </div>
  );
}
