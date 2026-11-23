import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategory, pageUrl, shareUrl, listUrl, infoUrl, gridSrc, viewSrc, resize, plain, displayTitle, normaliseFiles, normaliseInfo, getJson, CommonsError } from '../js/commons.js';
import { page, listResponse } from './fixtures.js';

test('parseCategory accepts names, prefixes, wiki syntax and Commons links', () => {
  const want = 'Photos taken by Vysakh Premkumar';
  for (const input of [
    want, `Category:${want}`, `category: ${want}`, `[[Category:${want}]]`, `[[:Category:${want}]]`, '  photos_taken_by_Vysakh_Premkumar  ',
    'https://commons.wikimedia.org/wiki/Category:Photos_taken_by_Vysakh_Premkumar',
    'https://commons.m.wikimedia.org/wiki/Category:Photos%20taken%20by%20Vysakh%20Premkumar#mw-subcategories',
    'https://commons.wikimedia.org/w/index.php?title=Category:Photos_taken_by_Vysakh_Premkumar&from=A',
  ]) assert.equal(parseCategory(input), want, input);
});
test('parseCategory rejects things that are not categories', () => {
  for (const input of ['', '   ', null, undefined, 'https://example.org/wiki/Category:Foo', 'https://commons.wikimedia.org/wiki/File:Foo.jpg',
    'https://commons.wikimedia.org/wiki/Main_Page', 'Foo|bar', 'Category:', 'a'.repeat(201), 'javascript:alert(1)<x>']) assert.equal(parseCategory(input), '', String(input));
});
test('urls', () => {
  assert.equal(pageUrl('File:A b/c.jpg'), 'https://commons.wikimedia.org/wiki/File:A_b/c.jpg');
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/?old=1#x', 'Foo bar'), 'https://commoner.letsimpl.fyi/?c=Foo+bar');
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/', 'Foo', 'A b.jpg'), 'https://commoner.letsimpl.fyi/?c=Foo&f=A+b.jpg');
});
test('list and info requests use CORS-safe, anonymous Commons API parameters', () => {
  const u = new URL(listUrl('Foo bar', { sort: 'newest', cont: { gcmcontinue: 'file|XYZ|1', continue: 'gcmcontinue||' } }));
  assert.equal(u.origin + u.pathname, 'https://commons.wikimedia.org/w/api.php');
  const p = u.searchParams;
  assert.equal(p.get('origin'), '*'); assert.equal(p.get('gcmtitle'), 'Category:Foo bar'); assert.equal(p.get('gcmtype'), 'file');
  assert.equal(p.get('gcmsort'), 'timestamp'); assert.equal(p.get('gcmdir'), 'desc'); assert.equal(p.get('gcmcontinue'), 'file|XYZ|1'); assert.equal(p.get('continue'), 'gcmcontinue||');
  assert.equal(p.get('iiurlwidth'), '500');
  const n = new URL(listUrl('Foo')).searchParams;
  assert.equal(n.get('gcmsort'), 'sortkey'); assert.equal(n.get('gcmdir'), 'asc'); assert.equal(n.has('gcmcontinue'), false);
  assert.equal(new URL(infoUrl('Foo')).searchParams.get('cmtype'), 'subcat');
});
test('thumbnail sizes: grid 500, viewer 1280, never larger than the original, SVG untouched', () => {
  const f = normaliseFiles({ query: { pages: [page(1, 'Big one.jpg')] } }).files[0];
  assert.match(gridSrc(f), /\/500px-Big_one\.jpg$/); assert.match(viewSrc(f), /\/1280px-Big_one\.jpg$/);
  assert.equal(resize({ ...f, width: 800 }, 1280), f.url);
  assert.equal(resize({ ...f, mime: 'image/svg+xml' }, 500), f.url);
  assert.equal(resize({ ...f, thumb: '' }, 500), f.url);
});
test('plain text and titles', () => {
  assert.equal(plain('<p>Brick &amp; <b>sky</b>&nbsp;&lt;x&gt;</p>\n'), 'Brick & sky <x>');
  assert.equal(plain(undefined), '');
  assert.equal(displayTitle('Brick_building seen (2026-11-23-1456).jpg'), 'Brick building seen (2026-11-23-1456)');
});
test('normaliseFiles keeps API order, drops non-images and passes continuation on', () => {
  const json = listResponse(['A.jpg', 'B.jpg', 'C.jpg'], { gcmcontinue: 'file|C|9', continue: 'gcmcontinue||' });
  json.query.pages.push({ pageid: 5, title: 'File:Clip.webm', index: 4, imageinfo: [{ url: 'u', mime: 'video/webm', width: 1, height: 1 }] });
  json.query.pages.push({ pageid: 6, title: 'File:Gone.jpg', index: 5 });
  const out = normaliseFiles(json);
  assert.deepEqual(out.files.map(f => f.name), ['A.jpg', 'B.jpg', 'C.jpg']);
  assert.equal(out.skipped, 2); assert.deepEqual(out.next, { gcmcontinue: 'file|C|9', continue: 'gcmcontinue||' });
  assert.equal(out.files[0].description, 'Brick building & sky'); assert.equal(out.files[0].author, 'Vysakh Premkumar');
  assert.equal(out.files[0].license, 'CC BY-SA 4.0'); assert.equal(out.files[0].page, 'https://commons.wikimedia.org/wiki/File:A.jpg');
  assert.deepEqual(normaliseFiles({}), { files: [], next: null, skipped: 0 });
});
test('normaliseInfo handles missing, empty and populated categories', () => {
  assert.deepEqual(normaliseInfo({ query: { pages: [{ title: 'Category:X', missing: true }] } }), { exists: false, files: 0, subcats: [] });
  assert.equal(normaliseInfo({ query: { pages: [{ title: 'Category:X', missing: true, categoryinfo: { files: 2 } }] } }).exists, true);
  const out = normaliseInfo({ query: { pages: [{ title: 'Category:X', categoryinfo: { files: 67, subcats: 1 } }], categorymembers: [{ title: 'Category:X/Y' }] } });
  assert.deepEqual(out, { exists: true, files: 67, subcats: ['X/Y'] });
});
test('getJson separates network, http and api errors and never sends credentials or a referrer', async () => {
  let seen;
  const ok = async (url, init) => { seen = init; return { ok: true, json: async () => ({ a: 1 }) }; };
  assert.deepEqual(await getJson('https://x', { fetchImpl: ok }), { a: 1 });
  assert.equal(seen.credentials, 'omit'); assert.equal(seen.referrerPolicy, 'no-referrer');
  await assert.rejects(getJson('https://x', { fetchImpl: async () => { throw new TypeError('offline'); } }), e => e instanceof CommonsError && e.kind === 'network');
  await assert.rejects(getJson('https://x', { fetchImpl: async () => ({ ok: false, status: 503 }) }), e => e.kind === 'http');
  await assert.rejects(getJson('https://x', { fetchImpl: async () => ({ ok: true, json: async () => ({ error: { info: 'bad' } }) }) }), e => e.kind === 'api' && e.message === 'bad');
  const ac = new AbortController(); ac.abort();
  await assert.rejects(getJson('https://x', { signal: ac.signal, fetchImpl: async () => { throw new DOMException('aborted', 'AbortError'); } }), e => e.name === 'AbortError');
});
