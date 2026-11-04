// Real end-to-end test: two independent Chromium clients (separate contexts/cookies),
// real API, real Postgres/Redis, real LiveKit (WebRTC media flows through the SFU).
// Usage: node e2e/two-clients.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SHOTS = process.argv[3] ?? './e2e-shots';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'],
});

async function client(name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|401|WebSocket connection to 'ws:\/\/localhost:7880/.test(m.text()) && console.log(`[${name} console]`, m.text().slice(0, 300)));
  page.on('response', (r) => r.status() === 404 && console.log(`[${name} 404]`, r.url()));
  return { ctx, page, name };
}

async function register(c, username) {
  await c.page.goto(`${BASE}/#/register`);
  await c.page.getByLabel('E-mail').fill(`${username}@teste.dev`);
  await c.page.getByLabel('Nome de exibição').fill(username[0].toUpperCase() + username.slice(1, -run.length - 1));
  await c.page.getByLabel('Nome de usuário').fill(username);
  await c.page.getByLabel('Senha').fill('senha-forte-123');
  await c.page.getByRole('button', { name: 'Continuar' }).click();
  await c.page.waitForURL(/channels\/@me/, { timeout: 15000 });
}

const A = await client('A');
const B = await client('B');
const ua = `ana_${run}`;
const ub = `bruno_${run}`;

