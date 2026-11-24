import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProfile, PRECISIONS, makeFileName, buildPage, uploadComment, publicGps, distanceM, LICENCES, DEFAULT_LICENCE, MAX_NAME_BYTES } from '../js/wikitext.js';

test('licence: CC BY-SA 4.0 is the default, as the Commons template', () => {
  assert.equal(DEFAULT_LICENCE, 'cc-by-sa-4.0');
  assert.equal(LICENCES[DEFAULT_LICENCE].template, '{{self|cc-by-sa-4.0}}');
});

test('file name: subject, date and the camera name, so it is descriptive and unique; never the bare camera name', () => {
  assert.equal(makeFileName({ subject: 'Swayambhunath', date: '2026-11-23T13:07:27', original: '2026-11-23-1426.jpg' }), 'Swayambhunath, 2026-11-23 (2026-11-23-1426).jpg');
  assert.equal(makeFileName({ subject: 'x', date: null, original: 'DSC_0001.JPEG' }), 'X (DSC 0001).jpg');
  assert.equal(makeFileName({ subject: '', date: '2026-11-23', original: 'IMG_1234.jpg' }), '', 'no subject, no name: the title blacklist refuses IMG_1234');
});
test('file name: characters Commons forbids are removed, and it stays under the byte limit with room for the " (12345)" suffix', () => {
  const name = makeFileName({ subject: 'A<b>[c]|{d}: e#f/g', date: '2026-11-23', original: 'a.jpg' });
  assert.ok(!/[#<>[\]|{}:/]/.test(name), name);
  const long = makeFileName({ subject: 'ö'.repeat(300), date: '2026-11-23', original: 'IMG_0001.jpg' });
  assert.ok(new TextEncoder().encode(long).length <= MAX_NAME_BYTES - 8);
  assert.ok(long.endsWith(' (IMG 0001).jpg'));
});

test('page: Information, own work, author, licence, tracking template and categories, in the Commons order', () => {
  const page = buildPage({ subject: 'Swayambhunath', date: '2026-11-23T13:07:27', gps: { lat: 27.7149, lon: 85.2904 }, author: 'Vysakh Premkumar', categories: ['Swayambhunath', 'Swayambhunath', 'Stupas in Nepal'] });
  assert.equal(page, [
    '== {{int:filedesc}} ==', '{{Information', '|description={{en|1=Swayambhunath}}', '|date={{According to Exif data|2026-11-23}}', '|source={{own}}', '|author=[[User:Vysakh Premkumar|Vysakh Premkumar]]', '}}',
    '{{Location|27.714900|85.290400}}', '', '== {{int:license-header}} ==', '{{self|cc-by-sa-4.0}}', '', '{{Uploaded from Commoner}}', '',
    '[[Category:Swayambhunath]]', '[[Category:Stupas in Nepal]]'].join('\n'));
});
test('page: without categories it asks for review, without GPS or a date it leaves them out, and free text cannot inject wikitext', () => {
  const page = buildPage({ subject: 'A {{delete}} [[Category:X]] | view', author: 'N' });
  assert.match(page, /\{\{subst:unc\}\}/); assert.ok(!/Location/.test(page)); assert.match(page, /\|date=\n/);
  assert.ok(!/\{\{delete\}\}|\[\[Category:X\]\]/.test(page));
});
test('upload comment names the file\'s own subject, never one fixed string', () => assert.equal(uploadComment({ subject: 'Lake' }), 'Uploaded with Commoner: Lake'));

test('privacy: GPS can be dropped, rounded, or removed inside a home zone', () => {
  const p = { lat: 27.714912345, lon: 85.290412345 }, home = { lat: 27.7149, lon: 85.2904, radius: 300 };
  assert.deepEqual(publicGps(p), { lat: 27.714912, lon: 85.290412 });
  assert.deepEqual(publicGps(p, { precision: 'street' }), { lat: 27.715, lon: 85.29 });
  assert.deepEqual(publicGps(p, { precision: 'town' }), { lat: 27.71, lon: 85.29 });
  assert.equal(publicGps(p, { precision: 'none' }), null);
  assert.equal(publicGps(p, { home }), null);
  assert.ok(publicGps({ lat: 28.2, lon: 85.3 }, { home }));
  assert.equal(publicGps(null), null);
  assert.ok(Math.abs(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 200);
});

test('profile: stored settings are untrusted; anything unknown falls back to the defaults (CC BY-SA 4.0, street precision)', () => {
  assert.deepEqual(cleanProfile(null), { licence: 'cc-by-sa-4.0', precision: 'street' });
  assert.deepEqual(cleanProfile({ licence: 'cc-zero', precision: 'none' }), { licence: 'cc-zero', precision: 'none' });
  assert.deepEqual(cleanProfile({ licence: 'all-rights-reserved', precision: '<b>' }), { licence: 'cc-by-sa-4.0', precision: 'street' });
  assert.ok(PRECISIONS.exact && PRECISIONS.none);
});
