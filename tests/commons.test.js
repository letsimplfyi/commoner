import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCategory, parseInput, parseRoute, makeQuery, queryKey, queryTitle, usesSearch, searchTerm, pageUrl, shareUrl, listUrl, infoUrl, existsUrl, countUrl,
  suggestUrl, filesByIdUrl, fileUrl, fetchFiles, fetchFile, normaliseSuggestions, gridSrc, viewSrc, resize, plain, displayTitle, normaliseFiles, normaliseInfo, normaliseExists, getJson, fetchInfo, CommonsError,
} from '../js/commons.js';
import { POPULAR, allPopular, entryName, entryDeep, randomEntry } from '../js/popular.js';
import { page, listResponse } from './fixtures.js';

test('parseCategory accepts names, prefixes, wiki syntax and Commons links', () => {
  const want = 'Photos taken by Vysakh Premkumar';
  for (const input of [
    want, `Category:${want}`, `category: ${want}`, `[[Category:${want}]]`, `[[:Category:${want}]]`, '  photos_taken_by_Vysakh_Premkumar  ',
    'https://commons.wikimedia.org/wiki/Category:Photos_taken_by_Vysakh_Premkumar',
    'https://commons.m.wikimedia.org/wiki/Category:Photos%20taken%20by%20Vysakh%20Premkumar#mw-subcategories',
    'https://commons.wikimedia.org/w/index.php?title=Category:Photos_taken_by_Vysakh_Premkumar&from=A',
    'https://commoner.letsimpl.fyi/?c=Photos+taken+by+Vysakh+Premkumar&f=x.jpg',
  ]) assert.equal(parseCategory(input), want, input);
});
test('parseCategory rejects things that are not categories', () => {
  for (const input of ['', '   ', null, undefined, 'https://example.org/wiki/Category:Foo', 'https://commons.wikimedia.org/wiki/File:Foo.jpg', 'https://commons.wikimedia.org/wiki/Main_Page',
    'Foo|bar', 'Foo "bar"', 'Category:', 'a'.repeat(201), 'javascript:alert(1)<x>', 'https://commoner.letsimpl.fyi/', 'https://evil.example/?c=Sunsets']) assert.equal(parseCategory(input), '', String(input));
});

test('the query: include, leave out, subcategories (on by default once it is more than one plain category), sort', () => {
  assert.deepEqual(makeQuery({ cats: ['A'] }), { cats: ['A'], not: [], sort: 'name', deep: false });
  assert.equal(makeQuery({ cats: ['A', 'B'] }).deep, true);
  assert.equal(makeQuery({ cats: ['A'], not: ['B'] }).deep, true);
  assert.equal(makeQuery({ cats: ['A'], deep: true }).deep, true);
  assert.equal(makeQuery({ cats: ['A', 'B'], deep: false }).deep, false);
  assert.deepEqual(makeQuery({ cats: ['A', 'A'], not: ['A', 'C', 'C'] }), { cats: ['A'], not: ['C'], sort: 'name', deep: true });
  assert.equal(usesSearch('A'), false); assert.equal(usesSearch({ cats: ['A'], deep: true }), true); assert.equal(usesSearch({ cats: ['A', 'B'] }), true);
  assert.equal(queryTitle({ cats: ['Nepal', 'Sunsets'], not: ['Kathmandu'] }), 'Nepal + Sunsets − Kathmandu');
  assert.notEqual(queryKey({ cats: ['A'] }), queryKey({ cats: ['A'], sort: 'newest' }));
});
test('routes: repeated c and x, d and s, f; links round-trip and stay short', () => {
  const route = parseRoute('?c=Nepal&c=Sunsets&x=Kathmandu&s=newest&f=A+b.jpg');
  assert.deepEqual([route.cats, route.not, route.sort, route.deep, route.f], [['Nepal', 'Sunsets'], ['Kathmandu'], 'newest', true, 'A b.jpg']);
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/?old=1#x', route, route.f), 'https://commoner.letsimpl.fyi/?c=Nepal&c=Sunsets&x=Kathmandu&s=newest&f=A+b.jpg');
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/', 'Foo bar'), 'https://commoner.letsimpl.fyi/?c=Foo+bar');
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/', { cats: ['Birds'], deep: true }), 'https://commoner.letsimpl.fyi/?c=Birds&d=1');
  assert.equal(shareUrl('https://commoner.letsimpl.fyi/', { cats: ['A', 'B'], deep: false }), 'https://commoner.letsimpl.fyi/?c=A&c=B&d=0');
  assert.equal(parseRoute('?c=Birds&d=1').deep, true); assert.equal(parseRoute('?c=A&c=B&d=0').deep, false); assert.deepEqual(parseRoute('').cats, []);
  assert.equal(parseRoute('?c=javascript:x<y>').cats.length, 0);
});
test('the home box accepts a name, a Commons link or a shared Commoner link with several categories', () => {
  assert.deepEqual(parseInput('Sunsets').cats, ['Sunsets']);
  assert.deepEqual(parseInput('https://commons.wikimedia.org/wiki/Category:Cats').cats, ['Cats']);
  const shared = parseInput('https://commoner.letsimpl.fyi/?c=Nepal&c=Sunsets&x=Kathmandu&s=newest');
  assert.deepEqual([shared.cats, shared.not, shared.sort], [['Nepal', 'Sunsets'], ['Kathmandu'], 'newest']);
  assert.equal(parseInput('https://example.org/'), null); assert.equal(parseInput(''), null); assert.equal(parseInput('https://commoner.letsimpl.fyi/'), null);
  assert.equal(pageUrl('File:A b/c.jpg'), 'https://commons.wikimedia.org/wiki/File:A_b/c.jpg');
});

