// After desktop-smoke.mjs: reopening the app must go straight in, without logging in again.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { _electron: electron } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await electron.launch({ executablePath: join(root, 'node_modules/.pnpm/node_modules/electron/dist/electron'), args: [join(root, 'apps/desktop'), '--no-sandbox'] });
let ok = false;
try {
  await app.firstWindow();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    page = app.windows().find((w) => !w.url().includes('island-overlay'));
    if (!page) await new Promise((r) => setTimeout(r, 200));
  }
  await page.waitForURL(/channels/, { timeout: 20000 });
  ok = true;
} catch {}
await app.close();
console.log(`${ok ? '✅' : '❌'} Reabrir o app entra direto, sem pedir login`);
process.exit(ok ? 0 : 1);
