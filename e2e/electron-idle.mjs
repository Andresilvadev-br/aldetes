// Measures the packaged desktop app at rest using Electron's own app.getAppMetrics().
import { createRequire } from 'node:module';
const { _electron: electron } = createRequire(import.meta.url)('playwright');
const exe = process.env.ALDETES_EXE ?? 'apps/desktop/release/linux-unpacked/aldetes';
const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await app.firstWindow();
await page.waitForLoadState('load');
await page.waitForTimeout(8000);
await app.evaluate(({ app }) => app.getAppMetrics()); // prime CPU counters
await page.waitForTimeout(10000);
const m = await app.evaluate(({ app }) => app.getAppMetrics().map((p) => ({ type: p.type, cpu: p.cpu.percentCPUUsage, mem: p.memory.workingSetSize })));
const cpu = m.reduce((a, p) => a + p.cpu, 0);
const mem = m.reduce((a, p) => a + p.mem, 0) / 1024;
console.log(`Electron ocioso (tela de login, 10s): CPU somada ${cpu.toFixed(2)}% | memória (working set) ${mem.toFixed(0)} MB | ${m.length} processos (${m.map((p) => p.type).join(', ')})`);
await app.close();
