// Floating Live Island test (Electron, Linux/Xvfb). Optional: put a playerctl test double first in PATH
// to exercise the MPRIS "now playing" bridge.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { _electron: electron } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));

const app = await electron.launch({
  executablePath: join(root, 'node_modules/.pnpm/node_modules/electron/dist/electron'),
  args: [join(root, 'apps/desktop'), '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  env: { ...process.env },
});
const overlay = async () => {
  for (let i = 0; i < 50; i++) {
    const w = app.windows().find((p) => p.url().includes('island-overlay'));
    if (w) return w;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('janela da ilha não encontrada');
};
try {
  await app.firstWindow();
  let main;
  for (let i = 0; i < 50 && !main; i++) {
    main = app.windows().find((p) => !p.url().includes('island-overlay'));
    if (!main) await new Promise((r) => setTimeout(r, 200));
  }
  await main.waitForLoadState('domcontentloaded');
  await main.waitForURL(/server-setup|login|welcome/, { timeout: 20000 });
  if (main.url().includes('server-setup')) {
    await main.locator('input').fill('http://localhost:3001');
    await main.getByRole('button', { name: 'Conectar' }).click();
    await main.waitForURL(/login/, { timeout: 15000 });
  }
  const u = 'isl_' + Date.now().toString(36);
  await main.getByRole('link', { name: 'Cadastre-se' }).click();
  await main.getByLabel('E-mail').fill(`${u}@teste.dev`);
  await main.getByLabel('Nome de usuário').fill(u);
  await main.getByLabel('Senha').fill('senha-forte-123');
  await main.getByRole('button', { name: 'Continuar' }).click();
  await main.waitForURL(/channels\/@me/, { timeout: 20000 });
  await main.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await main.getByRole('button', { name: 'Criar', exact: true }).click();
  await main.waitForURL(/channels\/\d+\/\d+/);
  await main.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  await main.getByText('Voz conectada').waitFor({ timeout: 20000 });
  check('Em chamada no app desktop', true);

  const music = await main.locator('[data-testid=live-island]').getByText('Última Noite').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  check('Ilha do app mostra a música tocando (MPRIS/playerctl)', music, music ? '' : 'sem playerctl no PATH');

  // Send the main window to the background → the floating island appears
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('island-overlay'))?.hide());
  const ov = await overlay();
  const visible = await app
    .evaluate(async ({ BrowserWindow }) => {
      for (let i = 0; i < 30; i++) {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('island-overlay'));
        if (w?.isVisible()) return { ok: true, bounds: w.getBounds(), onTop: w.isAlwaysOnTop() };
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: false };
    });
  check('Ilha flutuante aparece no topo da tela com o app na bandeja', visible.ok && visible.onTop, JSON.stringify(visible.bounds ?? {}));
  await ov.getByText('Geral').first().waitFor({ timeout: 8000 });
  check('Ilha flutuante mostra a call (canal, pessoas, tempo)', true);
  await ov.screenshot({ path: `${shots}/float-compact.png` });

  // Hover → expands with controls; window grows to fit
  await ov.locator('div.h-fit').hover();
  await ov.getByRole('button', { name: 'Microfone' }).waitFor({ timeout: 5000 });
  await ov.waitForTimeout(500);
  await ov.screenshot({ path: `${shots}/float-open.png` });
  const grown = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('island-overlay')).getBounds().height);
  check('Passar o mouse abre a ilha e a janela acompanha o tamanho', grown > 100, `altura ${grown}px`);

  await ov.getByRole('button', { name: 'Microfone' }).click();
  const muted = await main.waitForFunction(() => window.__aldetes?.useVoice?.getState?.().selfMute === true || document.querySelector('[aria-label=Microfone].text-danger, button.bg-danger\\/15') !== null, null, { timeout: 5000 }).then(() => true, () => false);
  check('Mutar pela ilha flutuante muta a call no app', muted);

  if (music) {
    await ov.getByRole('button', { name: 'Pausar' }).click();
    const paused = await ov.getByRole('button', { name: 'Tocar' }).waitFor({ timeout: 6000 }).then(() => true, () => false);
    check('Pausar a música pela ilha flutuante (comando chega ao player)', paused);
  }

  await ov.getByRole('button', { name: 'Sair da call' }).click();
  // deliberate second tap (protection against accidental clicks)
  const stillIn = await main.getByText('Voz conectada').isVisible();
  check('Sair pela ilha pede confirmação (1º clique não derruba a call)', stillIn);
  await ov.getByRole('button', { name: 'Confirmar: sair da call' }).click();
  const left = await main.getByText('Voz conectada').waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false);
  check('Sair da call pela ilha flutuante', left);
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await app.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
