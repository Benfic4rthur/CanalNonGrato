const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('ativação em aba já aberta funciona sem recarregar e não duplica os botões', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cng-bootstrap-'));
  const staged = path.join(temporary, 'extension');
  await fs.cp(path.resolve(__dirname, '../extension'), staged, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(staged, 'manifest.json'), 'utf8'));
  // Simulate an old document that never received static document_start scripts.
  manifest.content_scripts = [];
  await fs.writeFile(path.join(staged, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    executablePath: process.env.EDGE_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true,
    args: [`--disable-extensions-except=${staged}`, `--load-extension=${staged}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head><style>ytd-video-renderer{display:block;width:300px;height:150px}</style></head><body><script>window.documentToken="same-document"</script><ytd-video-renderer id="blocked"><a href="/watch?v=mwVideo0001">Indesejado</a><ytd-channel-name><a href="/channel/UCaaaaaaaaaaaaaaaaaaaaaa">MW Informática</a></ytd-channel-name></ytd-video-renderer><ytd-video-renderer id="safe"><a href="/watch?v=safeVideo01">Livre</a><ytd-channel-name><a href="/@livre">Canal Livre</a></ytd-channel-name></ytd-video-renderer></body></html>' }));
    const page = await context.newPage(); await page.goto('https://www.youtube.com/results?search_query=mw');
    await expect(page.locator('.cng-block')).toHaveCount(0);
    await worker.evaluate(() => chrome.storage.local.set({ blockedChannels: [{ id: 'mw', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'MW Informática' }] }));
    await worker.evaluate(() => attachExistingTabs());
    await expect(page.locator('#blocked')).toBeHidden();
    await expect(page.locator('#safe .cng-block')).toBeVisible();
    expect(await page.evaluate(() => window.documentToken)).toBe('same-document');
    await worker.evaluate(() => attachExistingTabs());
    await expect(page.locator('#safe .cng-block')).toHaveCount(1);
    await worker.evaluate(() => chrome.storage.local.set({ blockedChannels: [] }));
    await expect(page.locator('#blocked')).toBeVisible();
  } finally { await context.close(); await fs.rm(temporary, { recursive: true, force: true }); }
});
