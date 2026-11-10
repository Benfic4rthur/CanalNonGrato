// Opt-in check against the live YouTube site, in a temporary logged-out Edge profile.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cng-live-'));
  const extension = path.resolve(__dirname, '../extension');
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EDGE_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    page.on('pageerror', error => console.log('Page error:', error.message));
    await page.goto('https://www.youtube.com/results?search_query=MW+Inform%C3%A1tica', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('ytd-video-renderer,yt-lockup-view-model', { timeout: 30000 });
    await page.waitForTimeout(1500);
    console.log(JSON.stringify(await page.evaluate(() => ({shortsAncestors: [...document.querySelectorAll('ytm-shorts-lockup-view-model')].slice(0,1).map(el => {const a=[];for(let p=el.parentElement;p&&a.length<7;p=p.parentElement)a.push(p.tagName);return a;})}))));
    const before = await page.locator('.cng-block').count();
    console.log(JSON.stringify({ title: await page.title(), cardsWithButton: before }));
    await page.screenshot({ path: 'artifacts/youtube-antes.png' });
    const target = page.locator('.cng-block[aria-label*="MW Inform"]').first();
    await target.click();
    await page.waitForSelector('.cng-hidden', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(1500);
    const rules = await worker.evaluate(async () => (await chrome.storage.local.get('blockedChannels')).blockedChannels);
    console.log(JSON.stringify({ blocked: rules.map(r => ({ name: r.name, channelId: r.channelId, handle: r.handle })), hiddenCards: await page.locator('.cng-hidden').count() }));
    await page.screenshot({ path: 'artifacts/youtube-depois.png' });
    // Exercise the actual network resolver on a video seen in search, not a fixed public ID.
    const url = await page.locator('.cng-hidden a[href*="watch?"]').first().getAttribute('href');
    if (url) {
      const id = new URL(url, 'https://www.youtube.com').searchParams.get('v');
      const control = await context.newPage(); await control.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
      const resolution = await control.evaluate(id => chrome.runtime.sendMessage({ type: 'resolveVideo', videoId: id }), id);
      console.log(JSON.stringify({ networkResolution: resolution }));
      await page.goto('https://www.youtube.com/watch?v=' + id, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#cng-gate', { timeout: 20000 });
      await page.screenshot({ path: 'artifacts/youtube-link-bloqueado.png' });
      console.log('Direct video link blocked.');
    }
    await page.goto('https://www.youtube.com/watch?v=4BQjh1J01Xo', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#related .cng-block', { timeout: 25000 });
    console.log(JSON.stringify({ sidebarButtons: await page.locator('#related .cng-block').count() }));
    const sidebar = page.locator('#related .cng-block').first();
    const sidebarTitle = await sidebar.getAttribute('aria-label');
    await sidebar.click();
    await page.waitForFunction(() => document.querySelector('#related .cng-hidden'));
    console.log(JSON.stringify({ sidebarBlocked: sidebarTitle }));
    await page.screenshot({ path: 'artifacts/youtube-lateral.png' });
  } finally { await context.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
