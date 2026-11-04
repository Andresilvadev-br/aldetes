// Fast photos + voice messages, end to end with two browsers:
// A sends a big 4000×3000 photo → B gets a light thumbnail + instant blur preview (original only on open);
// A records a voice message (fake mic) → B sees the waveform player and it plays.
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? './e2e-shots';
const results = [];
const check = (n, ok, extra = '') => (results.push(ok), console.log(`${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`));
const run = Date.now().toString(36);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

async function user(name, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}]`, e.message));
  await page.goto(`${BASE}/#/register`);
  await page.getByLabel('E-mail').fill(`${name}${run}@t.dev`);
  await page.getByLabel('Nome de usuário').fill(`${name}_${run}`);
  await page.getByLabel('Senha').fill('senha-forte-123');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForURL(/channels/);
  return page;
}

try {
  const A = await user('foto');
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

  // a big, detailed "phone photo" (noise compresses badly → realistic multi-MB JPEG)
  const b64 = await A.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 4000, height: 3000 });
    const g = c.getContext('2d');
    const img = g.createImageData(4000, 3000);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % 4000;
      img.data[i] = (x / 16 + Math.random() * 90) | 0;
      img.data[i + 1] = (120 + Math.random() * 100) | 0;
      img.data[i + 2] = (200 - x / 25 + Math.random() * 50) | 0;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const dir = mkdtempSync(join(tmpdir(), 'aldetes-media-'));
  const photo = join(dir, 'foto-do-celular.jpg');
  writeFileSync(photo, Buffer.from(b64, 'base64'));
  const originalMB = Buffer.from(b64, 'base64').length / 1048576;

  await A.locator('input[type=file]').first().setInputFiles(photo);
  await A.getByRole('button', { name: 'Enviar mensagem' }).click();
  const att = await B.waitForFunction(
    () => {
      const st = window.__aldetes.useStore.getState();
      for (const cm of Object.values(st.messages)) for (const m of cm.items) for (const a of m.attachments ?? []) if (a.contentType.startsWith('image/')) return a;
      return null;
    },
    null,
    { timeout: 30000 },
  ).then((h) => h.jsonValue(), () => null);
  const sizeOf = async (url) => (await fetch(url)).arrayBuffer().then((b) => b.byteLength);
  const thumbKB = att?.thumbUrl ? (await sizeOf(new URL(att.thumbUrl, BASE).href)) / 1024 : null;
  const fullMB = att ? (await sizeOf(new URL(att.url, BASE).href)) / 1048576 : null;
  check(
    'Foto: quem recebe baixa uma miniatura leve (original só ao abrir)',
    !!att?.thumbUrl && thumbKB < 300 && !!att.placeholder,
    `original ${originalMB.toFixed(1)} MB → enviada ${fullMB?.toFixed(1)} MB · miniatura ${thumbKB?.toFixed(0)} KB · borrão ${att?.placeholder?.length ?? 0} bytes`,
  );
  const loadedSrc = await B.locator('button[aria-label^="Abrir imagem"] img:not([aria-hidden])').first().getAttribute('src');
  check('O chat mostra a miniatura, não o arquivo original', !!loadedSrc && loadedSrc === att?.thumbUrl);
  await B.waitForTimeout(800);
  await B.screenshot({ path: `${SHOTS}/media-photo.png` });

  // voice message (mouse: click starts a locked recording; fake mic = beeps)
  await A.getByRole('button', { name: /Gravar mensagem de voz/ }).click();
  await A.waitForTimeout(2600);
  await A.screenshot({ path: `${SHOTS}/media-recording.png` });
  await A.getByRole('button', { name: 'Enviar áudio' }).click();
  const voice = await B.locator('[aria-label="Mensagem de voz"]').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  check('Mensagem de voz chega com player e onda', voice);
  const meta = await B.evaluate(() => {
    const st = window.__aldetes.useStore.getState();
    for (const cm of Object.values(st.messages)) for (const m of cm.items) for (const a of m.attachments ?? []) if (a.waveform) return { ms: a.durationMs, bars: a.waveform.length, peak: Math.max(...a.waveform), type: a.contentType };
    return null;
  });
  check('Áudio tem duração e onda reais', !!meta && meta.ms > 2000 && meta.bars === 64 && meta.peak > 30, JSON.stringify(meta));
  await B.locator('[aria-label="Mensagem de voz"] button[aria-label="Ouvir"]').first().click();
  await B.waitForTimeout(1200);
  const playing = await B.evaluate(() => {
    const el = document.querySelector('[aria-label="Mensagem de voz"] audio');
    return el ? { t: el.currentTime, d: el.duration, paused: el.paused } : null;
  });
  await B.screenshot({ path: `${SHOTS}/media-voice.png` });
  check('O áudio toca para quem recebe', !!playing && playing.t > 0.3 && !playing.paused, JSON.stringify(playing));
} catch (e) {
  check('Roteiro', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  console.log(`${results.filter(Boolean).length}/${results.length} verificações passaram`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
