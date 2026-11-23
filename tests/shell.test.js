import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
