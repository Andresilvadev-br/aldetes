// Live Island 2.0 on the desktop overlay (Electron, Linux/Xvfb + XTest real pointer): drag by the surface,
// magnetic snap, position saved as fractions per monitor, fallback when the saved monitor is gone, click ≠ drag,
// never focusable, size presets. Usage: DISPLAY=:99 node e2e/desktop-island2.mjs <shots>   (needs python3-xlib)
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const { _electron: electron } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(!!ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const xdrag = (...a) => execFileSync('python3', [join(root, 'e2e/tools/xdrag.py'), ...a.map(String)]);
const cfgPath = join(homedir(), '.config/Aldetes/config.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({
  executablePath: join(root, 'node_modules/.pnpm/node_modules/electron/dist/electron'),
  args: [join(root, 'apps/desktop'), '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  env: { ...process.env },
});
const islandInfo = () =>
  app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('island-overlay'));
    return { b: w?.getBounds(), visible: w?.isVisible(), focusable: w?.isFocusable(), wa: screen.getPrimaryDisplay().workArea, id: screen.getPrimaryDisplay().id };
  });
try {
  await app.firstWindow();
  let main;
  for (let i = 0; i < 50 && !main; i++) {
    main = app.windows().find((p) => !p.url().includes('island-overlay'));
    if (!main) await sleep(200);
  }
  await main.waitForLoadState('domcontentloaded');
  await main.waitForURL(/server-setup|login|welcome/, { timeout: 20000 });
  if (main.url().includes('server-setup')) {
    await main.locator('input').fill('http://localhost:3001');
    await main.getByRole('button', { name: 'Conectar' }).click();
    await main.waitForURL(/login/, { timeout: 15000 });
  }
  const u = 'isl2_' + Date.now().toString(36);
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('island-overlay'))?.hide());
  let info;
  for (let i = 0; i < 30; i++) {
    info = await islandInfo();
    if (info.visible) break;
    await sleep(200);
  }
  await sleep(4500); // let the auto-expand on "call connected" close by itself
  info = await islandInfo();
  check('Ilha flutuante visível e NÃO focável (clicar nela não tira o foco do jogo)', info.visible && info.focusable === false, JSON.stringify(info.b));

  // 1) drag by the surface with the real pointer
  const b0 = info.b;
  const sx = b0.x + 60;
  const sy = b0.y + b0.height / 2;
  xdrag(sx, sy, sx + 300, sy + 400, 25);
  await sleep(400);
  const b1 = (await islandInfo()).b;
  const moved = Math.abs(b1.x - (b0.x + 300)) <= 6 && Math.abs(b1.y - (b0.y + 400)) <= 6;
  const cfg1 = JSON.parse(readFileSync(cfgPath, 'utf8')).islandPos;
  check('Arrastar pela superfície move a ilha junto com o cursor e salva a posição (frações do monitor)', moved && typeof cfg1?.fx === 'number' && cfg1.displayId === info.id, `${b0.x},${b0.y} → ${b1.x},${b1.y} · salvo ${JSON.stringify(cfg1)}`);

  // 2) a click without movement is not a drag
  xdrag(b1.x + 60, b1.y + b1.height / 2, 'click');
  await sleep(300);
  const b2 = (await islandInfo()).b;
  check('Clique sem arrastar não move a ilha', b2.x === b1.x && b2.y === b1.y);

  // 3) magnetic snap near the top-left corner
  const wa = info.wa;
  const ox = b2.x + 40;
  const oy = b2.y + 18;
  xdrag(ox, oy, ox - (b2.x - (wa.x + 6)) + 14, oy - (b2.y - (wa.y + 6)) + 12, 25);
  await sleep(400);
  const b3 = (await islandInfo()).b;
  check('Ímã: solta perto do canto e ela gruda no canto (margem de 6 px)', b3.x === wa.x + 6 && b3.y === wa.y + 6, `${b3.x},${b3.y}`);

  // 4) clamped to the work area (can't be thrown off screen)
  xdrag(b3.x + 40, b3.y + 18, b3.x + 40 + 5000, b3.y + 18 + 5000, 20);
  await sleep(400);
  const b4 = (await islandInfo()).b;
  check('Não sai da área útil do monitor', b4.x + b4.width <= wa.x + wa.width && b4.y + b4.height <= wa.y + wa.height && b4.x >= wa.x && b4.y >= wa.y, JSON.stringify(b4));

  // 5) saved monitor gone → recovers on an existing one, same relative place
  const c = JSON.parse(readFileSync(cfgPath, 'utf8'));
  c.islandPos = { fx: 0.25, fy: 0.5, displayId: 987654, scale: 2, waW: 3840, waH: 2160 };
  writeFileSync(cfgPath, JSON.stringify(c));
  await app.evaluate(({ screen }) => screen.emit('display-removed', {}, {}));
  await sleep(600);
  const b5 = (await islandInfo()).b;
  const cx = b5.x + b5.width / 2;
  check('Monitor salvo desconectado: a ilha volta para um monitor existente, no mesmo lugar relativo', Math.abs(cx - (wa.x + wa.width * 0.25)) <= 3 && Math.abs(b5.y - (wa.y + wa.height * 0.5)) <= 3, `${Math.round(cx)},${b5.y}`);

  // 6) presets + center command (from the expanded island)
  const ov = app.windows().find((p) => p.url().includes('island-overlay'));
  await ov.locator('[data-testid=island-overlay]').hover();
  await ov.getByRole('button', { name: 'Grande' }).click();
  await sleep(700);
  const b6 = (await islandInfo()).b;
  await ov.screenshot({ path: `${shots}/island2-big.png` });
  await ov.getByRole('button', { name: /Centralizar no topo/ }).click();
  await sleep(500);
  const b7 = (await islandInfo()).b;
  check('Tamanhos (Compacta/Normal/Grande) mudam a ilha; "Centralizar no topo" volta ao centro', b6.width >= 560 && Math.abs(b7.x + b7.width / 2 - (wa.x + wa.width / 2)) <= 3 && b7.y === wa.y + 6, `largura ${b6.width} · ${b7.x},${b7.y}`);
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await app.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
