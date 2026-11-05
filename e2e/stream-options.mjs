// Screen-share options end to end (two browsers): switches really toggle, 120 FPS preset goes out as one H.264
// layer at 120 FPS max, the light version keeps the frame rate (never 15), viewer can pick "Máxima",
// old-app warning, diagnostics report.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'] });

async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name}]`, e.message));
  await p.goto(`${BASE}/#/register`);
  await p.getByLabel('E-mail').fill(`${name}${run}@t.dev`);
  await p.getByLabel('Nome de usuário').fill(`${name}_${run}`);
  await p.getByLabel('Senha').fill('senha-forte-123');
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.waitForURL(/channels/);
  return p;
}
const join = async (p) => {
  await p.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  await p.getByText('Voz conectada').waitFor({ timeout: 20000 });
};
const params = (p) =>
  p.evaluate(() => {
    const pub = window.__aldetes.getRoom().localParticipant.getTrackPublication('screen_share');
    const prm = pub?.track?.sender?.getParameters();
    return { n: prm?.encodings?.length ?? 0, fps: prm?.encodings?.map((e) => e.maxFramerate), mime: pub?.track?.codec ?? null, degr: prm?.degradationPreference ?? null };
  });

try {
  const A = await user('str');
  const B = await user('ver');
  await A.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await A.getByRole('button', { name: 'Criar', exact: true }).click();
  await A.waitForURL(/channels\/\d+\/\d+/);
  await A.getByRole('button', { name: /Convidar amigos/ }).click();
  await A.waitForFunction(() => /invite\//.test(document.querySelector('input[readonly]')?.value ?? ''));
  const link = await A.locator('input[readonly]').first().inputValue();
  await A.keyboard.press('Escape');
  await B.goto(link);
  await B.getByRole('button', { name: 'Aceitar convite' }).click();
  await B.waitForURL(/channels\/\d+/);
  await join(A);
  await join(B);

  // 1) switches in the share dialog react to clicks
  await A.getByRole('button', { name: 'Tela', exact: true }).first().click();
  const lite = A.getByRole('dialog', { name: 'Compartilhar tela' }).getByRole('switch').first();
  const before = await lite.getAttribute('aria-checked');
  await lite.click();
  const after = await lite.getAttribute('aria-checked');
  await lite.click();
  check('Interruptor "Versão leve" liga e desliga com o clique', before === 'false' && after === 'true' && (await lite.getAttribute('aria-checked')) === 'false');

  // 2) 1080p · 120 FPS, games mode → one H.264 layer, maxFramerate 120, keeps the frame rate
  await A.getByRole('button', { name: '120 FPS' }).click();
  await A.getByRole('button', { name: '1080p Full HD' }).click();
  const hint = await A.getByText(/120 Hz ou mais/).isVisible();
  await A.screenshot({ path: `${SHOTS}/share-120.png` });
  await A.getByRole('button', { name: /Começar transmissão/ }).click();
  await A.waitForTimeout(2500);
  const p120 = await params(A);
  check('1080p 120 FPS sai numa versão só, em H.264, com limite de 120 FPS e mantendo o FPS', hint && p120.n === 1 && p120.fps[0] === 120 && /h264/i.test(String(p120.mime)) && p120.degr === 'maintain-framerate', JSON.stringify(p120));

  // 3) "Texto e código" now also uses H.264 (no temporal layers that a server could cut to 15 FPS)
  await A.getByRole('button', { name: 'Trocar tela' }).click();
  await A.getByText('Texto e código').click();
  await A.getByRole('button', { name: /Começar transmissão/ }).click();
  await A.waitForTimeout(2500);
  const pText = await params(A);
  check('"Texto e código" também em H.264 (sem camadas que caem para 15 FPS), mantendo a nitidez', pText.n === 1 && /h264/i.test(String(pText.mime)) && pText.degr === 'maintain-resolution', JSON.stringify(pText));

  // 4) light version ON → two copies, BOTH at the stream's frame rate
  await A.getByRole('button', { name: 'Trocar tela' }).click();
  await A.getByText('Jogos e vídeos').click();
  await A.getByRole('button', { name: '60 FPS' }).click();
  await A.getByRole('dialog', { name: 'Compartilhar tela' }).getByRole('switch').first().click();
  await A.getByRole('button', { name: /Começar transmissão/ }).click();
  await A.waitForTimeout(3000);
  const pLite = await params(A);
  check('Com a versão leve, as duas cópias têm 60 FPS (nunca 15)', pLite.n === 2 && pLite.fps.every((f) => f === 60), JSON.stringify(pLite));

  // 5) viewer: Auto / Máxima / Leve, diagnostics
  await B.waitForFunction(() => [...window.__aldetes.getRoom().remoteParticipants.values()].some((p) => p.getTrackPublication('screen_share')?.track), null, { timeout: 15000 });
  await B.waitForTimeout(1500);
  const tile = B.locator('[title^="Duplo clique"]').first();
  await tile.hover();
  const hasMax = await B.getByRole('button', { name: 'Máxima' }).isVisible();
  if (hasMax) await B.getByRole('button', { name: 'Máxima' }).click();
  await B.waitForTimeout(500);
  const chosen = await B.evaluate(() => Object.values(window.__aldetes.useVoice.getState().viewQuality)[0]);
  check('Quem assiste pode escolher "Máxima"', hasMax && chosen === 'max', `escolha: ${chosen}`);
  await tile.hover();
  await B.getByRole('button', { name: 'Diagnóstico' }).first().click();
  const report = await B.locator('pre').first().textContent({ timeout: 8000 }).catch(() => '');
  await B.screenshot({ path: `${SHOTS}/share-diag.png` });
  check('Diagnóstico gera relatório real (o que chega, codec, FPS, caminho, versão de quem transmite)', /Chegando: \d+×\d+ · \d+ FPS · H264/i.test(report) && /Caminho: (UDP|TCP|TURN)/.test(report) && /App de quem transmite: 0\./.test(report), report.split('\n').slice(3, 6).join(' | '));
  await B.keyboard.press('Escape');

  // 6) old-app warning: an app that doesn't report its version
  await A.evaluate(() => window.__aldetes.getRoom().localParticipant.setAttributes({ app: '' }));
  await B.waitForTimeout(6500);
  const warn = await B.getByText('app desatualizado').first().isVisible().catch(() => false);
  const islandWarn = await B.getByText(/está com o app desatualizado/).first().isVisible().catch(() => false);
  await B.screenshot({ path: `${SHOTS}/share-oldapp.png` });
  check('App desatualizado de alguém na call aparece como aviso (lista e ilha)', warn && islandWarn, `lista: ${warn} · ilha: ${islandWarn}`);
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
