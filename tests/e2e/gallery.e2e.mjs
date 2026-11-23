// Drives the real app in Chromium under the production CSP. Commons and the Feed API are faked with page.route();
// any other request that leaves the machine fails the run.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listResponse } from '../fixtures.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const CSP = (await readFile(join(root, '_headers'), 'utf8')).match(/Content-Security-Policy: (.*)/)[1]; // the real production policy
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let version = '1'; // what the "deploy" stamps into sw.js and js/config.js; tests change it to ship a new release
const stamp = (path, body) => (path === '/sw.js' || path === '/js/config.js')
  ? Buffer.from(body.toString().replace('commoner-shell-dev', `commoner-shell-v${version}`).replace("APP_VERSION = 'dev'", `APP_VERSION = '${version}'`)) : body;
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try { const body = stamp(path, await readFile(join(root, normalize(path === '/' ? '/index.html' : path)))); res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html', 'content-security-policy': CSP, 'cache-control': 'no-cache' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
test.after(async () => { await browser.close(); server.close(); });

const NAMES = ['Alpha one.jpg', 'Bravo two.jpg', 'Charlie three.jpg', 'Delta four.jpg', 'Echo five.jpg'];
const MISSING = ['Category:Nope', 'Category:Swayambhunat'];
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#888"/></svg>';
const FEED = { image: { title: 'File:Pointe Saint Mathieu - Phare.jpg', thumbnail: { source: 'https://upload.wikimedia.org/p/640px-Pointe.jpg', width: 640, height: 427 }, image: { source: 'https://upload.wikimedia.org/p/Pointe.jpg', width: 4000, height: 2667 },
  description: { text: 'View of the lighthouse' }, artist: { text: 'JackyM59' }, license: { type: 'CC BY-SA 4.0' } } };

async function open(path = '/', { viewport = { width: 390, height: 780 }, commons, workers = 'block', storage = {} } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: workers });
  await context.addInitScript(entries => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, storage);
  const page = await context.newPage();
  const outside = [], violations = [], seen = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin === 'https://upload.wikimedia.org' || url.origin === 'https://thumb.wikimedia.org') return route.fulfill({ contentType: 'image/svg+xml', body: IMG });
    if (url.origin === 'https://api.wikimedia.org') return route.fulfill({ json: FEED });
    if (url.origin === 'https://commons.wikimedia.org' && url.pathname === '/w/api.php') {
      const p = url.searchParams; seen.push(Object.fromEntries(p));
      if (commons) return commons(route, p);
      if (p.get('list') === 'prefixsearch') {
        const q = p.get('pssearch').toLowerCase();
        return route.fulfill({ json: { query: { prefixsearch: q.startsWith('sw') ? [{ title: 'Category:Swayambhunath' }, { title: 'Category:Swayambhu Ganpati Temple' }] : [] } } });
      }
      if (p.get('list') === 'search') return route.fulfill({ json: { query: { searchinfo: { totalhits: 5 }, search: [] } } });
      if (p.has('generator')) {
        const title = p.get('gcmtitle');
        if (MISSING.concat(['Category:Empty']).includes(title)) return route.fulfill({ json: { batchcomplete: true, query: { pages: [] } } });
        const more = p.has('gcmcontinue') || p.has('gsroffset');
        return route.fulfill({ json: more ? listResponse(NAMES.slice(3)) : listResponse(NAMES.slice(0, 3), p.get('generator') === 'search' ? { gsroffset: 50, continue: 'gsroffset||' } : { gcmcontinue: 'file|X|1', continue: 'gcmcontinue||' }) });
      }
      const titles = p.get('titles').split('|');
      return route.fulfill({ json: { query: { pages: titles.map(t => (MISSING.includes(t) ? { title: t, missing: true } : { title: t, categoryinfo: { files: NAMES.length }, categories: [{ title: 'Category:Parent cat' }] })), categorymembers: titles.length === 1 && !MISSING.includes(titles[0]) ? [{ title: 'Category:Sub one' }] : [] } } });
    }
    outside.push(url.href); return route.abort();
  });
  await page.goto(base + path);
  return { page, context, outside, violations, seen };
}
const tiles = page => page.locator('.tile');
const back = page => page.getByRole('link', { name: 'Back to categories' });

