import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sniff, readPhoto, hasFacebookMarker } from '../js/exif.js';
import { exifApp1 } from './fixtures.js';
import { judge, REASONS, lightness, isDark, sharpness, sharpestTile, BLUR_BELOW, MIN_PIXELS } from '../js/rules.js';

// ---- a real JPEG with an EXIF block (the block comes from fixtures.js)
function jpeg({ make, date, gps, width = 4000, height = 3000 } = {}) {
  const sof = Buffer.from([0xFF, 0xC0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return new Uint8Array(Buffer.concat([Buffer.from([0xFF, 0xD8]), exifApp1({ make, date, gps }), sof, Buffer.from([0xFF, 0xDA, 0, 0])]));
}

test('exif: camera, date, GPS and size come out of a real JPEG', () => {
  const photo = readPhoto(jpeg({ make: 'Nokia', date: '2026:11:23 10:30:15', gps: { lat: 27.5, lon: -85.25, latDms: [[27, 1], [30, 1], [0, 1]], lonDms: [[85, 1], [15, 1], [0, 1]] } }));
  assert.equal(photo.format, 'jpeg');
  assert.equal(photo.make, 'Nokia'); assert.equal(photo.date, '2026-11-23T10:30:15');
  assert.deepEqual(photo.gps, { lat: 27.5, lon: -85.25 });
  assert.equal(photo.width, 4000); assert.equal(photo.height, 3000);
});
test('exif: a JPEG with none says so, and damaged or tiny input never throws', () => {
  const photo = readPhoto(jpeg());
  assert.equal(photo.make, ''); assert.equal(photo.date, null); assert.equal(photo.gps, null);
  for (const bytes of [new Uint8Array(0), new Uint8Array([0xFF, 0xD8, 0xFF]), new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF, 0x45, 0x78]), new Uint8Array(200).fill(7)]) assert.doesNotThrow(() => readPhoto(bytes));
});
test('exif: (0, 0) and out-of-range GPS are not positions', () => {
  assert.equal(readPhoto(jpeg({ make: 'X', gps: { lat: 1, lon: 1, latDms: [[0, 1], [0, 1], [0, 1]], lonDms: [[0, 1], [0, 1], [0, 1]] } })).gps, null);
  assert.equal(readPhoto(jpeg({ make: 'X', gps: { lat: 1, lon: 1, latDms: [[95, 1], [0, 1], [0, 1]], lonDms: [[10, 1], [0, 1], [0, 1]] } })).gps, null);
});
test('sniff: tells the types apart by their first bytes, not by the file name', () => {
  const bytes = (...b) => Uint8Array.from([...b, ...new Array(16).fill(0)]);
  assert.equal(sniff(bytes(0xFF, 0xD8, 0xFF, 0xE0)), 'jpeg');
  assert.equal(sniff(bytes(0x89, 0x50, 0x4E, 0x47)), 'png');
  assert.equal(sniff(Uint8Array.from(Buffer.from('GIF89a'))), 'gif');
  assert.equal(sniff(Uint8Array.from(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))), 'webp');
  assert.equal(sniff(Uint8Array.from(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0'))), 'heic');
  assert.equal(sniff(Uint8Array.from(Buffer.from('\0\0\0\x18ftypmp42\0\0\0\0'))), 'other');
  assert.equal(sniff(Uint8Array.from(Buffer.from('MM\0*\0\0\0\x08'))), 'tiff');
  assert.equal(sniff(bytes(1, 2, 3)), 'other');
});
test('exif: the Facebook marker is the FBMD block just after a Photoshop 8BIM block', () => {
  const marked = Uint8Array.from(Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.from('xx8BIMyyyyFBMDzz'), Buffer.alloc(40)]));
  assert.equal(hasFacebookMarker(marked), true); assert.equal(readPhoto(marked).facebook, true);
  assert.equal(hasFacebookMarker(Uint8Array.from(Buffer.from('xx8BIM' + 'y'.repeat(400) + 'FBMD'))), false);
  assert.equal(hasFacebookMarker(jpeg({ make: 'Nokia' })), false);
});

