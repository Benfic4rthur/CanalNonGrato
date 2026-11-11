const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const MW = 'UC' + 'a'.repeat(22), SAFE = 'UC' + 'b'.repeat(22);
let context, worker, control, extensionId, profile, lookupCount, pageErrors;
const extensionPath = path.resolve(__dirname, '../extension');
const byline = (id = MW, name = 'MW Informática', handle = 'mw') => ({ runs: [{ text: name, navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: '/@' + handle } } }] });
const fixture = (pathname, videoId) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0f0f0f;color:#fff;font:16px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:24px}ytd-rich-item-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytd-reel-item-renderer,ytd-video-renderer,ytd-channel-renderer{display:block;min-height:140px;background:#222;padding:20px;border-radius:12px}a{color:#bbb}a.video{display:block;min-height:85px;background:#344250;border-radius:8px;color:white;padding:12px}ytd-video-owner-renderer{display:flex;align-items:center;padding:20px}</style></head><body>
<script>window.ytInitialData={items:[{compactVideoRenderer:{videoId:'mwVideo0001',shortBylineText:${JSON.stringify(byline())}}},{lockupViewModel:{contentId:'mwModern001',metadata:{lockupMetadataViewModel:{metadata:{contentMetadataViewModel:{metadataRows:[{metadataParts:[{text:{content:'MW Informática',commandRuns:[{onTap:{innertubeCommand:{browseEndpoint:{browseId:'${MW}',canonicalBaseUrl:'/@mw'}}}}]}}]}]}}}}}},{videoRenderer:{videoId:'safeVideo01',shortBylineText:${JSON.stringify(byline(SAFE, 'Canal Livre', 'livre'))}}}]};
${videoId ? `window.ytInitialPlayerResponse={videoDetails:{videoId:'${videoId}',channelId:'${MW}',author:'MW Informática'}};` : ''}</script>
<ytd-app><ytd-page-manager>
${pathname.startsWith('/watch') || pathname.startsWith('/shorts/') ? `<div id="movie_player"><video id="video"></video></div><ytd-video-owner-renderer><ytd-channel-name><a href="/@mw">MW Informática</a></ytd-channel-name></ytd-video-owner-renderer>` : ''}
${pathname.startsWith('/@') ? '<ytd-page-header-renderer><h1>MW Informática</h1></ytd-page-header-renderer>' : ''}
<main>
<ytd-compact-video-renderer id="compact"><a class="video" href="/watch?v=mwVideo0001">MACBOOK VIROU UMA MÁQUINA</a><ytd-channel-name><a href="/@mw">MW Informática</a></ytd-channel-name></ytd-compact-video-renderer>
<ytd-rich-item-renderer id="modern"><yt-lockup-view-model><a class="video" href="/watch?v=mwModern001">Vídeo em cartão moderno</a><yt-content-metadata-view-model><div class="ytContentMetadataViewModelMetadataRow"><span>MW Informática</span></div></yt-content-metadata-view-model></yt-lockup-view-model></ytd-rich-item-renderer>
<ytd-video-renderer id="safe"><a class="video" href="/watch?v=safeVideo01">Vídeo que continua no feed</a><ytd-channel-name><a href="/@livre">Canal Livre</a></ytd-channel-name></ytd-video-renderer>
<ytd-reel-item-renderer id="short"><a class="video" href="/shorts/shortMW0001">Short sem autor no cartão</a></ytd-reel-item-renderer>
<ytd-channel-renderer id="channel-result"><a href="/@mw"><span id="channel-title">MW Informática</span></a></ytd-channel-renderer>
</main></ytd-page-manager></ytd-app></body></html>`;

async function rpc(type, fields = {}) {
  return control.evaluate(message => chrome.runtime.sendMessage(message), { type, ...fields });
}
async function setRules(channels = []) {
  await control.evaluate(channels => chrome.storage.local.set({ blockedChannels: channels }), channels);
}
async function newYoutube(url = 'https://www.youtube.com/') {
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.locator('#compact .cng-block')).toBeAttached();
  return page;
}

test.beforeEach(async () => {
  pageErrors = [];
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cng-test-'));
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EDGE_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  context.on('page', page => page.on('pageerror', error => { pageErrors.push(error.message); }));
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  control = await context.newPage(); await control.goto(`chrome-extension://${extensionId}/options.html`);
  await context.route('https://www.youtube.com/**', async route => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('v') || /\/shorts\/([^/]+)/.exec(url.pathname)?.[1];
    if (!route.request().isNavigationRequest()) lookupCount++;
    // Browser routes don't intercept service-worker fetches; fixtures are also supplied below.
    await route.fulfill({ contentType: 'text/html', body: fixture(url.pathname, id) });
  });
});
test.beforeEach(async () => {
  // Manifest V3 workers sleep after inactivity, including while Edge scans a download.
  await control.evaluate(() => chrome.runtime.sendMessage({ type: 'test-wake' }));
  worker = context.serviceWorkers().find(w => w.url().includes(extensionId)) || await context.waitForEvent('serviceworker');
  // Resolve metadata through the real worker, with deterministic YouTube HTML responses.
  await worker.evaluate(({ MW, SAFE }) => {
    globalThis.fetch = async input => {
      const url = new URL(input); const id = url.searchParams.get('v');
      const safe = id === 'safeVideo01' || url.pathname.includes('livre');
      const channelId = safe ? SAFE : MW;
      const author = safe ? 'Canal Livre' : 'MW Informática';
      const html = id
        ? 'var ytInitialPlayerResponse = ' + JSON.stringify({ videoDetails: { videoId: id, channelId, author } }) + ';' + JSON.stringify({ ownerProfileUrl: 'https://www.youtube.com/@' + (safe ? 'livre' : 'mw') })
        : 'var ytInitialData = ' + JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: channelId, title: author, vanityChannelUrl: 'https://www.youtube.com/@' + (safe ? 'livre' : 'mw'), avatar: { thumbnails: [{ url: 'https://yt3.ggpht.com/test-avatar=s900-c', width: 900 }] } } } }) + ';';
      globalThis.testLookupCount = (globalThis.testLookupCount || 0) + 1;
      return new Response(html, { status: 200 });
    };
  }, { MW, SAFE });
  await setRules(); lookupCount = 0;
});
test.afterEach(async () => {
  await context.close(); await fs.rm(profile, { recursive: true, force: true });
  expect(pageErrors).toEqual([]);
});

