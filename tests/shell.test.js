import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => existsSync(new URL(`../${path}`, import.meta.url));

test('manifest icons exist and the page links its icons and scripts', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(exists(icon.src), icon.src);
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable') && manifest.icons.some(i => i.sizes === '512x512'));
  const html = read('index.html');
  for (const [, href] of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)) assert.ok(exists(href), href);
});

test('the deploy workflow publishes every runtime file the page needs', () => {
  const workflow = read('.github/workflows/deploy.yml');
  for (const item of ['index.html', 'styles.css', 'manifest.json', '_headers', 'js', 'vendor', 'brand', 'icons']) assert.ok(workflow.includes(item), item);
  assert.match(workflow, /--project-name=commoner/);
});

test('icons are the brand kit copies (never redrawn here)', () => {
  const kit = read('icons/BRAND-README.md');
  assert.match(kit, /Commoner brand kit/);
  assert.match(read('icons/favicon.svg'), /Commoner/);
});

test('service worker: precaches every runtime file, versions its cache with the app, leaves Commons on the network', () => {
  const sw = read('sw.js');
  const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];')).matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  for (const file of shell) assert.ok(exists(file), `precached but missing: ${file}`);
  const html = read('index.html');
  const needed = [...html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)].map(m => m[1]).filter(f => !f.endsWith('.json') || f === 'manifest.json');
  for (const file of needed) assert.ok(shell.includes(file), `index.html loads ${file} but sw.js does not precache it`);
  for (const file of readdirSync(new URL('../js/', import.meta.url))) assert.ok(shell.includes(`js/${file}`), `js/${file} is not precached`);
  for (const icon of JSON.parse(read('manifest.json')).icons) assert.ok(shell.includes(icon.src), icon.src);
  const cache = sw.match(/const CACHE = 'commoner-shell-([^']+)'/)[1];
  assert.equal(cache, read('js/config.js').match(/APP_VERSION = '([^']+)'/)[1], 'CACHE and APP_VERSION must carry the same version (the deploy stamps both)');
  assert.match(sw, /cache: 'reload'/); assert.match(sw, /skipWaiting/); assert.match(sw, /SKIP_WAITING/); assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
  assert.match(read('js/main.js'), /startUpdates/); assert.match(read('js/update.js'), /register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
});

test('the deploy workflow stamps the version into the worker and the app', () => {
  const workflow = read('.github/workflows/deploy.yml');
  assert.match(workflow, /commoner-shell-dev/); assert.match(workflow, /APP_VERSION = 'dev'/); assert.match(workflow, /GITHUB_RUN_NUMBER/);
  assert.match(workflow, /sw\.js/);
});
