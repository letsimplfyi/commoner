import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORT, PRESETS, parseAmount, formatRupees, supportLinks, supportEnabled, cleanSupport, countGallery, shouldAsk, afterAsk, addDays, RULES } from '../js/support.js';
import { validUpi, upiLinks } from '../js/upi.js';
import { normaliseImage, feedUrl, utcDatePath, pictureOfTheDay } from '../js/feed.js';

test('the donation amount is the donor\'s choice: presets, or any amount from Rs 1 to Rs 1,00,000', () => {
  assert.deepEqual([...PRESETS], [2000, 5000, 10000, 50000]);
  for (const [text, paise] of [['50', 5000], ['₹ 1,000', 100000], ['Rs 250', 25000], ['75.5', 7550], ['1', 100], ['100000', 10000000]]) assert.equal(parseAmount(text), paise, text);
  for (const bad of ['', '0', '0.5', 'abc', '-5', '1e3', '100001', '12.345', null]) assert.equal(parseAmount(bad), null, String(bad));
  assert.equal(formatRupees(5000), '₹50'); assert.equal(formatRupees(123456), '₹1,234.56'); assert.equal(formatRupees(10000000), '₹1,00,000');
});
test('UPI links open the donor\'s own app with the payee, amount and note; nothing else', () => {
  assert.ok(validUpi(SUPPORT.upi) && supportEnabled());
  const links = supportLinks(7550);
  assert.equal(links.generic, 'upi://pay?pa=vysakh.6294-4@waaxis&pn=Commoner&am=75.50&cu=INR&tn=Support%20Commoner');
  assert.deepEqual(links.apps.map(a => a.id), ['gpay', 'phonepe', 'paytm']); assert.ok(links.apps.every(a => a.href.includes('pa=vysakh.6294-4@waaxis') && a.href.includes('am=75.50')));
  assert.equal(supportLinks(0), null); assert.equal(supportLinks(1.5), null); assert.equal(supportLinks(5000, { upi: 'not a upi id', name: 'x' }), null);
  assert.equal(upiLinks({ vpa: 'a@b', amount: 100 }) !== null, false, 'a malformed VPA is refused');
});
test('the ask never nags: after 3 galleries, then every 30 days, 90 after paying, never after "never"', () => {
  let s = null;
  for (let i = 0; i < 2; i++) s = countGallery(s);
  assert.equal(shouldAsk(s, '2026-11-24'), false, 'not yet');
  s = countGallery(s);
  assert.equal(shouldAsk(s, '2026-11-24'), true);
  const later = afterAsk(s, 'later', '2026-11-24');
  assert.equal(later.quietUntil, '2026-12-24'); assert.equal(shouldAsk(later, '2026-12-23'), false); assert.equal(shouldAsk(later, '2026-12-24'), true);
  assert.equal(afterAsk(s, 'paid', '2026-11-24').quietUntil, addDays('2026-11-24', RULES.thankedDays));
  const never = afterAsk(s, 'never', '2026-11-24');
  assert.equal(shouldAsk(never, '2040-01-01'), false);
  assert.equal(shouldAsk(s, '2026-11-24', { upi: '', name: 'x' }), false, 'nothing shows without a UPI id');
});
test('stored preferences are untrusted', () => {
  assert.deepEqual(cleanSupport({ galleries: -3, never: 'yes', quietUntil: 'tomorrow' }), { galleries: 0, never: false, quietUntil: null });
  assert.deepEqual(cleanSupport('junk'), { galleries: 0, never: false, quietUntil: null });
  assert.equal(cleanSupport({ galleries: 1e9 }).galleries, 100000);
});
test('the founder\'s donation wording is used exactly as given', () => {
  const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
  const headline = 'Love this software ??', body = "I love it too... I'd ideally keep on making such simple stupid apps for making life easier.. help support my efforts by donating so I can keep on maintaining this.";
  assert.equal(ui.split(headline).length - 1, 2, 'the headline appears in the prompt and in the sheet');
  assert.equal(ui.split(body).length - 1, 2, 'the paragraph appears in the prompt and in the sheet');
});

const feed = { image: { title: 'File:Pointe Saint Mathieu - Phare.jpg', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/P.jpg/640px-P.jpg', width: 640, height: 427 },
  image: { source: 'https://upload.wikimedia.org/wikipedia/commons/4/46/P.jpg', width: 4000, height: 2667 }, description: { text: 'View of the <b>lighthouse</b>' }, artist: { text: 'JackyM59' }, license: { type: 'CC BY-SA 4.0' } } };
test('Picture of the day: normalised from the feed, only Wikimedia image hosts, one request a day', async () => {
  const image = normaliseImage(feed);
  assert.deepEqual([image.name, image.description, image.artist, image.license], ['Pointe Saint Mathieu - Phare.jpg', 'View of the lighthouse', 'JackyM59', 'CC BY-SA 4.0']);
  assert.equal(image.page, 'https://commons.wikimedia.org/wiki/File:Pointe_Saint_Mathieu_-_Phare.jpg'); assert.equal(image.label, 'Pointe Saint Mathieu - Phare');
  assert.equal(normaliseImage({}), null); assert.equal(normaliseImage({ image: { ...feed.image, title: 'Category:X' } }), null);
  assert.equal(normaliseImage({ image: { ...feed.image, thumbnail: { source: 'https://evil.example/x.jpg', width: 1, height: 1 } } }), null);
  assert.equal(feedUrl(utcDatePath(new Date('2026-11-23T20:00:00Z'))), 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/2026/11/23');
  const memory = new Map(); const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  let calls = 0; const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => feed }; };
  const now = new Date('2026-11-23T10:00:00Z');
  await pictureOfTheDay({ fetchImpl, now, storage }); await pictureOfTheDay({ fetchImpl, now, storage });
  assert.equal(calls, 1, 'second call comes from the device');
  await pictureOfTheDay({ fetchImpl, now: new Date('2026-11-24T10:00:00Z'), storage });
  assert.equal(calls, 2, 'a new day asks again');
  await assert.rejects(pictureOfTheDay({ fetchImpl: async () => ({ ok: false, status: 500 }), now: new Date('2030-01-01T00:00:00Z'), storage }));
});