test('bloqueia nome em recomendações antigas, lockups novos, Shorts e pesquisa; desbloqueia em todas as abas', async () => {
  const page = await newYoutube();
  const second = await newYoutube('https://www.youtube.com/results?search_query=mw');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/popup.html`);
  await panel.getByLabel('Canal para bloquear').fill('MW Informática');
  await panel.getByRole('button', { name: 'Bloquear', exact: true }).click();
  for (const target of [page, second]) {
    await expect(target.locator('#compact')).toBeHidden();
    await expect(target.locator('#modern')).toBeHidden();
    await expect(target.locator('#channel-result')).toBeHidden();
    await expect(target.locator('#short')).toBeHidden();
    await expect(target.locator('#safe')).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Desbloquear MW Informática' }).click();
  await expect(page.locator('#compact')).toBeVisible();
  await expect(second.locator('#short')).toBeVisible();
});

test('botão bloqueia pelo ID, persiste e oculta novos cartões e elementos reciclados', async () => {
  const page = await newYoutube();
  await page.locator('#compact .cng-block').click();
  await expect(page.locator('#compact')).toBeHidden();
  const rules = await worker.evaluate(async () => (await chrome.storage.local.get('blockedChannels')).blockedChannels);
  expect(rules[0].channelId).toBe(MW);
  await page.evaluate(() => {
    const card = document.createElement('ytd-video-renderer'); card.id = 'late';
    card.innerHTML = '<a class="video" href="/watch?v=lateMW00001">Novo vídeo</a><ytd-channel-name><a href="/@mw">Nome novo</a></ytd-channel-name>';
    document.querySelector('main').append(card);
  });
  await expect(page.locator('#late')).toBeHidden();
  await page.evaluate(() => {
    document.querySelector('#compact .video').href = '/watch?v=safeVideo01';
    const owner = document.querySelector('#compact ytd-channel-name a'); owner.href = '/@livre'; owner.textContent = 'Canal Livre';
  });
  await expect(page.locator('#compact')).toBeVisible();
  await page.reload();
  await expect(page.locator('#compact')).toBeHidden();
});

test('links diretos de vídeo, Shorts e canal recebem barreira e mídia não toca bloqueada', async () => {
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'MW Informática' } });
  for (const url of ['https://www.youtube.com/watch?v=mwVideo0001', 'https://www.youtube.com/shorts/shortMW0001', 'https://www.youtube.com/@mw']) {
    const page = await context.newPage(); await page.goto(url);
    await expect(page.locator('#cng-gate')).toBeVisible();
    expect(await page.locator('html').getAttribute('data-cng-gated')).toBe('');
    if (await page.locator('video').count()) {
      const wav = Buffer.alloc(44 + 16000);
      wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write('data', 36); wav.writeUInt32LE(16000, 40);
      await page.evaluate(async src => {
        const video = document.querySelector('video'); video.src = src;
        video.addEventListener('play', () => { video.dataset.playAttempted = 'yes'; }, { once: true });
        await video.play().catch(() => {});
      }, 'data:audio/wav;base64,' + wav.toString('base64'));
      expect(await page.locator('video').getAttribute('data-play-attempted')).toBe('yes');
      expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
    }
    await page.close();
  }
  const page = await context.newPage(); await page.goto('https://www.youtube.com/watch?v=mwVideo0001');
  await page.getByRole('button', { name: 'Desbloquear canal', exact: true }).click();
  await expect(page.locator('#cng-gate')).toHaveCount(0);
});

test('backup, busca, deduplicação e gravações concorrentes entre abas', async () => {
  test.setTimeout(60000); // Edge can scan exported downloads before exposing the file.
  const first = await context.newPage(); await first.goto(`chrome-extension://${extensionId}/options.html`);
  const second = await context.newPage(); await second.goto(`chrome-extension://${extensionId}/popup.html`);
  await Promise.all([
    first.evaluate(() => chrome.runtime.sendMessage({ type: 'block', channel: { name: 'MW Informática' } })),
    second.evaluate(() => chrome.runtime.sendMessage({ type: 'block', channel: { name: 'Outro canal' } }))
  ]);
  await expect(first.locator('.channel-row')).toHaveCount(2);
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'MW Informática' } });
  await expect(first.locator('.channel-row')).toHaveCount(2);
  await first.getByLabel('Buscar na lista de bloqueados').fill('informatica');
  await expect(first.locator('.channel-row')).toHaveCount(1);
  const downloadPromise = first.waitForEvent('download');
  await first.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(backup.channels).toHaveLength(2);
  await setRules();
  await first.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await first.getByLabel('Buscar na lista de bloqueados').fill('');
  await expect(first.locator('.channel-row')).toHaveCount(2);
  await first.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(first.locator('.channel-row')).toHaveCount(2);
});