test('home: a pasted Commons link opens the gallery, recents are kept, nothing leaves except Commons, the CSP blocks nothing', async () => {
  const { page, context, outside, violations } = await open();
  await page.getByLabel('Category', { exact: true }).fill('https://commons.wikimedia.org/wiki/Category:Test_cat');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await tiles(page).first().waitFor();
  assert.match(page.url(), /\?c=Test\+cat$/);
  assert.equal(await page.title(), 'Test cat · Commoner');
  assert.equal(await page.locator('h1').innerText(), 'Test cat');
  await page.getByText('5 files').waitFor();
  await page.getByText('Related').click(); // parents and subcategories live in one quiet fold
  await page.getByRole('link', { name: 'Sub one' }).waitFor(); await page.getByRole('link', { name: 'Parent cat' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.tile').length === 5); // the next page loads on its own near the end
  await back(page).click();
  await page.getByRole('link', { name: 'Test cat' }).waitFor();
  assert.equal(await page.locator('.boot').count(), 0, 'no leftover loading text');
  assert.equal(await page.locator('#app').evaluate(el => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length), 0, 'no stray text in the app container');
  assert.deepEqual(outside, []);
  assert.deepEqual(violations, [], 'the production CSP blocked something');
  await context.close();
});

test('home: input that is not a category shows a short error and loads nothing', async () => {
  const { page, context } = await open();
  await page.getByLabel('Category', { exact: true }).fill('https://example.org/wiki/Category:Foo');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('alert').getByText('Not a Commons category.').waitFor();
  assert.equal(await tiles(page).count(), 0);
  await context.close();
});

test('viewer: tap opens it, arrows and sideways scroll move, Escape and Back close, URL follows', async () => {
  const { page, context } = await open('/?c=Test+cat');
  await tiles(page).nth(1).click();
  const dialog = page.locator('dialog.viewer');
  await dialog.waitFor();
  await page.getByText(/^2 \/ \d$/).waitFor();
  assert.match(page.url(), /&f=Bravo\+two\.jpg$/);
  await page.keyboard.press('ArrowRight');
  await page.getByText(/^3 \/ \d$/).waitFor();
  assert.match(page.url(), /&f=Charlie\+three\.jpg$/);
  await page.locator('.track').evaluate(el => { el.scrollTo({ left: 0, behavior: 'instant' }); });
  await page.getByText(/^1 \/ \d$/).waitFor();
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByText('CC BY-SA 4.0').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('dialog.viewer .slide img')].some(i => i.complete && i.naturalWidth > 0)); // the 1280px image loads under the CSP
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.doesNotMatch(page.url(), /&f=/);
  await tiles(page).nth(0).click();
  await dialog.waitFor();
  await page.goBack();
  await dialog.waitFor({ state: 'detached' });
  await context.close();
});

test('deep link: a file in the URL opens the viewer on it, even on a later page', async () => {
  const { page, context } = await open('/?c=Test+cat&f=Echo+five.jpg');
  await page.locator('dialog.viewer').waitFor();
  await page.getByText('5 / 5').waitFor();
  await context.close();
});

test('errors: unknown category warns, empty category says so, Commons down offers a retry', async () => {
  let { page, context } = await open('/?c=Nope');
  await page.getByText('No category “Nope”.').waitFor();
  await context.close();
  ({ page, context } = await open('/?c=Empty'));
  await page.getByText('No photos here.').waitFor();
  await context.close();
  let down = true;
  ({ page, context } = await open('/?c=Test+cat', { commons: (route, p) => (down ? route.abort() : route.fulfill({ json: p.has('generator') ? listResponse(NAMES.slice(0, 2)) : { query: { pages: [{ title: 'Category:Test cat', categoryinfo: { files: 2 } }] } } })) }));
  await page.getByText('Could not reach Wikimedia Commons.').waitFor();
  down = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await tiles(page).first().waitFor();
  assert.equal(await tiles(page).count(), 2);
  await context.close();
});

