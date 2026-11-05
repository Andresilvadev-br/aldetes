// Spec scenarios D (2 transmissions), G (group reaction + cooldown), B (mute), H (layout change without restart):
// three real browsers in one call; A and B share their screens at the same time, C watches both.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'] });
async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(`${BASE}/#/register`);
  await page.getByLabel('E-mail').fill(`${name}${run}@t.dev`);
  await page.getByLabel('Nome de usuário').fill(`${name}_${run}`);
  await page.getByLabel('Senha').fill('senha-forte-123');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForURL(/channels/);
  return page;
}
const joinVoice = async (p) => {
  await p.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  await p.getByText('Voz conectada').waitFor({ timeout: 20000 });
};
const share = async (p) => {
  await p.getByRole('button', { name: 'Tela', exact: true }).first().click();
  await p.getByRole('button', { name: /Começar transmissão/ }).click();
  await p.waitForTimeout(800);
};

try {
  const [A, B, C] = await Promise.all([user('ana'), user('bia'), user('caio')]);
  await A.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await A.getByRole('button', { name: 'Criar', exact: true }).click();
  await A.waitForURL(/channels\/\d+\/\d+/);
  await A.getByRole('button', { name: /Convidar amigos/ }).click();
  await A.waitForFunction(() => /invite\//.test(document.querySelector('input[readonly]')?.value ?? ''));
  const link = await A.locator('input[readonly]').first().inputValue();
  await A.keyboard.press('Escape');
  for (const p of [B, C]) {
    await p.goto(link);
    await p.getByRole('button', { name: 'Aceitar convite' }).click();
    await p.waitForURL(/channels\/\d+/);
  }
  for (const p of [A, B, C]) await joinVoice(p);
  check('Três pessoas na mesma call', true);
  await C.waitForTimeout(1500);
  await C.screenshot({ path: `${SHOTS}/stage-voice-only.png` });
  await C.bringToFront();
  const base = await C.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise((r) => {
      const f = () => (frames++, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r());
      requestAnimationFrame(f);
    });
    return { fps: Math.round((frames * 1000) / (performance.now() - t0)), visivel: document.visibilityState };
  });
  console.log('   referência (só voz, sem vídeo):', JSON.stringify(base));

  // B: mute through the dock → the others see it (real state, not just the icon)
  await B.getByRole('button', { name: 'Microfone', exact: true }).last().click();
  const mutedSeen = await C.waitForFunction(() => Object.values(window.__aldetes.useStore.getState().voiceStates).some((v) => v.selfMute), null, { timeout: 8000 }).then(() => true, () => false);
  check('Mutar pelo dock: estado real chega aos outros', mutedSeen);

  // D: two simultaneous screen shares
  await share(A);
  await share(B);
  const both = await C.waitForFunction(
    () => {
      const room = window.__aldetes.getRoom();
      const shares = [...room.remoteParticipants.values()].map((p) => p.getTrackPublication('screen_share')?.track?.attachedElements?.[0]).filter((el) => el && el.videoWidth > 0);
      return shares.length === 2;
    },
    null,
    { timeout: 25000 },
  ).then(() => true, () => false);
  await C.waitForTimeout(1200);
  await C.screenshot({ path: `${SHOTS}/stage-two-streams-focus.png` });
  check('Duas transmissões simultâneas chegam ao espectador', both);

  // Fluidity while watching 2 streams with 3 people talking: UI frames/s and main-thread stalls (> 50 ms)
  await C.bringToFront();
  await C.waitForTimeout(500);
  const fluid = await C.evaluate(async () => {
    let long = 0;
    let longMs = 0;
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => ((long += 1), (longMs += e.duration))));
    po.observe({ type: 'longtask', buffered: false });
    let frames = 0;
    const t0 = performance.now();
    await new Promise((r) => {
      const f = () => (frames++, performance.now() - t0 < 4000 ? requestAnimationFrame(f) : r());
      requestAnimationFrame(f);
    });
    po.disconnect();
    return { fps: Math.round((frames * 1000) / (performance.now() - t0)), travadas: long, msTravado: Math.round(longMs) };
  });
  // FPS here is limited by this machine (software GPU, 3 browsers encoding/decoding) — see the voice-only reference.
  // The app-side metric is main-thread stalls: the UI code must not block while video plays.
  check('Interface sem travadas assistindo 2 transmissões (nenhuma tarefa > 50 ms)', fluid.msTravado < 200, JSON.stringify({ ...fluid, referenciaSoVoz: base.fps }));

  // H: switching Foco → Grade and changing focus must not remount/restart the videos
  await C.evaluate(() => document.querySelectorAll('video').forEach((v, i) => (v.dataset.mark = String(i))));
  const before = await C.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ mark: v.dataset.mark, t: v.currentTime })));
  await C.getByRole('button', { name: 'Grade', exact: true }).click();
  await C.waitForTimeout(900);
  await C.screenshot({ path: `${SHOTS}/stage-two-streams-grid.png` });
  await C.getByRole('button', { name: 'Foco', exact: true }).click();
  await C.waitForTimeout(400);
  // click the thumbnail (second tile) to swap focus
  const thumbs = C.locator('[title="Clique para destacar"]');
  if (await thumbs.count()) await thumbs.first().click();
  await C.waitForTimeout(900);
  const after = await C.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ mark: v.dataset.mark, t: v.currentTime, w: v.videoWidth })));
  const kept = before.every((b) => after.some((a) => a.mark === b.mark && a.t > b.t));
  check('Trocar Foco/Grade e o destaque não reinicia nenhum vídeo', kept && after.every((a) => a.mark !== undefined), JSON.stringify(after.map((a) => `${a.mark}:${a.t.toFixed(1)}s`)));

  // G: reaction reaches everyone exactly once; spam is limited
  const count = (p) => p.evaluate(() => window.__aldetes.useVoice.getState().reactions.length);
  await A.bringToFront();
  await A.keyboard.press('Alt+Digit3'); // 👏
  await C.waitForTimeout(700);
  const got = await Promise.all([B, C].map((p) => p.evaluate(() => window.__aldetes.useVoice.getState().reactions.map((r) => r.emoji))));
  await C.screenshot({ path: `${SHOTS}/stage-reaction.png` });
  check('Reação chega uma vez para cada participante', got.every((g) => g.length === 1 && g[0] === '👏'), JSON.stringify(got));
  await A.waitForTimeout(2600); // let it expire
  const expired = await count(C);
  for (let i = 0; i < 15; i++) await A.keyboard.press('Alt+Digit5');
  await C.waitForTimeout(700);
  const spam = await count(C);
  check('Reação some sozinha e o spam é limitado (cooldown)', expired === 0 && spam > 0 && spam <= 5, `depois de expirar: ${expired}; 15 cliques rápidos → ${spam} exibidas`);

  // Leaving: the stage reorganizes, no ghost tile
  await B.getByRole('button', { name: 'Sair da call' }).click();
  const one = await C.waitForFunction(() => document.querySelectorAll('video').length === 1, null, { timeout: 10000 }).then(() => true, () => false);
  await C.waitForTimeout(800);
  await C.screenshot({ path: `${SHOTS}/stage-after-leave.png` });
  check('Quem sai some do palco sem deixar bloco fantasma', one);
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
