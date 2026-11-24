// "Around me": photos on Commons near a place. Pure helpers plus the two requests (the ordered list, then the details).
// The position is rounded to about 100 m before anything is asked or shown, and is never stored.
import { apiUrl, getJson, normaliseFiles, filesByIdUrl, CommonsError } from './commons.js';

export const DEFAULT_RADIUS = 1000;
export const RADII = [1000, 5000, 10000]; // metres; Commons allows at most 10 km
export const NEAR_MAX = 500; // the most Commons returns for one search
export const NEAR_PAGE = 50; // photo details are fetched 50 at a time

export const round3 = n => Math.round(n * 1000) / 1000;

// ?near=27.715,85.290 (and r=5000). Anything else is not a place.
export function parseNear(search) {
  const p = new URLSearchParams(search);
  const m = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(p.get('near') || '');
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]), r = Number(p.get('r'));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: round3(lat), lon: round3(lon), r: RADII.includes(r) ? r : DEFAULT_RADIUS };
}
export const nearAsked = search => new URLSearchParams(search).has('near'); // the screen, with or without a place yet
export function nearUrl(origin, near, fileName = '') {
  const url = new URL(origin);
  url.search = ''; url.hash = '';
  url.searchParams.set('near', `${round3(near.lat).toFixed(3)},${round3(near.lon).toFixed(3)}`);
  if (near.r && near.r !== DEFAULT_RADIUS) url.searchParams.set('r', String(near.r));
  if (fileName) url.searchParams.set('f', fileName);
  return url.toString();
}
export const nearKey = n => `near:${n.lat},${n.lon},${n.r}`;

export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '';
  if (metres < 15) return 'Here';
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// The nearest files first, with how far each is (including photos whose subject, not camera, is at the place).
export const nearListUrl = ({ lat, lon, r }) => apiUrl({ list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: String(r), gsnamespace: '6', gslimit: String(NEAR_MAX), gsprimary: 'all' });
export function normaliseNearList(json) {
  const seen = new Set(), out = [];
  for (const g of json?.query?.geosearch || []) if (!seen.has(g.pageid)) { seen.add(g.pageid); out.push({ id: g.pageid, dist: g.dist }); }
  return out.sort((a, b) => a.dist - b.dist);
}

// The page is shaped like fetchFiles' answer. The first call asks for the whole ordered list; "next" carries what is left,
// so later pages need no new search (a search cannot be paged reliably: ties at the same spot come back in any order).
export async function fetchNear(near, { cont, ...options } = {}) {
  const rest = cont?.rest || normaliseNearList(await getJson(nearListUrl(near), options));
  const chunk = rest.slice(0, NEAR_PAGE), later = rest.slice(NEAR_PAGE);
  if (!chunk.length) return { files: [], next: null, skipped: 0 };
  const info = await getJson(filesByIdUrl(chunk.map(c => c.id)), options);
  const place = new Map(chunk.map((c, i) => [c.id, { index: i + 1, dist: c.dist }]));
  const page = normaliseFiles({ query: { pages: (info.query?.pages || []).map(p => ({ ...p, index: place.get(p.pageid)?.index })) } });
  return { files: page.files.map(f => ({ ...f, dist: place.get(f.id)?.dist })), next: later.length ? { rest: later } : null, skipped: page.skipped };
}

// A place chosen by name: a Commons category that has coordinates.
export const placeUrl = name => apiUrl({ titles: `Category:${name}`, prop: 'coordinates', coprimary: 'primary' });
export function normalisePlace(json) {
  const c = json?.query?.pages?.[0]?.coordinates?.[0];
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? { lat: round3(c.lat), lon: round3(c.lon) } : null;
}
export async function fetchPlace(name, options) {
  const place = normalisePlace(await getJson(placeUrl(name), options));
  if (!place) throw new CommonsError('http', 'That place has no location on Commons.');
  return place;
}

// The device position, rounded at once. Rejects when location is off, denied or unavailable.
export const locate = (geo = globalThis.navigator?.geolocation) => new Promise((resolve, reject) => {
  if (!geo) { reject(new Error('unsupported')); return; }
  geo.getCurrentPosition(p => resolve({ lat: round3(p.coords.latitude), lon: round3(p.coords.longitude) }), reject, { timeout: 15000, maximumAge: 300000 });
});
