import { useState } from 'react';
import clsx from 'clsx';
import { ConnectionCheck, CheckStatus, type CheckInfo } from 'livekit-client';
import { api } from '@/lib/api';
import { Icon } from '../common/Icon';
import { toast, toastError } from '../common/overlay';

type Step = { key: string; label: string; help: string; run: (c: ConnectionCheck) => Promise<CheckInfo> };

/** Real voice connectivity test against our LiveKit server (signalling, WebRTC, TURN, mic publish, protocol). */
const STEPS: Step[] = [
  { key: 'ws', label: 'Conexão com o servidor de voz', help: 'Não conectou no servidor de voz (wss). Pode ser firewall, antivírus ou o servidor fora do ar.', run: (c) => c.checkWebsocket() },
  { key: 'rtc', label: 'Conexão de áudio/vídeo (WebRTC)', help: 'A rede bloqueou o tráfego de mídia. Comum em redes de empresa/escola ou com firewall/antivírus rigoroso.', run: (c) => c.checkWebRTC() },
  { key: 'turn', label: 'Plano B para redes restritas (TURN)', help: 'O retransmissor (TURN) não respondeu. Em redes que bloqueiam UDP, a chamada pode não funcionar.', run: (c) => c.checkTURN() },
  { key: 'pub', label: 'Enviar o seu microfone', help: 'Não foi possível transmitir o microfone. Confira a permissão de microfone do Windows/navegador.', run: (c) => c.checkPublishAudio() },
  { key: 'proto', label: 'Qualidade do caminho (UDP x TCP)', help: 'Só funcionou por TCP: a chamada funciona, mas pode ter mais atraso.', run: (c) => c.checkConnectionProtocol() },
];

export function ConnectionTest() {
  const [results, setResults] = useState<Record<string, CheckInfo>>({});
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResults({});
    try {
      const t = await api<{ url: string; token: string }>('POST', '/voice/diagnostics');
      for (const step of STEPS) {
        const check = new ConnectionCheck(t.url, t.token);
        setResults((r) => ({ ...r, [step.key]: { name: step.key, logs: [], status: CheckStatus.RUNNING, description: '' } }));
        let info: CheckInfo;
        try {
          info = await step.run(check);
        } catch (err) {
          info = { name: step.key, logs: [{ level: 'error', message: String((err as Error)?.message ?? err) }], status: CheckStatus.FAILED, description: '' } as CheckInfo;
        }
        setResults((r) => ({ ...r, [step.key]: info }));
      }
    } catch (err) {
      toastError(err);
    } finally {
      setRunning(false);
    }
  };

  const report = () => {
    const lines = [`Aldetes — teste de conexão (${new Date().toLocaleString('pt-BR')})`, navigator.userAgent];
    for (const s of STEPS) {
      const r = results[s.key];
      lines.push(`\n[${r ? CheckStatus[r.status] : 'NÃO RODOU'}] ${s.label}`);
      for (const l of r?.logs ?? []) lines.push(`  ${l.level}: ${l.message}`);
    }
    void navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Relatório copiado. Cole no chat para quem administra o servidor.', 'success'));
  };

  const done = !running && Object.keys(results).length === STEPS.length;
  const failed = STEPS.filter((s) => s.key !== 'proto' && results[s.key]?.status === CheckStatus.FAILED);
  const tcpOnly = results.proto?.status === CheckStatus.FAILED;

  return (
    <div className="card mb-8 p-5">
      <div className="flex items-center gap-4">
        <span className="tile h-11 w-11 bg-ok/15 text-ok">
          <Icon name="signal" size={19} />
        </span>
        <div className="flex-1">
          <div className="font-bold text-fg-strong">Teste de conexão de voz</div>
          <div className="text-sm text-fg-muted">Não consegue entrar na call? Rode o teste e veja onde está o problema.</div>
        </div>
        <button className="btn-primary" disabled={running} onClick={run}>
          {running ? 'Testando…' : 'Testar conexão'}
        </button>
      </div>
      {Object.keys(results).length > 0 && (
        <div className="mt-4 space-y-2">
          {STEPS.map((s) => {
            const r = results[s.key];
            const st = r?.status;
            return (
              <div key={s.key} className="flex items-start gap-3 rounded-xl bg-line/[0.03] px-3 py-2.5">
                <span
                  className={clsx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    st === CheckStatus.SUCCESS
                      ? 'bg-ok text-white'
                      : st === CheckStatus.FAILED
                        ? s.key === 'proto'
                          ? 'bg-warn text-black'
                          : 'bg-danger text-white'
                        : st === CheckStatus.RUNNING
                          ? 'animate-pulse bg-brand/40'
                          : 'bg-line/10',
                  )}
                >
                  {st === CheckStatus.SUCCESS && <Icon name="check" size={12} strokeWidth={3} />}
                  {st === CheckStatus.FAILED && <Icon name="x" size={12} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg-strong">{s.label}</div>
                  {st === CheckStatus.FAILED && <div className={clsx('text-xs', s.key === 'proto' ? 'text-warn' : 'text-danger')}>{s.help}</div>}
                  {st === CheckStatus.SKIPPED && <div className="text-xs text-fg-muted">Pulado: não disponível neste servidor/rede.</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {done && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className={clsx('text-sm font-semibold', failed.length ? 'text-danger' : tcpOnly ? 'text-warn' : 'text-ok')}>
            {failed.length
              ? `${failed.length} etapa(s) falharam — envie o relatório para o administrador.`
              : tcpOnly
                ? 'Funciona, mas só por TCP (pode ter um pouco mais de atraso).'
                : 'Tudo certo! Sua conexão está pronta para chamadas.'}
          </div>
          <button className="btn-secondary shrink-0" onClick={report}>
            <Icon name="copy" size={15} /> Copiar relatório
          </button>
        </div>
      )}
    </div>
  );
}
