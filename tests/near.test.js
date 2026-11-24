import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNear, nearAsked, nearUrl, nearKey, round3, formatDistance, nearListUrl, normaliseNearList, fetchNear, placeUrl, normalisePlace, fetchPlace, locate, DEFAULT_RADIUS, RADII, NEAR_PAGE } from '../js/near.js';

test('address: ?near=lat,lon is a place, rounded to about 100 m, with a distance from a fixed list', () => {
  assert.deepEqual(parseNear('?near=27.714912,85.290412'), { lat: 27.715, lon: 85.29, r: DEFAULT_RADIUS });
  assert.deepEqual(parseNear('?near=-33.8,151.2&r=5000'), { lat: -33.8, lon: 151.2, r: 5000 });
  assert.equal(parseNear('?near=1,2&r=999999').r, DEFAULT_RADIUS, 'only the offered distances');
  for (const bad of ['', '?near=', '?near=abc', '?near=91,0', '?near=0,181', '?near=1', '?near=1,2,3', '?near=<script>,1']) assert.equal(parseNear(bad), null, bad);
  assert.equal(nearAsked('?near='), true); assert.equal(nearAsked('?c=Foo'), false);
});
test('address: sharing a place round-trips and never carries more than 3 decimals', () => {
  const near = { lat: 27.714912, lon: 85.290412, r: 5000 };
  const url = nearUrl('https://commoner.letsimpl.fyi/?c=Old&f=x', near, 'Photo one.jpg');
  assert.equal(url, 'https://commoner.letsimpl.fyi/?near=27.715%2C85.290&r=5000&f=Photo+one.jpg');
  assert.deepEqual(parseNear(new URL(url).search), { lat: 27.715, lon: 85.29, r: 5000 });
  assert.equal(new URL(nearUrl('https://x.test/', { lat: 1, lon: 2, r: DEFAULT_RADIUS })).searchParams.has('r'), false, 'the default distance is left out');
  assert.equal(nearKey({ lat: 1, lon: 2, r: 1000 }), 'near:1,2,1000'); assert.equal(round3(27.71491), 27.715);
});
test('distance is short and plain', () => {
  assert.equal(formatDistance(3), 'Here'); assert.equal(formatDistance(240), '240 m'); assert.equal(formatDistance(1234), '1.2 km'); assert.equal(formatDistance(undefined), '');
});

test('the nearby list asks Commons for files near a point, nearest first, up to 500', () => {
  const q = new URL(nearListUrl({ lat: 27.715, lon: 85.29, r: 5000 })).searchParams;
  assert.equal(q.get('list'), 'geosearch'); assert.equal(q.get('gscoord'), '27.715|85.29'); assert.equal(q.get('gsradius'), '5000'); assert.equal(q.get('gsnamespace'), '6');
  assert.equal(q.get('gslimit'), '500'); assert.equal(q.get('origin'), '*'); assert.ok(RADII.every(r => r <= 10000), 'Commons allows at most 10 km');
  assert.deepEqual(normaliseNearList({ query: { geosearch: [{ pageid: 2, dist: 50 }, { pageid: 1, dist: 10 }, { pageid: 2, dist: 60 }] } }), [{ id: 1, dist: 10 }, { id: 2, dist: 50 }]);
  assert.deepEqual(normaliseNearList({}), []);
});

const detail = (id, name) => ({ pageid: id, ns: 6, title: `File:${name}`, imageinfo: [{ url: 'https://upload.wikimedia.org/x', thumburl: 'https://thumb.wikimedia.org/x', width: 4000, height: 3000, mime: 'image/jpeg', extmetadata: {} }] });
test('fetchNear: the nearest first, each with its distance, however the details come back; later pages need no new search', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => i + 1), calls = [];
  const fetchImpl = async url => {
    const p = new URL(url).searchParams; calls.push(p.get('list') || 'details');
    if (p.get('list') === 'geosearch') return { ok: true, json: async () => ({ query: { geosearch: ids.map(id => ({ pageid: id, dist: id * 10 })).reverse() } }) }; // scrambled
    const wanted = p.get('pageids').split('|').map(Number);
    return { ok: true, json: async () => ({ query: { pages: wanted.map(id => detail(id, `P${id}.jpg`)).reverse() } }) };
  };
  const first = await fetchNear({ lat: 1, lon: 2, r: 1000 }, { fetchImpl });
  assert.equal(first.files.length, NEAR_PAGE); assert.deepEqual(first.files.slice(0, 3).map(f => f.name), ['P1.jpg', 'P2.jpg', 'P3.jpg']);
  assert.deepEqual(first.files.slice(0, 3).map(f => f.dist), [10, 20, 30]); assert.equal(first.next.rest.length, 70);
  const second = await fetchNear({ lat: 1, lon: 2, r: 1000 }, { cont: first.next, fetchImpl });
  assert.equal(second.files[0].name, 'P51.jpg'); assert.equal(second.next.rest.length, 20);
  const third = await fetchNear({ lat: 1, lon: 2, r: 1000 }, { cont: second.next, fetchImpl });
  assert.equal(third.files.length, 20); assert.equal(third.next, null);
  assert.deepEqual(calls, ['geosearch', 'details', 'details', 'details'], 'one search, then only details');
});
test('fetchNear: nothing nearby is an empty page, with no second request', async () => {
  const calls = [];
  const page = await fetchNear({ lat: 0, lon: 0, r: 1000 }, { fetchImpl: async url => { calls.push(url); return { ok: true, json: async () => ({ query: { geosearch: [] } }) }; } });
  assert.deepEqual(page, { files: [], next: null, skipped: 0 }); assert.equal(calls.length, 1);
});

test('a place by name is a Commons category with coordinates, rounded; without them it says so', async () => {
  assert.equal(new URL(placeUrl('Swayambhunath')).searchParams.get('titles'), 'Category:Swayambhunath');
  assert.deepEqual(normalisePlace({ query: { pages: [{ coordinates: [{ lat: 27.714912, lon: 85.290412, primary: true }] }] } }), { lat: 27.715, lon: 85.29 });
  assert.equal(normalisePlace({ query: { pages: [{ title: 'Category:Nowhere' }] } }), null);
  await assert.rejects(fetchPlace('Nowhere', { fetchImpl: async () => ({ ok: true, json: async () => ({ query: { pages: [{ title: 'Category:Nowhere' }] } }) }) }), /no location/);
  assert.deepEqual(await fetchPlace('Swayambhunath', { fetchImpl: async () => ({ ok: true, json: async () => ({ query: { pages: [{ coordinates: [{ lat: 27.715, lon: 85.29 }] }] } }) }) }), { lat: 27.715, lon: 85.29 });
});

test('device position: rounded the moment it is read, and a refusal is passed on', async () => {
  const asked = [];
  const geo = { getCurrentPosition: (ok, fail, options) => { asked.push(options); ok({ coords: { latitude: 27.714912345, longitude: 85.290412345 } }); } };
  assert.deepEqual(await locate(geo), { lat: 27.715, lon: 85.29 });
  assert.ok(asked[0].timeout > 0 && asked[0].maximumAge > 0, 'a recent position is reused instead of asking the device again');
  await assert.rejects(locate({ getCurrentPosition: (ok, fail) => fail({ code: 1 }) }), e => e.code === 1);
  await assert.rejects(locate(null), /unsupported/);
});