test('one plain category lists its members; anything else becomes a Commons search with AND and NOT', () => {
  const plainUrl = new URL(listUrl('Foo bar', { sort: 'newest', cont: { cmcontinue: 'file|XYZ|1', continue: '-||' } })).searchParams;
  assert.equal(plainUrl.get('list'), 'categorymembers'); assert.equal(plainUrl.get('cmtitle'), 'Category:Foo bar'); assert.equal(plainUrl.get('cmsort'), 'timestamp');
  assert.equal(plainUrl.get('cmdir'), 'desc'); assert.equal(plainUrl.get('cmcontinue'), 'file|XYZ|1'); assert.equal(plainUrl.get('origin'), '*'); assert.equal(plainUrl.get('cmlimit'), '50');
  assert.equal(plainUrl.get('generator'), null, 'a generator gives no order for category members, so it is not used');
  const byName = new URL(listUrl('Foo')).searchParams;
  assert.equal(byName.get('cmsort'), 'sortkey'); assert.equal(byName.get('cmdir'), 'asc');
  const q = { cats: ['Nepal', 'Sunsets'], not: ['Kathmandu'], sort: 'newest' };
  assert.equal(searchTerm(q), 'deepcategory:"Nepal" deepcategory:"Sunsets" -deepcategory:"Kathmandu"');
  assert.equal(searchTerm({ cats: ['A', 'B'], deep: false }), 'incategory:"A" incategory:"B"');
  const search = new URL(listUrl(q, { cont: { gsroffset: '50', continue: 'gsroffset||' } })).searchParams;
  assert.equal(search.get('generator'), 'search'); assert.equal(search.get('gsrnamespace'), '6'); assert.equal(search.get('gsrsort'), 'create_timestamp_desc');
  assert.equal(search.get('gsroffset'), '50'); assert.equal(search.get('gsrsearch'), searchTerm(q)); assert.equal(search.get('iiurlwidth'), '500');
  assert.equal(new URL(listUrl({ cats: ['A', 'B'] })).searchParams.get('gsrsort'), 'relevance');
  assert.equal(new URL(countUrl(q)).searchParams.get('srinfo'), 'totalhits');
  assert.equal(new URL(existsUrl(['A', 'B'])).searchParams.get('titles'), 'Category:A|Category:B');
  const info = new URL(infoUrl('Foo')).searchParams;
  assert.equal(info.get('cmtype'), 'subcat'); assert.equal(info.get('prop'), 'categoryinfo|categories'); assert.equal(info.get('clshow'), '!hidden');
});

