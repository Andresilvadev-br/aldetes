// Desktop update flow, end to end against a local update server (electron-updater "generic" provider):
// popup → "Atualizar agora" → full-screen progress with real download → verified → countdown → installing.
// ALDETES_UPDATE_TEST=1 stops right before quitAndInstall (the running binary is never replaced).
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { _electron: electron } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));

// --- fake release: 24 MB payload, served at ~6 MB/s so the progress is visible
const payload = randomBytes(24 * 1024 * 1024);
const sha512 = createHash('sha512').update(payload).digest('base64');
const yml = `version: 9.9.9
files:
  - url: Aldetes-Linux.AppImage
    sha512: ${sha512}
    size: ${payload.length}
path: Aldetes-Linux.AppImage
sha512: ${sha512}
releaseDate: '2026-11-04T12:00:00.000Z'
releaseNotes: |
  <ul><li>Novo aviso de atualização com reinício automático</li><li>Transmissão em 1080p a 60 FPS</li><li>Barra de canais refeita</li></ul>
`;
let served = 0;
const srv = createServer((req, res) => {
  if (req.url.startsWith('/latest-linux.yml')) return res.end(yml);
  if (req.url.startsWith('/Aldetes-Linux.AppImage')) {
    res.writeHead(200, { 'content-length': payload.length, 'content-type': 'application/octet-stream' });
    let off = 0;
    const tick = setInterval(() => {
      const chunk = payload.subarray(off, off + 600 * 1024);
      off += chunk.length;
      served += chunk.length;
      res.write(chunk);
      if (off >= payload.length) {
        clearInterval(tick);
        res.end();
      }
    }, 100);
    req.on('close', () => clearInterval(tick));
    return;
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => srv.listen(8765, '127.0.0.1', r));
const devCfg = join(root, 'apps/desktop/dev-app-update.yml');
writeFileSync(devCfg, 'provider: generic\nurl: http://127.0.0.1:8765/\nupdaterCacheDirName: aldetes-updater-test\n');
const fakeDir = mkdtempSync(join(tmpdir(), 'aldetes-upd-'));
const fakeAppImage = join(fakeDir, 'Aldetes.AppImage');
writeFileSync(fakeAppImage, 'not a real appimage');

const app = await electron.launch({
  executablePath: join(root, 'node_modules/.pnpm/node_modules/electron/dist/electron'),
  args: [join(root, 'apps/desktop'), '--no-sandbox'],
  env: { ...process.env, ALDETES_UPDATE_TEST: '1', APPIMAGE: fakeAppImage, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});
try {
  await app.firstWindow();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    page = app.windows().find((w) => !w.url().includes('island-overlay'));
    if (!page) await new Promise((r) => setTimeout(r, 200));
  }
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const popup = await page.getByText('Nova versão chegou!').waitFor({ timeout: 20000 }).then(() => true, () => false);
  const notes = await page.locator('[aria-label="Atualização disponível"] li').allInnerTexts();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/update-popup.png` });
  check('Pop-up aparece sozinho quando há versão nova', popup, `novidades: ${notes.join(' | ')}`);

  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  const progress = await page.getByText('Baixando a nova versão').waitFor({ timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(1800);
  const mid = await page.locator('[aria-label="Atualização em andamento"]').innerText().catch(() => '');
  await page.screenshot({ path: `${shots}/update-progress.png` });
  check('Tela de atualização em andamento com progresso real', progress && /de 24,0 MB/.test(mid), mid.replace(/\s+/g, ' ').slice(0, 140));

  const ready = await page.getByText(/Tudo pronto! Reiniciando em/).waitFor({ timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/update-ready.png` });
  check('Download completo e verificado (sha512) → contagem para reiniciar', ready, `${(served / 1048576).toFixed(1)} MB servidos`);

  const installing = await page.getByText(/Instalando/).waitFor({ timeout: 8000 }).then(() => true, () => false);
  check('Contagem termina e o app passa a instalar/reiniciar sozinho', installing);
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await app.close();
  srv.close();
  rmSync(devCfg, { force: true });
  rmSync(fakeDir, { recursive: true, force: true });
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
