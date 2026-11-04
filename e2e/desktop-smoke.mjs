// Electron smoke test (run under xvfb-run on Linux CI): boots the packaged-style app (app:// origin),
// registers a user against the API, joins voice and shares a screen picked via the native desktopCapturer bridge.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { _electron: electron } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));

// ALDETES_EXE=apps/desktop/release/linux-unpacked/aldetes tests the packaged build instead of the dev one.
const packaged = process.env.ALDETES_EXE;
const app = await electron.launch({
  executablePath: packaged ? join(root, packaged) : join(root, 'node_modules/.pnpm/node_modules/electron/dist/electron'),
  args: [...(packaged ? [] : [join(root, 'apps/desktop')]), '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});
try {
  // The app also opens the (hidden) floating Live Island window; pick the main one.
  await app.firstWindow();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    page = app.windows().find((w) => !w.url().includes('island-overlay'));
    if (!page) await new Promise((r) => setTimeout(r, 200));
  }
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForLoadState('domcontentloaded');
  check('Janela carrega via app://aldetes', page.url().startsWith('app://aldetes'), page.url());
  const bridge = await page.evaluate(() => ({ has: !!window.aldetesDesktop, platform: window.aldetesDesktop?.platform, node: typeof window.require }));
  check('Bridge exposta e Node isolado do renderer', bridge.has && bridge.node === 'undefined', JSON.stringify(bridge));

  // First run: choose the self-hosted server
  await page.waitForURL(/server-setup|login/);
  if (page.url().includes('server-setup')) {
    await page.locator('input').fill(process.env.ALDETES_SERVER ?? 'http://localhost:3001');
    await page.getByRole('button', { name: 'Conectar' }).click();
    await page.waitForURL(/login/, { timeout: 15000 });
    check('Primeira execução: servidor configurado e validado (/api/health)', true);
  }
  const u = 'desk_' + Date.now().toString(36);
  await page.getByRole('link', { name: 'Cadastre-se' }).click();
  await page.getByLabel('E-mail').fill(`${u}@teste.dev`);
  await page.getByLabel('Nome de usuário').fill(u);
  await page.getByLabel('Senha').fill('senha-forte-123');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForURL(/channels\/@me/, { timeout: 15000 });
  check('Cadastro/login pelo app desktop (token em safeStorage)', true);
  const tokenStored = await page.evaluate(() => window.aldetesDesktop.getToken().then((t) => !!t));
  check('Sessão salva (continua logado ao reabrir)', tokenStored);

  const sources = await page.evaluate(() => window.aldetesDesktop.getScreenSources());
  check('desktopCapturer lista fontes de captura', sources.length > 0, sources.map((s) => `${s.kind}:${s.name}`).join(', '));

  await page.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.waitForURL(/channels\/\d+\/\d+/);
  await page.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  await page.getByText('Voz conectada').waitFor({ timeout: 20000 });
  check('Entra no canal de voz pelo desktop', true);
  await page.getByRole('button', { name: /^Tela$/ }).click();
  await page.locator('[role=dialog] .grid button').first().waitFor();
  await page.locator('[role=dialog] .grid button').first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/share-modal.png` });
  await page.getByRole('button', { name: 'Começar transmissão' }).click();
  const live = await page.getByText('AO VIVO').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  check('Compartilha a tela escolhida no seletor nativo', live);
  await page.screenshot({ path: `${shots}/desktop-share.png` });
  await page.waitForTimeout(6000);
  const bar = page.getByText('Você está ao vivo').locator('..');
  if (!(await bar.isVisible().catch(() => false))) await page.locator('video').first().dblclick().catch(() => {});
  const barText = await bar
    .filter({ hasText: /\d+ FPS/ })
    .first()
    .innerText({ timeout: 8000 })
    .catch(() => '');
  await page.screenshot({ path: `${shots}/desktop-live-stats.png` });
  check('Barra "ao vivo" com FPS/Mbps/codificador reais', /\d+p · \d+ FPS/.test(barText), barText.replace(/\s+/g, ' '));
  const pids = await app.evaluate(({ app }) => app.getAppMetrics().filter((m) => ['GPU', 'Tab', 'Utility', 'Browser'].includes(m.type)).map((m) => m.pid));
  const { execFileSync } = createRequire(import.meta.url)('node:child_process');
  const nice = execFileSync('ps', ['-o', 'ni=', '-p', pids.join(',')]).toString().trim().split(/\s+/).map(Number);
  check('Prioridade dos processos elevada durante a transmissão', nice.length > 0 && nice.every((n) => n < 0), `nice: ${nice.join(' ')}`);
  const flags = await app.evaluate(({ app }) => ['disable-renderer-backgrounding', 'disable-backgrounding-occluded-windows', 'disable-features'].map((f) => `${f}=${app.commandLine.hasSwitch(f) ? app.commandLine.getSwitchValue(f) || 'on' : 'off'}`));
  check('Chromium não reduz a velocidade do app em segundo plano', flags.every((f) => !f.endsWith('=off')), flags.join(', '));
} catch (e) {
  check('Roteiro desktop', false, e.message);
} finally {
  await app.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
