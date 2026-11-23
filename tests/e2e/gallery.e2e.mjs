// Drives the real app in Chromium. Commons is faked with page.route(); any other request that leaves the machine fails the run.
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
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try { const body = await readFile(join(root, normalize(path === '/' ? '/index.html' : path))); res.writeHead(200, { 'content-type': types[extname(path)] || 'text/html', 'content-security-policy': CSP }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
test.after(async () => { await browser.close(); server.close(); });

const NAMES = ['Alpha one.jpg', 'Bravo two.jpg', 'Charlie three.jpg', 'Delta four.jpg', 'Echo five.jpg'];
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#888"/></svg>';

async function open(path = '/', { viewport = { width: 390, height: 780 }, commons } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const outside = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin === 'https://upload.wikimedia.org' || url.origin === 'https://thumb.wikimedia.org') return route.fulfill({ contentType: 'image/svg+xml', body: IMG });
    if (url.origin === 'https://commons.wikimedia.org' && url.pathname === '/w/api.php') {
      const p = url.searchParams;
      if (commons) return commons(route, p);
      if (p.has('generator')) {
        const title = p.get('gcmtitle');
        if (title === 'Category:Empty' || title === 'Category:Nope') return route.fulfill({ json: { batchcomplete: true, query: { pages: [] } } });
        return route.fulfill({ json: p.has('gcmcontinue') ? listResponse(NAMES.slice(3)) : listResponse(NAMES.slice(0, 3), { gcmcontinue: 'file|X|1', continue: 'gcmcontinue||' }) });
      }
      const missing = p.get('titles') === 'Category:Nope';
      return route.fulfill({ json: { query: { pages: [missing ? { title: p.get('titles'), missing: true } : { title: p.get('titles'), categoryinfo: { files: NAMES.length } }], categorymembers: missing ? [] : [{ title: 'Category:Sub one' }] } } });
    }
    outside.push(url.href); return route.abort();
  });
  const violations = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.goto(base + path);
  return { page, context, outside, violations };
}

test('home: a pasted Commons link opens the gallery, recents are kept, nothing leaves except Commons', async () => {
  const { page, context, outside, violations } = await open();
  await page.getByLabel('Category name or link').fill('https://commons.wikimedia.org/wiki/Category:Test_cat');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.locator('.tile').first().waitFor();
  assert.match(page.url(), /\?c=Test\+cat$/);
  assert.equal(await page.title(), 'Test cat · Commoner');
  assert.equal(await page.locator('h1').innerText(), 'Test cat');
  await page.getByText('5 files').waitFor();
  await page.getByRole('link', { name: 'Sub one' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.tile').length === 5); // the next page loads on its own near the end
  await page.getByRole('link', { name: 'Open another category' }).click();
  await page.getByRole('link', { name: 'Test cat' }).waitFor();
  assert.deepEqual(outside, []);
  assert.deepEqual(violations, [], 'the production CSP blocked something');
  await context.close();
});

test('home: input that is not a category shows an error and loads nothing', async () => {
  const { page, context } = await open();
  await page.getByLabel('Category name or link').fill('https://example.org/wiki/Category:Foo');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('alert').getByText('That is not a Commons category').waitFor();
  assert.equal(await page.locator('.tile').count(), 0);
  await context.close();
});

test('viewer: tap opens it, arrows and sideways scroll move, Escape and Back close, URL follows', async () => {
  const { page, context } = await open('/?c=Test+cat');
  await page.locator('.tile').nth(1).click();
  const dialog = page.locator('dialog.viewer');
  await dialog.waitFor();
  await page.getByText(/^2 \/ \d$/).waitFor();
  assert.match(page.url(), /&f=Bravo\+two\.jpg$/);
  await page.keyboard.press('ArrowRight');
  await page.getByText(/^3 \/ \d$/).waitFor();
  assert.match(page.url(), /&f=Charlie\+three\.jpg$/);
  await page.locator('.track').evaluate(el => { el.scrollTo({ left: 0, behavior: 'instant' }); });
  await page.getByText(/^1 \/ \d$/).waitFor();
  assert.equal(await page.locator('.slide img').count() > 0, true);
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByText('CC BY-SA 4.0').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('dialog.viewer .slide img')].some(i => i.complete && i.naturalWidth > 0)); // the 1280px image loads under the CSP
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.doesNotMatch(page.url(), /&f=/);
  await page.locator('.tile').nth(0).click();
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
  await page.getByText('There is no category called').waitFor();
  await context.close();
  ({ page, context } = await open('/?c=Empty'));
  await page.getByText('This category has no photos.').waitFor();
  await context.close();
  let down = true;
  ({ page, context } = await open('/?c=Test+cat', { commons: (route, p) => (down ? route.abort() : route.fulfill({ json: p.has('generator') ? listResponse(NAMES.slice(0, 2)) : { query: { pages: [{ title: 'Category:Test cat', categoryinfo: { files: 2 } }] } } })) }));
  await page.getByText('Could not reach Wikimedia Commons.').waitFor();
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('.tile').first().waitFor();
  assert.equal(await page.locator('.tile').count(), 2);
  await context.close();
});

test('theme toggle persists and the gallery is a 3-column grid on a phone', async () => {
  const { page, context } = await open('/?c=Test+cat', { viewport: { width: 360, height: 700 } });
  await page.locator('.tile').first().waitFor();
  const cols = await page.locator('.grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 3);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('button.theme').click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(before, after);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
  await context.close();
});