test('não consulta metadados sem bloqueios e fica ociosa sem varreduras repetidas', async () => {
  const before = await worker.evaluate(() => globalThis.testLookupCount || 0);
  const page = await newYoutube();
  await page.waitForTimeout(250);
  expect(await worker.evaluate(() => globalThis.testLookupCount || 0)).toBe(before);
  await page.evaluate(() => {
    const main = document.querySelector('main');
    for (let i = 0; i < 500; i++) {
      const card = document.createElement('ytd-video-renderer');
      card.innerHTML = '<a class="video" href="/watch?v=safeVideo01">Vídeo livre</a><ytd-channel-name><a href="/@livre">Canal Livre</a></ytd-channel-name>';
      main.append(card);
    }
  });
  await expect(page.locator('.cng-block')).toHaveCount(505);
  await page.waitForTimeout(250);
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  const getMetrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const start = await getMetrics(); await page.waitForTimeout(1000); const end = await getMetrics();
  const idleCpuMs = (end.TaskDuration - start.TaskDuration) * 1000;
  console.log(`500 cartões extras: CPU ociosa em 1 s = ${idleCpuMs.toFixed(2)} ms`);
  expect(idleCpuMs).toBeLessThan(100);
  expect(await worker.evaluate(() => globalThis.testLookupCount || 0)).toBe(before);
});
test('Shorts v2 herdam metadados, prateleiras vazias somem e prateleiras mistas ficam', async () => {
  const page = await newYoutube();
  await page.evaluate(({ MW }) => {
    const shelf = document.createElement('ytd-reel-shelf-renderer'); shelf.id = 'shorts-shelf';
    shelf.innerHTML = '<h2>Últimos Shorts em MW</h2><ytm-shorts-lockup-view-model-v2><ytm-shorts-lockup-view-model><a href="/shorts/shortV20001">Short atual</a></ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2>';
    const params = btoa('\x08\x14\xba\x01\x18' + MW).replace(/\+/g, '-').replace(/\//g, '_');
    shelf.querySelector('ytm-shorts-lockup-view-model').data = { onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'shortV20001', params } } } };
    document.querySelector('main').prepend(shelf);
    const mixed = document.createElement('ytd-shelf-renderer'); mixed.id = 'mixed';
    mixed.innerHTML = '<ytd-video-renderer id="mixed-block"><a href="/watch?v=lateMW00001">Blocked</a><ytd-channel-name><a href="/@mw">MW Informática</a></ytd-channel-name></ytd-video-renderer><ytd-video-renderer id="mixed-safe"><a href="/watch?v=safeVideo01">Safe</a><ytd-channel-name><a href="/@livre">Canal Livre</a></ytd-channel-name></ytd-video-renderer>';
    document.querySelector('main').append(mixed);
  }, { MW });
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'MW Informática' } });
  await expect(page.locator('#shorts-shelf')).toBeHidden();
  await expect(page.locator('#mixed-block')).toBeHidden();
  await expect(page.locator('#mixed-safe')).toBeVisible();
  const rules = await worker.evaluate(async () => (await chrome.storage.local.get('blockedChannels')).blockedChannels);
  await rpc('unblock', { id: rules[0].id });
  await expect(page.locator('#shorts-shelf')).toBeVisible();
});
test('página de canal continua bloqueada se nome e handle mudarem com o mesmo ID', async () => {
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'Nome antigo' } });
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/@novohandle');
  await page.evaluate(({ MW }) => {
    window.ytInitialData = { metadata: { channelMetadataRenderer: { externalId: MW, vanityChannelUrl: 'https://www.youtube.com/@novohandle', title: 'Nome novo' } } };
    document.dispatchEvent(new Event('yt-page-data-updated'));
  }, { MW });
  await expect(page.locator('#cng-gate')).toBeVisible();
});
test('postagens bloqueadas removem cabeçalho e CTA; Shorts restantes ocupam as primeiras células', async () => {
  const page = await newYoutube();
  await page.evaluate(() => {
    const container = document.createElement('section');
    container.innerHTML = '<ytd-shelf-renderer id="post-shelf"><h2>Últimas postagens de MW Informática</h2><yt-horizontal-list-renderer><ytd-post-renderer><a class="yt-simple-endpoint" href="/@mw">MW Informática</a><p>Postagem indesejada</p></ytd-post-renderer><button>Mostrar todas as postagens</button></yt-horizontal-list-renderer></ytd-shelf-renderer><grid-shelf-view-model id="short-grid"><h2>Shorts</h2><div style="display:flex;gap:8px"><div class="ytGridShelfViewModelGridShelfItem" id="cell-block" style="width:120px"><ytm-shorts-lockup-view-model-v2><ytm-shorts-lockup-view-model><a href="/shorts/shortMW0001">Bloqueado</a><ytd-channel-name><a href="/@mw">MW Informática</a></ytd-channel-name></ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2></div><div class="ytGridShelfViewModelGridShelfItem" id="cell-safe" style="width:120px"><ytm-shorts-lockup-view-model-v2><ytm-shorts-lockup-view-model><a href="/shorts/safeVideo01">Livre</a><ytd-channel-name><a href="/@livre">Canal Livre</a></ytd-channel-name></ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2></div></div></grid-shelf-view-model>';
    document.body.prepend(container);
  });
  const firstCell = await page.locator('#cell-block').boundingBox();
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'MW Informática' } });
  await expect(page.locator('#post-shelf')).toBeHidden();
  await expect(page.locator('#cell-block')).toBeHidden();
  await expect(page.locator('#short-grid')).toBeVisible();
  await expect(page.locator('#cell-safe')).toBeVisible();
  const remainingCell = await page.locator('#cell-safe').boundingBox();
  expect(Math.abs(firstCell.x - remainingCell.x)).toBeLessThan(1);
  await setRules();
  await expect(page.locator('#post-shelf')).toBeVisible();
  await expect(page.locator('#cell-block')).toBeVisible();
});
test('fotos dos canais existentes chegam à lista e são exibidas como imagens', async () => {
  const page = await context.newPage();
  await context.route('https://yt3.ggpht.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=', 'base64') }));
  await setRules([{ id: 'old-rule', channelId: MW, path: '/@mw', name: 'MW Informática', addedAt: Date.now() }]);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('.avatar img')).toHaveAttribute('src', 'https://yt3.ggpht.com/test-avatar=s88-c');
  await expect.poll(() => page.locator('.avatar img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Desbloquear MW Informática' }).click();
  await expect(page.locator('.channel-row')).toHaveCount(0);
});
test('ações ficam fora dos títulos; canal aberto ganha botão após Inscrever-se mesmo se o cabeçalho chegar tarde', async () => {
  const page = await newYoutube();
  const title = await page.locator('#modern .video').boundingBox();
  const inlineButton = page.locator('#modern .cng-block');
  await expect(inlineButton).toBeVisible();
  const action = await inlineButton.boundingBox();
  expect(action.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/watch?v=mwVideo0001');
    const header = document.createElement('ytd-watch-metadata');
    header.innerHTML = '<div id="owner" style="display:flex;align-items:center"><ytd-video-owner-renderer style="padding:0"><ytd-channel-name><a href="/@mw">MW Informática</a></ytd-channel-name></ytd-video-owner-renderer><div id="subscribe-button"><button style="height:36px">Inscrever-se</button></div></div>';
    document.body.prepend(header);
  });
  const block = page.locator('#owner > .cng-block-label');
  await expect(block).toBeVisible();
  await expect(block).toHaveText(' Bloquear canal');
  expect(await block.evaluate(button => button.previousElementSibling.id)).toBe('subscribe-button');
  const subscribeRect = await page.locator('#subscribe-button').boundingBox();
  const blockRect = await block.boundingBox();
  expect(blockRect.x).toBeGreaterThanOrEqual(subscribeRect.x + subscribeRect.width);
  await block.click();
  await expect(page.locator('#cng-gate')).toBeVisible();
});

