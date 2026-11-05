// 2.1 worst case vs plain, same build/machine: a server chat with 40 messages from a person with an animated
// frame + theme, inside a server with icon animation and ambient — against the same chat with everything off.
// Medians of alternating runs (the machine is shared, so we alternate instead of running one block after the other).
// Usage: BASE=http://localhost:4173 node e2e/v21-perf.mjs
import { launch, accounts, serverFor, pageFor, api, measure, sleep, BASE } from './lib/v2.mjs';

const browser = await launch();
const [A, B] = await accounts('v21perf', 2);
const { serverId, textId } = await serverFor(A, [B]);
const a = await pageFor(browser, A);
const b = await pageFor(browser, B);
for (let i = 0; i < 40; i++) await api(a, 'POST', `/channels/${textId}/messages`, { content: `mensagem ${i}` });
const decorated = async (on) => {
  await api(a, 'PATCH', '/users/@me', on ? { bannerPreset: 'galaxy-drift', avatarDecoration: 'quantum-orbit', profileEffect: 'cosmic-arrival', profileTheme: 'eclipse', profileDecor: { nameEffect: 'shimmer', badge: 'star', cardBorder: 'flow' } } : { bannerPreset: null, avatarDecoration: null, profileEffect: null, profileTheme: null, profileDecor: null });
  const t = on ? { accent: '#60a5fa', scene: 'cosmic-horizon', iconAnim: 'orbit-glow', ambient: 'starlight', emblem: 'star', nameEffect: 'shimmer', cardBorder: 'flow', presentation: 'nebula', iconFrame: 'orbital' } : {};
  await api(a, 'POST', `/servers/${serverId}/studio/publish`, t);
  await sleep(800);
};
await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
await b.getByText('mensagem 39').waitFor({ timeout: 15000 });
// "on" is measured twice: right after the server opens (decoration playing) and at rest (after 12 s without
// interaction the Equilibrado profile lets persistent decoration rest — see useSettle)
const res = { off: [], on: [], rest: [] };
for (let r = 0; r < 3; r++)
  for (const k of ['off', 'on']) {
    await decorated(k === 'on');
    await b.goto(`${BASE}/#/channels/@me`);
    await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
    await b.getByText('mensagem 39').waitFor({ timeout: 15000 });
    await b.mouse.move(700, 400); // pointer over the chat, not the sidebar
    await sleep(800);
    res[k].push(await measure(b, 6000));
    if (k === 'on') {
      await sleep(7000);
      res.rest.push(await measure(b, 6000));
    }
  }
const med = (xs, f) => xs.map(f).sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const sum = (k) => ({ cpu: med(res[k], (x) => x.cpu), p95: med(res[k], (x) => x.p95), heapMB: med(res[k], (x) => x.heapMB), nodes: med(res[k], (x) => x.nodes) });
const frames = await b.evaluate(() => ({ animatedFrames: document.querySelectorAll('.deco:not(.deco-static)').length, staticFrames: document.querySelectorAll('.deco-static').length }));
console.log(JSON.stringify({ off: sum('off'), on: sum('on'), rest: sum('rest'), ...frames }));
console.log(`sem decoração: CPU ${sum('off').cpu}% · p95 ${sum('off').p95} ms  |  tudo ligado, ao abrir: CPU ${sum('on').cpu}% · p95 ${sum('on').p95} ms  |  tudo ligado, em repouso: CPU ${sum('rest').cpu}% · p95 ${sum('rest').p95} ms · heap ${sum('rest').heapMB} MB · molduras animadas no chat ${frames.animatedFrames}, paradas ${frames.staticFrames}`);
await browser.close();