try {
  await register(A, ua);
  await register(B, ub);
  check('Dois usuários criam contas distintas e fazem login', true);
  await A.page.screenshot({ path: `${SHOTS}/01-home.png` });

  // A creates server
  await A.page.getByRole('button', { name: 'Adicionar um servidor' }).click();
  await A.page.getByLabel('Nome do servidor', { exact: false }).fill('Clube Aldetes');
  await A.page.getByRole('button', { name: 'Criar', exact: true }).click();
  await A.page.waitForURL(/channels\/\d+\/\d+/);
  await A.page.getByText('Boas-vindas a #geral!').waitFor();
  check('Usuário A cria um servidor', true);

  // invite link via header menu
  await A.page.locator('[aria-haspopup=menu]').click();
  await A.page.getByRole('button', { name: /Convidar pessoas/ }).click();
  const linkInput = A.page.locator('input[readonly]');
  await A.page.waitForFunction(() => !document.querySelector('input[readonly]')?.value.includes('Gerando'));
  const link = await linkInput.inputValue();
  await A.page.screenshot({ path: `${SHOTS}/02-invite.png` });
  await A.page.keyboard.press('Escape');
  const code = link.split('/invite/')[1];
  check('Convite gerado', !!code, link);

  await B.page.goto(`${BASE}/#/invite/${code}`);
  await B.page.getByRole('button', { name: 'Aceitar convite' }).click();
  await B.page.waitForURL(/channels\/\d+\/\d+/);
  check('Usuário B entra com o convite', true);

  // realtime messaging
  const msgB = `Olá Ana! ${run}`;
  await B.page.getByLabel(/Conversar em #geral/).fill(msgB);
  await B.page.keyboard.press('Enter');
  await A.page.getByText(msgB).waitFor({ timeout: 5000 });
  const msgA = `Oi Bruno, tudo certo? ${run}`;
  await A.page.getByLabel(/Conversar em #geral/).fill(msgA);
  await A.page.keyboard.press('Enter');
  await B.page.getByText(msgA).waitFor({ timeout: 5000 });
  check('Mensagens em tempo real nos dois sentidos', true);
  await A.page.screenshot({ path: `${SHOTS}/03-chat.png` });

  // voice
  for (const c of [A, B]) {
    await c.page.locator('[role=button]', { hasText: /^Geral/ }).first().click({ position: { x: 60, y: 20 } });
  }
  const waitConnected = (c) => c.page.waitForFunction(() => window.__aldetes?.useVoice.getState().state === 'connected', null, { timeout: 20000 });
  await Promise.all([waitConnected(A), waitConnected(B)]);
  const seesOther = (c) =>
    c.page.waitForFunction(() => (window.__aldetes.getRoom()?.remoteParticipants.size ?? 0) >= 1, null, { timeout: 15000 });
  await Promise.all([seesOther(A), seesOther(B)]);
  check('Ambos entram no mesmo canal de voz (LiveKit)', true);

  // audio actually flowing: inbound RTP bytes and audio level on the subscriber side
  // Audio really flowing: inbound RTP bytes grow AND the decoded remote track carries signal
  // (Chromium's fake mic emits a periodic beep; we measure RMS with an AnalyserNode).
  const inboundAudio = (c) =>
    c.page.evaluate(async () => {
      const room = window.__aldetes.getRoom();
      const p = [...room.remoteParticipants.values()][0];
      const pub = [...p.audioTrackPublications.values()][0];
      const track = pub?.track;
      if (!track) return { ok: false, reason: 'sem trilha de áudio remota' };
      const bytes = async () => {
        let b = 0;
        (await track.getRTCStatsReport())?.forEach((s) => s.type === 'inbound-rtp' && (b = s.bytesReceived));
        return b;
      };
      const b1 = await bytes();
      const ctx = new AudioContext();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let peak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        peak = Math.max(peak, Math.sqrt(sum / buf.length));
        await new Promise((r) => setTimeout(r, 50));
      }
      await ctx.close();
      const b2 = await bytes();
      return { ok: b2 > b1 && peak > 0.01, bytesDelta: b2 - b1, peakRms: +peak.toFixed(4) };
    });
  // wait a bit for the mic to start
  await A.page.waitForTimeout(2500);
  const aHearsB = await inboundAudio(A);
  const bHearsA = await inboundAudio(B);
  check('A recebe o áudio de B', aHearsB.ok, JSON.stringify(aHearsB));
  check('B recebe o áudio de A', bHearsA.ok, JSON.stringify(bHearsA));

  // server-side voice state propagated to the other client via Socket.IO
  await A.page.waitForFunction(() => Object.values(window.__aldetes.useStore.getState().voiceStates).length >= 2, null, { timeout: 10000 });
  check('Estados de voz propagados (webhook LiveKit → API → Socket.IO)', true);
  await A.page.screenshot({ path: `${SHOTS}/04-voice.png` });

  // camera
  await A.page.getByRole('button', { name: 'Câmera', exact: false }).first().click();
  const videoOk = await B.page.waitForFunction(
    () => {
      const vids = [...document.querySelectorAll('video')];
      return vids.some((v) => v.videoWidth > 0 && v.readyState >= 2);
    },
    null,
    { timeout: 15000 },
  ).then(() => true, () => false);
  check('B recebe o vídeo da câmera de A', videoOk);
  await B.page.screenshot({ path: `${SHOTS}/05-video.png` });

  // screen share (Chromium fake display capture)
  await A.page.getByRole('button', { name: /^Tela$/ }).click();
  await A.page.getByRole('button', { name: /Começar transmissão/ }).click();
  const screenOk = await B.page
    .waitForFunction(
      () => {
        const room = window.__aldetes.getRoom();
        const p = [...room.remoteParticipants.values()][0];
        const pub = p?.getTrackPublication('screen_share');
        const el = pub?.track?.attachedElements?.[0];
        return !!pub?.track && !!el && el.videoWidth > 0;
      },
      null,
      { timeout: 20000 },
    )
    .then(() => true, () => false);
  const shareInfo = await A.page.evaluate(() => {
    const pub = window.__aldetes.getRoom().localParticipant.getTrackPublication('screen_share');
    const s = pub?.track?.mediaStreamTrack.getSettings();
    return s ? `${s.width}x${s.height}@${s.frameRate}` : 'sem trilha';
  });
  check('A compartilha a tela e B visualiza a transmissão', screenOk, `captura local ${shareInfo}`);

  // Stream performance: single full-quality layer, encoder stats sampled for the streamer, viewer gets full FPS
  await A.page.waitForTimeout(7000);
  const perf = await A.page.evaluate(async () => {
    const st = window.__aldetes.useVoice?.getState?.().screenStats ?? null;
    const pub = window.__aldetes.getRoom().localParticipant.getTrackPublication('screen_share');
    const params = pub?.track?.sender?.getParameters();
    return { st, encodings: params?.encodings?.length ?? 0, degradation: params?.degradationPreference ?? null };
  });
  const recv = await B.page.evaluate(async () => {
    const p = [...window.__aldetes.getRoom().remoteParticipants.values()][0];
    const tr = p?.getTrackPublication('screen_share')?.track;
    const rep = await tr?.receiver?.getStats();
    let fps = 0, w = 0, h = 0, codec = '';
    const codecs = new Map();
    rep?.forEach((r) => { if (r.type === 'codec') codecs.set(r.id, r.mimeType); });
    rep?.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') { fps = r.framesPerSecond ?? 0; w = r.frameWidth; h = r.frameHeight; codec = codecs.get(r.codecId) ?? ''; } });
    return { fps: Math.round(fps), w, h, codec };
  });
  const capFps = perf.st?.sourceFps || Number(shareInfo.split('@')[1] ?? 0);
  check(
    'Transmissão em camada única com estatísticas do codificador',
    perf.encodings === 1 && !!perf.st && perf.st.fps > 0 && perf.st.mbps > 0,
    JSON.stringify({ encodings: perf.encodings, degradation: perf.degradation, sender: perf.st && { res: `${perf.st.width}x${perf.st.height}`, fps: perf.st.fps, fonte: perf.st.sourceFps, mbps: perf.st.mbps, codec: perf.st.codec, limit: perf.st.limit, hw: perf.st.hardware, enc: perf.st.encoder } }),
  );
  check('B recebe a tela no FPS que sai da captura', recv.fps >= capFps * 0.8, JSON.stringify({ ...recv, capturado: capFps }));

  // A real 60 FPS 1080p source (animated canvas; the fake display device is capped at ~20 FPS),
  // published with the same encoder settings the app uses for "Jogos e vídeos · 1080p 60".
  await A.page.evaluate(async () => {
    const room = window.__aldetes.getRoom();
    await room.localParticipant.setScreenShareEnabled(false);
    const c = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 });
    const g = c.getContext('2d');
    let f = 0;
    const draw = () => {
      f++;
      g.fillStyle = `hsl(${f % 360} 60% 20%)`;
      g.fillRect(0, 0, 1920, 1080);
      g.fillStyle = '#fff';
      for (let k = 0; k < 12; k++) g.fillRect((f * 9 + k * 160) % 1920, 90 * k, 140, 80);
      g.font = 'bold 120px sans-serif';
      g.fillText(String(f), 80, 1000);
    };
    setInterval(draw, 1000 / 60);
    const track = c.captureStream(60).getVideoTracks()[0];
    track.contentHint = 'motion';
    await room.localParticipant.publishTrack(track, {
      source: 'screen_share',
      screenShareEncoding: { maxBitrate: 12_000_000, maxFramerate: 60, priority: 'high' },
      videoEncoding: { maxBitrate: 12_000_000, maxFramerate: 60, priority: 'high' },
      simulcast: false,
      videoCodec: 'h264',
      backupCodec: { codec: 'vp8' },
      degradationPreference: 'maintain-framerate',
    });
  });
  await A.page.waitForTimeout(10000);
  const recv60 = await B.page.evaluate(async () => {
    const p = [...window.__aldetes.getRoom().remoteParticipants.values()][0];
    const tr = p?.getTrackPublication('screen_share')?.track;
    const sample = async () => {
      const rep = await tr?.receiver?.getStats();
      let o = null;
      rep?.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') o = r; });
      return o;
    };
    const a = await sample();
    await new Promise((r) => setTimeout(r, 3000));
    const b = await sample();
    if (!a || !b) return null;
    const dt = (b.timestamp - a.timestamp) / 1000;
    return { fps: Math.round((b.framesDecoded - a.framesDecoded) / dt), mbps: Math.round(((b.bytesReceived - a.bytesReceived) * 8) / dt / 1e5) / 10, w: b.frameWidth, h: b.frameHeight, dropped: b.framesDropped ?? 0 };
  });
  const send60 = await A.page.evaluate(async () => {
    const pub = window.__aldetes.getRoom().localParticipant.getTrackPublication('screen_share');
    const rep = await pub?.track?.sender?.getStats();
    let o = null, src = null;
    rep?.forEach((r) => { if (r.type === 'outbound-rtp' && r.kind === 'video') o = r; if (r.type === 'media-source' && r.kind === 'video') src = r; });
    return o && { fps: Math.round(o.framesPerSecond ?? 0), fonte: Math.round(src?.framesPerSecond ?? 0), limit: o.qualityLimitationReason, enc: o.encoderImplementation, res: `${o.frameWidth}x${o.frameHeight}` };
  });
  check('Fonte real de 60 FPS (1080p, H.264): B recebe perto de 60 FPS', !!recv60 && recv60.fps >= 50, JSON.stringify({ enviado: send60, recebido: recv60 }));
  await B.page.screenshot({ path: `${SHOTS}/06-screenshare.png` });

  // disconnection handling: drop B's signalling socket & check auto-reconnect of chat gateway
  await B.page.evaluate(() => window.__aldetes && null);
  await B.ctx.setOffline(true);
  await B.page.waitForTimeout(3000);
  await B.ctx.setOffline(false);
  const reconnected = await B.page.waitForFunction(() => window.__aldetes.useStore.getState().connection === 'connected', null, { timeout: 30000 }).then(() => true, () => false);
  check('Cliente B reconecta ao gateway após ficar offline', reconnected);
  const msg2 = `após reconexão ${run}`;
  await A.page.getByLabel(/Conversar em #geral/).count();
  // send from A via text channel route
  await A.page.locator('[role=button]', { hasText: /^geral$/ }).first().click();
  await A.page.getByLabel(/Conversar em #geral/).fill(msg2);
  await A.page.keyboard.press('Enter');
  await B.page.locator('[role=button]', { hasText: /^geral$/ }).first().click();
  const gotAfter = await B.page.getByText(msg2).waitFor({ timeout: 10000 }).then(() => true, () => false);
  check('Mensagens voltam a chegar após a reconexão', gotAfter);
  const voiceBack = await B.page.waitForFunction(() => window.__aldetes.useVoice.getState().state === 'connected', null, { timeout: 30000 }).then(() => true, () => false);
  check('Voz de B se recupera após queda de rede', voiceBack);
} catch (err) {
  check('Execução do roteiro', false, err.message);
  await A.page.screenshot({ path: `${SHOTS}/err-A.png` }).catch(() => {});
  await B.page.screenshot({ path: `${SHOTS}/err-B.png` }).catch(() => {});
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
  process.exit(failed ? 1 : 0);
}