// ---- the rules
const camera = { make: 'Nokia', date: '2026-11-23T10:30:15', facebook: false };
const good = { name: 'PXL_20261123_103015.jpg', format: 'jpeg', width: 4000, height: 3000, photo: camera };
test('a camera photo with nothing wrong is staged', () => assert.deepEqual(judge(good), { staged: true, locked: false, reasons: [] }));
test('rules: no camera details, saved from the web, screenshots, people, dark, blurry and small each give their reason', () => {
  const reasons = facts => judge({ ...good, ...facts }).reasons;
  assert.deepEqual(reasons({ photo: { ...camera, make: '', date: null } }), ['noexif']);
  assert.deepEqual(reasons({ photo: { ...camera, facebook: true } }), ['web']);
  assert.deepEqual(reasons({ name: 'FB_IMG_1612345678.jpg' }), ['web']);
  assert.deepEqual(reasons({ name: 'IMG-20261123-WA0007.jpg' }), ['web']);
  assert.deepEqual(reasons({ name: 'Screenshot_20261123.png' }), ['screenshot']);
  assert.deepEqual(reasons({ faces: 2 }), ['people']);
  assert.deepEqual(reasons({ dark: true }), ['dark']);
  assert.deepEqual(reasons({ sharp: BLUR_BELOW - 1 }), ['blurry']);
  assert.deepEqual(reasons({ width: 800, height: 600 }), ['small']);
  assert.deepEqual(reasons({ width: 1000, height: MIN_PIXELS / 1000 }), []);
  assert.equal(judge({ ...good, dark: true, faces: 1 }).staged, false);
});
test('rules: a file type Commons does not take, or an unreadable file, cannot be added back', () => {
  for (const format of ['heic', 'other', 'unreadable']) { const v = judge({ ...good, format }); assert.equal(v.staged, false); assert.equal(v.locked, true); assert.equal(v.reasons.length, 1); }
  assert.equal(judge({ ...good, dark: true }).locked, false);
});
test('every reason has a plain label, and a quote that is Commons\' own wording with the page it comes from', () => {
  const quotes = new Set();
  for (const [id, r] of Object.entries(REASONS)) {
    assert.ok(r.label && r.label.length < 50, id);
    if (r.quote) { assert.ok(r.page, id); quotes.add(r.quote); }
  }
  const joined = [...quotes].join('\n');
  for (const words of ['has a particular meaning at Commons', 'does not host Fair use content', 'Screenshots are derivative works', 'consider the legal and moral rights of the subject', 'meet certain quality standards']) assert.ok(joined.includes(words), words);
});

// ---- the measurements
const solid = (r, g, b, n = 100) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) a.set([r, g, b, 255], i * 4); return a; };
test('darkness follows the Commons app: dark only when too few pixels are bright or medium', () => {
  assert.equal(isDark(lightness(solid(5, 5, 5))), true);
  assert.equal(isDark(lightness(solid(200, 200, 200))), false);
  assert.equal(isDark(lightness(solid(80, 80, 80))), false); // lightness 31%: medium bright
  const mostlyBlack = solid(0, 0, 0, 1000); for (let i = 0; i < 30; i++) mostlyBlack.set([255, 255, 255, 255], i * 4); // 3% bright
  assert.equal(isDark(lightness(mostlyBlack)), false);
});
test('sharpness: flat is low, a checkerboard is high', () => {
  assert.ok(sharpness(solid(120, 120, 120, 256), 16, 16) < BLUR_BELOW);
  const board = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) board.set(((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]), (y * 16 + x) * 4);
  assert.ok(sharpness(board, 16, 16) > BLUR_BELOW);
});
test('sharpness of a photo is its sharpest region: a sharp corner in a flat photo counts, an all-flat photo does not', () => {
  const w = 64, h = 64, flat = solid(120, 120, 120, w * h), cornered = new Uint8ClampedArray(flat);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) cornered.set((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * w + x) * 4);
  assert.ok(sharpestTile(flat, w, h) < BLUR_BELOW);
  assert.ok(sharpestTile(cornered, w, h) > BLUR_BELOW);
  assert.ok(sharpestTile(flat, 4, 4) < BLUR_BELOW, 'a tiny image falls back to the whole image');
});

test('the upload screen sends nothing: its modules make no network request', () => {
  for (const file of ['exif.js', 'rules.js', 'measure.js', 'upload.js']) assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8')), file);
});