test('theme toggle persists and the gallery is a 3-column grid on a phone', async () => {
  const { page, context } = await open('/?c=Test+cat', { viewport: { width: 360, height: 700 } });
  await tiles(page).first().waitFor();
  assert.equal(await page.locator('.grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('button.theme').click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(before, after);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
  await context.close();
});

test('predictions: typing suggests categories, arrow keys and Enter choose; popular chips, More categories and Surprise me give options without typing', async () => {
  const { page, context } = await open();
  await page.getByRole('link', { name: 'Quality images' }).waitFor(); // the start-here row
  await page.getByText('More categories').click();
  await page.getByRole('link', { name: 'Sunsets' }).waitFor();
  await page.getByLabel('Category', { exact: true }).fill('Sw');
  const list = page.getByRole('listbox', { name: 'Suggested categories' });
  await list.getByRole('option', { name: 'Swayambhunath', exact: true }).waitFor();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByLabel('Category', { exact: true }).getAttribute('aria-activedescendant'), 'category-opt-1');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await page.locator('h1').filter({ hasText: 'Swayambhunath' }).waitFor();
  await back(page).click();
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await tiles(page).first().waitFor();
  assert.match(page.url(), /\?c=/);
  await back(page).click();
  await page.getByLabel('Category', { exact: true }).fill('https://commoner.letsimpl.fyi/?c=Nepal&c=Test+cat&x=Sub+one&s=newest');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.locator('h1').filter({ hasText: 'Nepal + Test cat − Sub one' }).waitFor();
  await context.close();
});

test('narrowing down: add a category, leave one out, toggle subcategories; each is a shareable link and a real search', async () => {
  const { page, context, seen } = await open('/?c=Test+cat');
  await tiles(page).first().waitFor();
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByLabel('Add category').fill('Sw');
  await page.getByRole('listbox', { name: 'Suggested categories' }).getByRole('option', { name: 'Swayambhunath', exact: true }).click();
  await page.locator('h1').filter({ hasText: 'Test cat + Swayambhunath' }).waitFor();
  assert.match(page.url(), /\?c=Test\+cat&c=Swayambhunath$/);
  await page.getByText('5 files').waitFor();
  assert.ok(seen.some(p => p.generator === 'search' && p.gsrsearch === 'deepcategory:"Test cat" deepcategory:"Swayambhunath"'), 'a deepcategory AND search was sent');
  await page.getByRole('group', { name: 'Next category' }).getByRole('button', { name: 'Leave out' }).click();
  await page.getByLabel('Leave out', { exact: true }).fill('Sw');
  await page.getByRole('listbox', { name: 'Suggested categories' }).getByRole('option', { name: 'Swayambhu Ganpati Temple' }).click();
  await page.locator('h1').filter({ hasText: 'Test cat + Swayambhunath − Swayambhu Ganpati Temple' }).waitFor();
  assert.match(page.url(), /&x=Swayambhu\+Ganpati\+Temple$/);
  assert.ok(seen.some(p => p.gsrsearch?.includes('-deepcategory:"Swayambhu Ganpati Temple"')), 'a NOT term was sent');
  await page.getByLabel('Subcategories').uncheck();
  await page.waitForFunction(() => location.search.includes('d=0'));
  assert.ok(seen.some(p => p.gsrsearch?.startsWith('incategory:"Test cat"')), 'switching subcategories off uses incategory');
  await page.getByRole('button', { name: 'Remove Swayambhunath' }).click();
  await page.locator('h1').filter({ hasText: /^Test cat − Swayambhu Ganpati Temple$/ }).waitFor();
  await page.getByRole('button', { name: 'Remove Test cat' }).click(); // the last included category goes home
  await page.getByLabel('Category', { exact: true }).waitFor();
  await context.close();
});

test('an unknown category offers close matches', async () => {
  const { page, context } = await open('/?c=Swayambhunat');
  await page.getByText('No category “Swayambhunat”.').waitFor();
  await page.getByRole('link', { name: 'Swayambhunath', exact: true }).waitFor();
  await context.close();
});

test('Copy link puts the gallery link on the clipboard', async () => {
  const { page, context } = await open('/?c=Test+cat&s=newest');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await tiles(page).first().waitFor();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await page.getByText('Link copied').waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${base}/?c=Test+cat&s=newest`);
  await context.close();
});

test('Picture of the day: a quiet card on the home page that opens the archive, newest first', async () => {
  const { page, context, violations } = await open();
  const card = page.locator('a.potd');
  await card.waitFor();
  assert.match(await card.innerText(), /Pointe Saint Mathieu - Phare/); assert.match(await card.innerText(), /JackyM59 · CC BY-SA 4\.0/);
  await card.click();
  await page.waitForFunction(() => location.search.includes('s=newest'));
  assert.match(page.url(), /c=Pictures\+of\+the\+day\+(?:\(|%28)\d{4}(?:\)|%29)&s=newest/);
  assert.deepEqual(violations, []);
  await context.close();
});

test('support: the ask appears after real use with the founder\'s words, amounts are the donor\'s choice, UPI opens their own app, "Not now" and "Don\'t ask again" are respected', async () => {
  const { page, context } = await open('/?c=Test+cat', { storage: { 'commoner-support': JSON.stringify({ galleries: 2, never: false, quietUntil: null }) } });
  await tiles(page).first().waitFor();
  const card = page.locator('aside.support-card');
  await card.waitFor(); // this gallery was the third
  assert.equal(await card.getByRole('heading').innerText(), 'Love this software ??');
  assert.match(await card.innerText(), /I love it too\.\.\. I'd ideally keep on making such simple stupid apps for making life easier\.\. help support my efforts by donating so I can keep on maintaining this\./);
  await card.getByRole('button', { name: 'Donate' }).click();
  const sheet = page.locator('dialog.support');
  await sheet.waitFor();
  const pay = sheet.getByRole('link', { name: /^Donate/ });
  assert.match(await pay.innerText(), /₹50/); assert.match(await pay.getAttribute('href'), /^upi:\/\/pay\?pa=vysakh\.6294-4@waaxis&pn=Commoner&am=50\.00&cu=INR&tn=Support%20Commoner$/);
  await sheet.getByRole('button', { name: '₹100' }).click();
  assert.match(await pay.getAttribute('href'), /am=100\.00/);
  await sheet.getByLabel('Any amount (₹)').fill('75.5');
  assert.match(await pay.getAttribute('href'), /am=75\.50/); assert.match(await pay.innerText(), /₹75\.50/);
  await sheet.getByLabel('Any amount (₹)').fill('abc');
  assert.equal(await sheet.getByRole('link', { name: /^Donate/ }).count(), 0, 'no pay button for an invalid amount');
  await sheet.getByLabel('Any amount (₹)').fill('1,000');
  assert.match(await sheet.getByRole('link', { name: /^Donate/ }).getAttribute('href'), /am=1000\.00/);
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await card.count(), 0, 'snoozed');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('commoner-support'))).quietUntil !== null, true);
  await page.reload(); await tiles(page).first().waitFor();
  assert.equal(await page.locator('aside.support-card').count(), 0, 'stays quiet for 30 days');
  await page.getByRole('button', { name: 'Support' }).click(); // the footer link always works
  await page.locator('dialog.support').waitFor();
  await page.keyboard.press('Escape');
  await context.close();
  const never = await open('/?c=Test+cat', { storage: { 'commoner-support': JSON.stringify({ galleries: 9, never: false, quietUntil: null }) } });
  await never.page.locator('aside.support-card').waitFor();
  await never.page.getByRole('button', { name: 'Don’t ask again' }).click();
  assert.equal(JSON.parse(await never.page.evaluate(() => localStorage.getItem('commoner-support'))).never, true);
  await never.context.close();
});

test('updates: a new release installs in the background, the idle page restarts into it and the photo stays open; the app also works offline', async () => {
  version = '1';
  const { page, context } = await open('/?c=Test+cat&f=Bravo+two.jpg', { workers: 'allow' });
  await page.locator('dialog.viewer').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // a returning visitor: the old version is now in control of the page
  await page.locator('dialog.viewer').waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Version 1, check for updates' }).waitFor({ state: 'attached' });
  assert.deepEqual(await page.evaluate(() => caches.keys()), ['commoner-shell-v1']);

  await context.setOffline(true); // the installed shell opens with no network
  await page.reload(); await page.locator('dialog.viewer').waitFor(); assert.equal(await page.title(), 'Test cat · Commoner');
  await context.setOffline(false);

  version = '2'; // ship a new release
  await page.keyboard.press('Escape'); // check for updates from the page itself (the open viewer blocks the page behind it)
  await page.locator('dialog.viewer').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Version 1, check for updates' }).click();
  await page.getByRole('button', { name: 'Update ready: restart' }).waitFor(); // installed and waiting; the page is not interrupted
  await tiles(page).nth(1).click(); // look at a photo while the update waits
  await page.locator('dialog.viewer').waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Version 2, check for updates' }).waitFor({ state: 'attached', timeout: 15000 }); // restarted by itself, in the background
  await page.evaluate(() => { delete document.visibilityState; });
  await page.locator('dialog.viewer').waitFor(); // the photo is still open after the restart
  assert.match(page.url(), /&f=Bravo\+two\.jpg$/);
  await page.getByText('Updated to 2').waitFor();
  assert.deepEqual(await page.evaluate(() => caches.keys()), ['commoner-shell-v2'], 'the old cache is gone');
  await context.close();
});
