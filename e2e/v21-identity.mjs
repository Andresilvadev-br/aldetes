// 2.1 Identity & Worlds Studio end to end, with real accounts, real API and two (three) browsers.
// Usage: node e2e/v21-identity.mjs <shots>
import { launch, accounts, serverFor, pageFor, api, check, done, sleep, BASE } from './lib/v2.mjs';

const SHOTS = process.argv[2] ?? './e2e-shots';
const browser = await launch();
const openProfileEditor = (p) => p.evaluate(() => import('/src/lib/ui.ts').then((m) => m.openSettings('profile')));
try {
  const [A, B] = await accounts('ids', 2);
  const { serverId, textId } = await serverFor(A, [B]);
  const a = await pageFor(browser, A);
  const b = await pageFor(browser, B);
  const a2 = await pageFor(browser, A); // a second session of A (sync between sessions)

  // ---------- 1) Identity Studio: collection + adjustments, draft only until saved ----------
  await openProfileEditor(a);
  await a.getByRole('tab', { name: 'Coleções' }).click();
  await a.getByText('NEON GENESIS', { exact: true }).click();
  const prev = a.getByTestId('profile-preview');
  const pv = {
    frame: await prev.locator('.deco-neon-circuit').count(),
    theme: await prev.evaluate((el) => getComputedStyle(el).backgroundImage.includes('gradient')),
    name: await prev.locator('.nm-glow').count(),
    border: await prev.evaluate((el) => el.classList.contains('cb-flow')),
  };
  const unsaved = await a.getByTestId('unsaved').getByText(/não salvas/).isVisible();
  const notYet = (await api(b, 'GET', `/users/${A.id}`)).body.profileTheme ?? null;
  check('Coleção NEON GENESIS aplica banner, moldura, efeito, tema e decorações na pré-visualização (só rascunho)', pv.frame === 1 && pv.theme && pv.name === 1 && pv.border && unsaved && notYet === null, JSON.stringify({ ...pv, unsaved, notYet }));

  // banner options: colors / intensity / speed / reduced
  await a.getByRole('tab', { name: 'Banners' }).click();
  await a.getByText('Nebula Flow', { exact: true }).click();
  const opts = a.getByTestId('banner-options');
  await opts.getByLabel('Cor 1').fill('#ff0066');
  await opts.getByLabel('Intensidade').fill('40');
  await opts.getByLabel('Velocidade').fill('150');
  await opts.getByRole('button', { name: 'Reduzida' }).click();
  const vars = await prev.evaluate((el) => {
    const host = el.querySelector('.bn')?.closest('[style*="--b1"]') ?? el.querySelector('[style*="--b1"]');
    return { b1: host?.style.getPropertyValue('--b1'), spd: host?.style.getPropertyValue('--spd'), reduced: !!el.querySelector('.bn-reduced-wrap') };
  });
  check('Ajustes do banner (cor, intensidade, velocidade, animação reduzida) mudam a pré-visualização na hora', vars.b1 === '#ff0066' && Math.abs(parseFloat(vars.spd) - 100 / 150) < 0.01 && vars.reduced, JSON.stringify(vars));

  // undo + before/after
  await a.getByRole('button', { name: 'Desfazer' }).click();
  const undone = !(await prev.locator('.bn-reduced-wrap').count());
  await a.getByRole('button', { name: 'Antes', exact: true }).click();
  const before = await a.getByTestId('profile-preview').locator('.deco-neon-circuit').count();
  await a.getByRole('button', { name: 'Depois', exact: true }).click();
  check('Desfazer volta um passo; "Antes" mostra o perfil salvo e "Depois" o rascunho', undone && before === 0, JSON.stringify({ undone, before }));
  await opts.getByRole('button', { name: 'Reduzida' }).click();

  // combined view (chat / list / call sizes)
  await a.getByRole('button', { name: 'Combinado' }).click();
  const comb = a.getByTestId('combined-preview');
  const sizes = await comb.evaluate((el) => [...el.querySelectorAll('.deco')].map((d) => ({ w: Math.round(d.parentElement.getBoundingClientRect().width), stat: d.classList.contains('deco-static') })));
  check('Molduras adaptam ao tamanho: avatares pequenos (chat, lista, 28 px) ficam parados; o grande anima', sizes.length === 4 && sizes.filter((s) => s.w < 56).every((s) => s.stat) && sizes.some((s) => s.w >= 56 && !s.stat), JSON.stringify(sizes));
  await a.screenshot({ path: `${SHOTS}/v21-identity-editor.png` });

  // save → other person and the other session see it (no reload)
  await a.getByRole('button', { name: 'Salvar', exact: true }).click();
  await a.getByText('Tudo salvo.').waitFor({ timeout: 6000 });
  await sleep(900);
  const seen = (await api(b, 'GET', `/users/${A.id}`)).body;
  const live2 = await a2.evaluate(() => window.__aldetes.useStore.getState().me);
  check(
    'Salvar: o outro usuário recebe tudo e a outra sessão da mesma conta sincroniza sem recarregar',
    seen.bannerPreset === 'nebula-flow' && seen.bannerOptions?.c1 === '#ff0066' && seen.bannerOptions?.speed === 150 && seen.avatarDecoration === 'neon-circuit' && seen.profileEffect === 'electric-pulse' && seen.profileTheme === 'synthwave' && seen.profileDecor?.nameEffect === 'glow' && live2.profileTheme === 'synthwave' && live2.bannerOptions?.c1 === '#ff0066',
    JSON.stringify({ preset: seen.bannerPreset, o: seen.bannerOptions, deco: seen.avatarDecoration, fx: seen.profileEffect, th: seen.profileTheme, dec: seen.profileDecor, s2: live2.profileTheme }),
  );
  await a.keyboard.press('Escape');

  // ---------- 2) B opens A's card in the chat ----------
  await api(a, 'POST', `/channels/${textId}/messages`, { content: 'oi do 2.1' });
  await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
  await b.getByText('oi do 2.1').waitFor({ timeout: 10000 });
  const chatDeco = await b.evaluate(() => {
    const d = [...document.querySelectorAll('.deco-neon-circuit')];
    return { n: d.length, allStatic: d.every((x) => x.classList.contains('deco-static')) };
  });
  check('No chat, o avatar de A tem a moldura na versão parada (sem loop por mensagem)', chatDeco.n >= 1 && chatDeco.allStatic, JSON.stringify(chatDeco));
  await b.locator('li, [data-message-id]').filter({ hasText: 'oi do 2.1' }).first().locator('img, [class*=rounded-full]').first().click().catch(() => {});
  let card = b.locator('[data-profile-card]');
  if (!(await card.isVisible().catch(() => false))) {
    await b.getByText(A.username, { exact: false }).first().click().catch(() => {});
    card = b.locator('[data-profile-card]');
  }
  await card.waitFor({ timeout: 6000 });
  await sleep(700);
  const c = await card.evaluate((el) => ({
    theme: el.dataset.themeId,
    frameLive: !!el.querySelector('.deco-neon-circuit:not(.deco-static)'),
    name: !!el.querySelector('.nm-glow'),
    border: el.classList.contains('cb-flow'),
    fx: !!el.querySelector('.pfx-ring'),
    b1: el.querySelector('[style*="--b1"]')?.style.getPropertyValue('--b1'),
  }));
  await b.screenshot({ path: `${SHOTS}/v21-card-other.png` });
  check('B vê no cartão de A: tema, moldura animada, nome com brilho, borda, efeito e as cores do banner', c.theme === 'synthwave' && c.frameLive && c.name && c.border && c.fx && c.b1 === '#ff0066', JSON.stringify(c));
  await b.keyboard.press('Escape');
  await sleep(400);
  const closed = !(await b.locator('[data-profile-card]').isVisible().catch(() => false));
  check('O cartão fecha depois da fase de saída do efeito', closed);

  // ---------- 3) server-side validation and permissions ----------
  const bad = await Promise.all([
    api(a, 'PATCH', '/users/@me', { bannerOptions: { c1: 'red', c2: null, intensity: 80, speed: 100, reduced: false } }),
    api(a, 'PATCH', '/users/@me', { bannerOptions: { c1: null, c2: null, intensity: 500, speed: 100, reduced: false } }),
    api(a, 'PATCH', '/users/@me', { profileTheme: '<script>' }),
    api(a, 'PATCH', '/users/@me', { profileDecor: { nameEffect: 'glow', badge: 'skull', cardBorder: 'none' } }),
    api(a, 'PATCH', '/users/@me', { avatarDecoration: 'not-a-frame' }),
  ]);
  check('Valores inválidos de perfil são recusados pelo servidor (cor, intensidade, tema, emblema, moldura)', bad.every((r) => r.status === 400), bad.map((r) => r.status).join(','));

  const theme = { accent: '#22d3ee', scene: 'neon-skyline', sceneC1: '#22d3ee', sceneC2: '#ff2d78', speed: 120, iconAnim: 'pulse-beacon', ambient: 'ambient-particles', emblem: 'bolt', nameEffect: 'glow', cardBorder: 'flow', presentation: 'grid', template: 'cyber-district' };
  const forb = await api(b, 'POST', `/servers/${serverId}/studio/publish`, theme);
  const badSrv = await Promise.all([
    api(a, 'PUT', `/servers/${serverId}/studio/draft`, { ...theme, iconAnim: 'spin-forever' }),
    api(a, 'PUT', `/servers/${serverId}/studio/draft`, { ...theme, ambient: 'url(javascript:1)' }),
    api(a, 'PUT', `/servers/${serverId}/studio/draft`, { ...theme, speed: 9999 }),
    api(a, 'PUT', `/servers/${serverId}/studio/draft`, { ...theme, sceneC1: 'blue' }),
  ]);
  check('Worlds: só quem gerencia publica (403) e valores inválidos são recusados (400)', forb.status === 403 && badSrv.every((r) => r.status === 400), `${forb.status} · ${badSrv.map((r) => r.status).join(',')}`);

  // ---------- 4) Worlds Studio UI: collection, publish, members see it ----------
  await a.goto(`${BASE}/#/channels/${serverId}/${textId}`);
  await a.getByRole('button', { name: 'Menu do servidor' }).click();
  await a.getByText('Configurações do servidor').click();
  await a.getByText('Worlds', { exact: true }).first().click();
  await a.getByRole('tab', { name: 'Coleções' }).click();
  await a.getByRole('button', { name: /COSMIC LEGACY/ }).click();
  const prevS = a.getByTestId('studio-preview');
  const sp = { ia: await prevS.locator('.ia-orbit-glow').count(), amb: await prevS.locator('[data-ambient=starlight]').count(), invite: await a.getByTestId('studio-invite-preview').isVisible() };
  await a.screenshot({ path: `${SHOTS}/v21-worlds-editor.png` });
  await a.getByRole('button', { name: 'Desfazer' }).click();
  const undoneS = (await prevS.locator('.ia-orbit-glow').count()) === 0;
  await a.getByRole('button', { name: /COSMIC LEGACY/ }).click();
  await a.getByRole('button', { name: 'Publicar' }).click();
  await a.getByText('Publicado! Todos já veem o novo visual.').waitFor({ timeout: 6000 });
  check('Worlds Studio: coleção mostra ícone animado, ambiente e convite na prévia; desfazer funciona; publica', sp.ia >= 1 && sp.amb === 1 && sp.invite && undoneS, JSON.stringify({ ...sp, undoneS }));
  await a.keyboard.press('Escape');

  await b.goto(`${BASE}/#/channels/${serverId}/${textId}`);
  await sleep(1200);
  const m = await b.evaluate(() => {
    const header = document.querySelector('[data-testid=server-header]');
    const amb = document.querySelector('[data-ambient]');
    const list = document.querySelector('[data-message-list], main, [role=log]');
    const ar = amb?.getBoundingClientRect();
    const lr = list?.getBoundingClientRect();
    const overlap = ar && lr ? !(ar.right <= lr.left || ar.left >= lr.right) : null;
    return {
      ia: !!header?.querySelector('.ia-orbit-glow'),
      emblem: !!header?.querySelector('svg[aria-label=Estrela]'),
      name: !!header?.querySelector('.nm-shimmer'),
      amb: amb?.getAttribute('data-ambient'),
      ambZ: amb ? getComputedStyle(amb).zIndex : null,
      ambPE: amb ? getComputedStyle(amb).pointerEvents : null,
      overlap,
      parts: amb?.children.length ?? 0,
    };
  });
  await b.screenshot({ path: `${SHOTS}/v21-worlds-member.png` });
  check('Membro vê o servidor: ícone animado, emblema, nome destacado e ambiente', m.ia && m.emblem && m.name && m.amb === 'starlight', JSON.stringify(m));
  check('O ambiente fica atrás da lista de canais e nunca cobre as mensagens', m.ambPE === 'none' && m.overlap === false, JSON.stringify({ z: m.ambZ, pe: m.ambPE, overlap: m.overlap }));

  // particle budget follows the motion profile; Essencial pauses it
  const budget = {};
  for (const motion of ['ultra', 'balanced', 'performance']) {
    await b.evaluate((mo) => import('/src/lib/prefs.ts').then((x) => x.setPrefs({ motion: mo })), motion);
    await sleep(300);
    budget[motion] = await b.evaluate(() => {
      const amb = document.querySelector('[data-ambient]');
      const kids = amb ? [...amb.children] : [];
      return { n: kids.length, running: kids.filter((k) => getComputedStyle(k).animationPlayState === 'running').length };
    });
  }
  check('Partículas por perfil: Ultra > Equilibrado > Essencial, e no Essencial nada anima', budget.ultra.n > budget.balanced.n && budget.balanced.n > budget.performance.n && budget.performance.running === 0, JSON.stringify(budget));
  await b.evaluate(() => import('/src/lib/prefs.ts').then((x) => x.setPrefs({ motion: 'balanced' })));

  // the person's choice wins: "Usar aparência padrão (só para mim)"
  await b.evaluate((id) => import('/src/components/studio/ServerScene.tsx').then((x) => x.togglePlainServer(id)), serverId);
  await sleep(400);
  const plain = await b.evaluate(() => ({ ia: !!document.querySelector('[data-testid=server-header] .ia'), amb: !!document.querySelector('[data-ambient]') }));
  check('"Usar aparência padrão (só para mim)" remove ícone animado e ambiente só para quem escolheu', !plain.ia && !plain.amb, JSON.stringify(plain));
  await b.evaluate((id) => import('/src/components/studio/ServerScene.tsx').then((x) => x.togglePlainServer(id)), serverId);

  // ---------- 5) old configs stay compatible ----------
  const legacy = await api(b, 'PATCH', '/users/@me', { bannerPreset: 'aurora', avatarDecoration: 'orbital', profileEffect: 'sparkles' });
  const me = (await api(b, 'GET', '/users/@me')).body;
  check('Perfis antigos (sem tema/decoração/opções) continuam válidos e sem campos novos inventados', legacy.status === 200 && (me.profileTheme ?? null) === null && (me.bannerOptions ?? null) === null && (me.profileDecor ?? null) === null);
} catch (e) {
  check('Roteiro', false, e.message.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  process.exit(done() ? 0 : 1);
}
