// The Commons Picture of the day, from the Wikimedia Feed API (public, read only, CORS-enabled, no key).
// One request per day: the answer is kept on the device until the date changes.
import { FETCH_TIMEOUT_MS } from './config.js';
import { plain, pageUrl, displayTitle } from './commons.js';

export const feedUrl = datePath => `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${datePath}`;
export const utcDatePath = (now = new Date()) => now.toISOString().slice(0, 10).replace(/-/g, '/');

export function normaliseImage(json) {
  const i = json?.image;
  const title = String(i?.title || '');
  if (!/^File:/.test(title)) return null;
  const thumb = i.thumbnail?.source, original = i.image?.source;
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(thumb || '')) return null;
  return {
    title, name: title.replace(/^File:/, ''), thumb, width: i.thumbnail.width, height: i.thumbnail.height,
    original: /^https:\/\/upload\.wikimedia\.org\//.test(original || '') ? original : thumb,
    description: plain(i.description?.text), artist: plain(i.artist?.text), license: plain(i.license?.type), page: pageUrl(title),
    label: displayTitle(title.replace(/^File:/, '')),
  };
}

export async function pictureOfTheDay({ fetchImpl = fetch, now = new Date(), storage = globalThis.localStorage, signal } = {}) {
  const date = utcDatePath(now), key = 'commoner-potd';
  try { const saved = JSON.parse(storage?.getItem(key)); if (saved?.date === date && saved.image) return saved.image; } catch { /* no cache */ }
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const response = await fetchImpl(feedUrl(date), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (!response.ok) throw new Error(`Feed answered ${response.status}`);
  const image = normaliseImage(await response.json());
  if (image) { try { storage?.setItem(key, JSON.stringify({ date, image })); } catch { /* storage blocked */ } }
  return image;
}