test('predictions use the Commons prefix search on the Category namespace', () => {
  const p = new URL(suggestUrl('Swayamb')).searchParams;
  assert.equal(p.get('list'), 'prefixsearch'); assert.equal(p.get('psnamespace'), '14'); assert.equal(p.get('pssearch'), 'Swayamb'); assert.equal(p.get('origin'), '*');
  assert.deepEqual(normaliseSuggestions({ query: { prefixsearch: [{ title: 'Category:Swayambhunath' }, { title: 'Category:Swayambhu Ganpati Temple' }] } }), ['Swayambhunath', 'Swayambhu Ganpati Temple']);
  assert.deepEqual(normaliseSuggestions({}), []);
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
test('category info: missing, empty, populated (with subcategories and parents)', () => {
  assert.deepEqual(normaliseInfo({ query: { pages: [{ title: 'Category:X', missing: true }] } }), { exists: false, files: 0, subcats: [], parents: [], missing: [] });
  assert.equal(normaliseInfo({ query: { pages: [{ title: 'Category:X', missing: true, categoryinfo: { files: 2 } }] } }).exists, true);
  const out = normaliseInfo({ query: { pages: [{ title: 'Category:X', categoryinfo: { files: 67, subcats: 1 }, categories: [{ title: 'Category:Parent' }] }], categorymembers: [{ title: 'Category:X/Y' }] } });
  assert.deepEqual(out, { exists: true, files: 67, subcats: ['X/Y'], parents: ['Parent'], missing: [] });
  assert.deepEqual(normaliseExists({ query: { pages: [{ title: 'Category:A', categoryinfo: { files: 1 } }, { title: 'Category:B', missing: true }] } }, ['A', 'B']), ['B']);
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

test('the popular list is unique, valid and safe to show first', () => {
  const names = allPopular().map(entryName);
  assert.ok(names.length >= 50, 'plenty to explore');
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, names.length, 'no duplicates');
  for (const name of names) assert.equal(parseCategory(name), name, name);
  assert.ok(POPULAR.every(g => g.title && g.items.length > 0));
  assert.ok(POPULAR[0].items.length >= 8, 'the first group fills the start-here row');
  assert.ok(names.includes(entryName(randomEntry(() => 0))) && names.includes(entryName(randomEntry(() => 0.999))));
  assert.equal(entryDeep('Plain'), false); assert.equal(entryDeep({ name: 'Broad', deep: true }), true);
  for (const unsafe of ['Paintings', 'Sculptures', 'Tattoos', 'Featured pictures of people']) assert.ok(!names.includes(unsafe), `${unsafe} must not be a start-here category`);
});

// ---- order: a category listing's pages carry no "index", so the order comes from the member list
const fakeFetch = routes => async url => { const p = new URL(url).searchParams; const body = routes(p); return { ok: true, json: async () => body }; };
const member = (id, name) => ({ pageid: id, ns: 6, title: `File:${name}` });
const detail = (id, name) => ({ pageid: id, ns: 6, title: `File:${name}`, imageinfo: [{ url: 'https://upload.wikimedia.org/x', thumburl: 'https://thumb.wikimedia.org/x', width: 4000, height: 3000, mime: 'image/jpeg', extmetadata: {} }] });
test('a plain category keeps the order of its member list, however the photo details come back', async () => {
  const members = [member(30, 'Newest.jpg'), member(10, 'Middle.jpg'), member(20, 'Oldest.jpg')], calls = [];
  const fetchImpl = fakeFetch(p => {
    calls.push(Object.fromEntries(p));
    if (p.get('list') === 'categorymembers') return { continue: { cmcontinue: 'file|NEXT|1', continue: '-||' }, query: { categorymembers: members } };
    return { query: { pages: [detail(20, 'Oldest.jpg'), detail(30, 'Newest.jpg'), detail(10, 'Middle.jpg')] } }; // scrambled on purpose
  });
  const page = await fetchFiles('Pictures', { sort: 'newest', fetchImpl });
  assert.deepEqual(page.files.map(f => f.name), ['Newest.jpg', 'Middle.jpg', 'Oldest.jpg']);
  assert.deepEqual(page.next, { cmcontinue: 'file|NEXT|1', continue: '-||' });
  assert.equal(calls[0].cmsort, 'timestamp'); assert.equal(calls[1].pageids, '30|10|20');
  assert.equal(page.skipped, 0);
});
test('a category listing continues with the cmcontinue it was given, and an empty category makes no second request', async () => {
  const calls = [];
  const empty = await fetchFiles('Nothing', { fetchImpl: fakeFetch(p => { calls.push(p.get('list') || p.get('pageids')); return { query: { categorymembers: [] } }; }) });
  assert.deepEqual(empty, { files: [], next: null, skipped: 0 }); assert.deepEqual(calls, ['categorymembers']);
  let sent;
  await fetchFiles('Pictures', { cont: { cmcontinue: 'file|AAA|9', continue: '-||' }, fetchImpl: fakeFetch(p => { sent ??= Object.fromEntries(p); return { query: { categorymembers: [] } }; }) });
  assert.equal(sent.cmcontinue, 'file|AAA|9');
});
test('searches still order by the index Commons gives them', async () => {
  const pages = [{ ...detail(1, 'Third.jpg'), index: 3 }, { ...detail(2, 'First.jpg'), index: 1 }, { ...detail(3, 'Second.jpg'), index: 2 }];
  const page = await fetchFiles({ cats: ['A', 'B'] }, { fetchImpl: fakeFetch(() => ({ query: { pages } })) });
  assert.deepEqual(page.files.map(f => f.name), ['First.jpg', 'Second.jpg', 'Third.jpg']);
});
test('one photo by name: its own details, or a clear error when it is not on Commons', async () => {
  assert.equal(new URL(fileUrl('A b.jpg')).searchParams.get('titles'), 'File:A b.jpg');
  assert.equal(new URL(filesByIdUrl([1, 2])).searchParams.get('pageids'), '1|2');
  const file = await fetchFile('A b.jpg', { fetchImpl: fakeFetch(() => ({ query: { pages: [detail(5, 'A b.jpg')] } })) });
  assert.equal(file.name, 'A b.jpg');
  await assert.rejects(fetchFile('Nope.jpg', { fetchImpl: fakeFetch(() => ({ query: { pages: [{ title: 'File:Nope.jpg', missing: true }] } })) }), /not on Commons/);
});