test('capturas da interface desktop e popup', async () => {
  await rpc('block', { channel: { channelId: MW, path: '/@mw', name: 'MW Informática' } });
  await rpc('block', { channel: { name: 'Canal de exemplo' } });
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('.channel-row')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/painel.png', fullPage: true });
  await page.setViewportSize({ width: 410, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.screenshot({ path: 'artifacts/popup.png', fullPage: true });
  await setRules();
  await expect(page.locator('.empty')).toBeVisible();
  await page.screenshot({ path: 'artifacts/popup-vazio.png', fullPage: true });
});

test('inscrições do guia ocultam botões nas listas e mudanças de inscrição são imediatas', async () => {
  const page = await newYoutube();
  await page.evaluate(({ MW }) => {
    window.ytInitialData.subscriptions = { guideSubscriptionsSectionRenderer: { items: [{ guideEntryRenderer: { navigationEndpoint: { browseEndpoint: { browseId: MW, canonicalBaseUrl: '/@mw' } } } }] } };
    document.dispatchEvent(new Event('yt-page-data-updated'));
  }, { MW });
  await expect(page.locator('#compact .cng-block')).toHaveCount(0);
  await expect(page.locator('#modern .cng-block')).toHaveCount(0);
  await expect(page.locator('#channel-result .cng-block')).toHaveCount(0);
  await expect(page.locator('#safe .cng-block')).toHaveCount(1);
  await page.evaluate(({ MW }) => {
    document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: false } }));
    document.dispatchEvent(new Event('yt-page-data-updated'));
  }, { MW });
  await expect(page.locator('#compact .cng-block')).toHaveCount(1);
  await page.evaluate(({ MW }) => document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: true } })), { MW });
  await expect(page.locator('#compact .cng-block')).toHaveCount(0);
});

