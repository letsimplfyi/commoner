import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ALLOWED_HOSTS = new Set(['commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'commoner.letsimpl.fyi', 'letsimpl.fyi', 'github.com', 'brand.letsimpl.fyi', 'www.w3.org', 'example.org']);

test('branding is the vendored letsimpl.fyi brand, loaded before the app styles', () => {
  const meta = JSON.parse(read('brand/brand.json'));
  assert.equal(meta.source, 'https://brand.letsimpl.fyi');
  const html = read('index.html');
  const order = ['brand/tokens/tokens.css', 'brand/css/base.css', 'brand/css/components.css', 'styles.css'].map(f => html.indexOf(f));
  assert.ok(order.every(i => i > 0) && [...order].sort((a, b) => a - b).join() === order.join(), 'load order');
});

test('app styles follow the brand rules: no own colours, shadows, gradients, rounded corners or fonts', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...css.matchAll(/#[\da-fA-F]{3,8}\b/g)], [], 'no literal colours');
  assert.ok(!/box-shadow|drop-shadow|text-shadow/.test(css), 'no shadows');
  assert.ok(!/(linear|radial|conic)-gradient/.test(css), 'no gradients');
  assert.ok(!/border-radius:\s*[1-9]/.test(css), 'square corners');
  assert.ok(!/@font-face|font-family/.test(css), 'fonts come from the brand');
});

test('no inline scripts, styles or event handlers; no service worker; CSP allows only Commons', () => {
  const html = read('index.html');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html), 'no inline script');
  assert.ok(!/<style[\s>]/.test(html) && !/\sstyle="/.test(html) && !/\son[a-z]+="/.test(html));
  assert.ok(!existsSync(new URL('../sw.js', import.meta.url)), 'no service worker');
  assert.ok(!/serviceWorker/.test(readdirSync(new URL('../js/', import.meta.url)).map(f => read(`js/${f}`)).join('')));
  const csp = read('_headers').match(/Content-Security-Policy: (.*)/)[1];
  assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self' https:\/\/commons\.wikimedia\.org(;|$)/); assert.match(csp, /img-src 'self' data: https:\/\/upload\.wikimedia\.org https:\/\/thumb\.wikimedia\.org(;|$)/);
  assert.ok(!/unsafe-/.test(csp));
});

test('the only hosts the app talks to are Commons and its own links', () => {
  const sources = ['index.html', 'styles.css', 'manifest.json', ...readdirSync(new URL('../js/', import.meta.url)).map(f => `js/${f}`)];
  for (const file of sources) for (const [, host] of read(file).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.ok(ALLOWED_HOSTS.has(host), `${file} mentions ${host}`);
});

test('touch targets and reading size follow the brand (no tiny fixed font sizes)', () => {
  const css = read('styles.css');
  assert.ok(!/font-size:\s*(\d|1[0-3])px/.test(css));
  assert.match(css, /\.tile \{[^}]*aspect-ratio: 1/);
});
