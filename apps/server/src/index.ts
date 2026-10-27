import { loadConfig } from './config';
import { buildApp } from './app';
import { cleanupOrphanAttachments } from './routes/uploads';
import { reconcileVoiceStates } from './services/voice-reconcile';

const cfg = loadConfig();
const { app, ctx, close } = await buildApp(cfg);

await app.listen({ port: cfg.API_PORT, host: cfg.API_HOST });

const timers = [
  setInterval(() => cleanupOrphanAttachments(ctx).catch((err) => app.log.error(err)), 15 * 60_000),
  setInterval(() => reconcileVoiceStates(ctx).catch((err) => app.log.warn({ err }, 'reconcile voice falhou')), 60_000),
];
reconcileVoiceStates(ctx).catch((err) => app.log.warn({ err }, 'LiveKit indisponível na inicialização'));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    app.log.info(`${sig} recebido, encerrando...`);
    timers.forEach(clearInterval);
    await close();
    process.exit(0);
  });
}