test('Inscrito embaixo do vídeo oculta o botão e restaura ao cancelar a inscrição', async () => {
  const page = await newYoutube('https://www.youtube.com/watch?v=mwVideo0001');
  await page.evaluate(() => {
    const subscribe = document.createElement('ytd-subscribe-button-renderer');
    subscribe.setAttribute('subscribed', ''); subscribe.textContent = 'Inscrito';
    document.querySelector('ytd-video-owner-renderer').append(subscribe);
  });
  await expect(page.locator('ytd-video-owner-renderer .cng-block')).toHaveCount(0);
  await expect(page.locator('#compact .cng-block')).toHaveCount(0);
  await page.evaluate(() => {
    const subscribe = document.querySelector('ytd-subscribe-button-renderer');
    subscribe.removeAttribute('subscribed'); subscribe.textContent = 'Inscrever-se';
  });
  await expect(page.locator('ytd-video-owner-renderer .cng-block')).toHaveCount(1);
  await expect(page.locator('#compact .cng-block')).toHaveCount(1);
});

test('página de canal inscrito filtra os botões dos vídeos do próprio canal', async () => {
  const page = await newYoutube('https://www.youtube.com/@mw/videos');
  await page.evaluate(() => {
    const subscribe = document.createElement('ytd-subscribe-button-renderer');
    subscribe.setAttribute('subscribed', ''); subscribe.textContent = 'Inscrito';
    document.querySelector('ytd-page-header-renderer').append(subscribe);
  });
  await expect(page.locator('#compact .cng-block')).toHaveCount(0);
  await expect(page.locator('#safe .cng-block')).toHaveCount(1);
});

test('sincroniza a lista completa, incluindo paginação, sem abrir os canais e reutiliza o cache', async () => {
  const page = await context.newPage();
  let lists = 0, continuations = 0;
  const channel = (id, handle, name) => ({ channelRenderer: { channelId: id, title: { simpleText: name }, navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: '/@' + handle } } } });
  await page.addInitScript(() => {
    window.ytcfg = { get: key => ({ LOGGED_IN: true, DATASYNC_ID: 'test-account', SESSION_INDEX: 0, INNERTUBE_CONTEXT: { client: { clientVersion: 'test-version' } } })[key] };
  });
  await page.route('https://www.youtube.com/feed/channels', route => {
    lists++;
    return route.fulfill({ contentType: 'text/html', body: 'var ytInitialData = ' + JSON.stringify({ contents: { items: [channel(MW, 'mw', 'MW Informática'), { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'next-page' } } } }] } }) + ';' });
  });
  await page.route('https://www.youtube.com/youtubei/v1/browse', route => {
    continuations++;
    expect(route.request().postDataJSON().continuation).toBe('next-page');
    return route.fulfill({ json: { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [channel(SAFE, 'livre', 'Canal Livre')] } }] } });
  });
  await page.goto('https://www.youtube.com/');
  await expect(page.locator('#compact .cng-block')).toHaveCount(0);
  await expect(page.locator('#safe .cng-block')).toHaveCount(0);
  await expect.poll(() => continuations).toBe(1);
  await page.evaluate(() => {
    const card = document.createElement('ytd-playlist-panel-video-renderer'); card.id = 'name-only';
    card.innerHTML = '<ytd-channel-name><span id="text">Canal Livre</span></ytd-channel-name>';
    const other = document.createElement('ytd-video-renderer'); other.id = 'not-subscribed';
    other.innerHTML = '<ytd-channel-name><a href="/@outro">Outro canal</a></ytd-channel-name>';
    document.querySelector('main').append(card, other);
  });
  await expect(page.locator('#not-subscribed .cng-block')).toHaveCount(1);
  await expect(page.locator('#name-only .cng-block')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#safe .cng-block')).toHaveCount(0);
  expect(lists).toBe(1); expect(continuations).toBe(1);
  await page.evaluate(({ MW }) => document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: false } })), { MW });
  await expect(page.locator('#compact .cng-block')).toHaveCount(1);
  await expect(page.locator('#safe .cng-block')).toHaveCount(0);
  await page.evaluate(() => {
    window.ytcfg = { get: key => key === 'LOGGED_IN' ? false : undefined };
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(page.locator('#safe .cng-block')).toHaveCount(1);
});

test('falha na lista não inventa inscrições nem sobrescreve cancelamento recebido durante a consulta', async () => {
  const page = await newYoutube();
  let complete;
  const responseReady = new Promise(resolve => { complete = resolve; });
  await page.route('https://www.youtube.com/feed/channels', async route => {
    await responseReady;
    await route.fulfill({ contentType: 'text/html', body: 'var ytInitialData = ' + JSON.stringify({ contents: { items: [{ channelRenderer: { channelId: MW, title: { simpleText: 'MW Informática' }, navigationEndpoint: { browseEndpoint: { browseId: MW, canonicalBaseUrl: '/@mw' } } } }] } }) + ';' });
  });
  await page.evaluate(({ MW }) => {
    window.ytcfg = { get: key => ({ LOGGED_IN: true, DATASYNC_ID: 'test-account' })[key] };
    document.dispatchEvent(new Event('yt-page-data-updated'));
    document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: false } }));
  }, { MW });
  complete();
  await expect.poll(() => page.evaluate(() => !!sessionStorage.getItem('cng:subscriptions:v1'))).toBe(true);
  await expect(page.locator('#compact .cng-block')).toHaveCount(1);
  await expect(page.locator('#safe .cng-block')).toHaveCount(1);
  await page.route('https://www.youtube.com/feed/channels', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.evaluate(() => {
    window.ytcfg = { get: key => ({ LOGGED_IN: true, DATASYNC_ID: 'other-account' })[key] };
    document.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await expect(page.locator('#compact .cng-block')).toHaveCount(1);
});

test('mudança de inscrição atualiza outras abas da mesma conta sem misturar contas diferentes', async () => {
  await context.addInitScript(() => {
    window.ytcfg = { get: key => ({ LOGGED_IN: true, DATASYNC_ID: 'account-one' })[key] };
  });
  await context.route('https://www.youtube.com/feed/channels', route => route.fulfill({ contentType: 'text/html', body: 'var ytInitialData = ' + JSON.stringify({ contents: { items: [{ channelRenderer: { channelId: MW, title: { simpleText: 'MW Informática' }, navigationEndpoint: { browseEndpoint: { browseId: MW, canonicalBaseUrl: '/@mw' } } } }] } }) + ';' }));
  const first = await context.newPage(), second = await context.newPage();
  await first.goto('https://www.youtube.com/'); await second.goto('https://www.youtube.com/');
  for (const page of [first, second]) {
    await expect(page.locator('#compact .cng-block')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!sessionStorage.getItem('cng:subscriptions:v1'))).toBe(true);
  }
  await first.evaluate(({ MW }) => document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: false } })), { MW });
  await expect(second.locator('#compact .cng-block')).toHaveCount(1);
  await second.evaluate(() => {
    window.ytcfg = { get: key => ({ LOGGED_IN: true, DATASYNC_ID: 'account-two' })[key] };
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(second.locator('#compact .cng-block')).toHaveCount(0);
  await first.evaluate(({ MW }) => document.dispatchEvent(new CustomEvent('yt-subscribe-state-changed', { detail: { channelId: MW, subscribed: false } })), { MW });
  await expect(second.locator('#compact .cng-block')).toHaveCount(0);
  await expect(second.locator('#safe .cng-block')).toHaveCount(1);
});
