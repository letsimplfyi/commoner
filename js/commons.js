import { COMMONS_API, COMMONS_WIKI, PAGE_SIZE, GRID_WIDTH, VIEW_WIDTH, FETCH_TIMEOUT_MS } from './config.js';

// A shared Commoner link pasted back into the box is accepted too.
const OWN_HOSTS = /^(commoner\.letsimpl\.fyi|commoner-[a-z0-9]+\.pages\.dev|localhost|127\.0\.0\.1)$/;

// Accepts "Foo", "Category:Foo", "[[Category:Foo]]" or a commons.wikimedia.org
// category link, and returns the bare category name ('' when it is not one).
export function parseCategory(input) {
  let s = String(input ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    let url;
    try { url = new URL(s); } catch { return ''; }
    if (OWN_HOSTS.test(url.hostname)) return url.searchParams.has('c') ? parseCategory(url.searchParams.get('c')) : '';
    if (!/^commons(\.m)?\.wikimedia\.org$/.test(url.hostname)) return '';
    let title = url.searchParams.get('title');
    if (!title) { try { title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, '')); } catch { return ''; } }
    if (!/^category:/i.test(title.replace(/_/g, ' ').trim())) return '';
    s = title;
  }
  s = s.replace(/^\[\[|\]\]$/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^:/, '').trim();
  s = s.replace(/^category\s*:/i, '').replace(/#.*$/, '').trim();
  if (!s || s.length > 200 || /[<>[\]{}|#]/.test(s)) return '';
  return s[0].toUpperCase() + s.slice(1);
}

export const categoryTitle = name => `Category:${name}`;
export const pageUrl = title => COMMONS_WIKI + encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2F/g, '/');
export const shareUrl = (origin, name, fileName = '') => {
  const url = new URL(origin);
  url.search = ''; url.hash = '';
  url.searchParams.set('c', name);
  if (fileName) url.searchParams.set('f', fileName);
  return url.toString();
};

const api = params => `${COMMONS_API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`;

export function infoUrl(name) {
  return api({ titles: categoryTitle(name), prop: 'categoryinfo', list: 'categorymembers', cmtitle: categoryTitle(name), cmtype: 'subcat', cmlimit: '24' });
}

export function suggestUrl(query, limit = 8) {
  return api({ list: 'prefixsearch', pssearch: query, psnamespace: '14', pslimit: String(limit) });
}
export const normaliseSuggestions = json => (json?.query?.prefixsearch || []).map(p => p.title.replace(/^Category:/, ''));

export function listUrl(name, { sort = 'name', cont = null } = {}) {
  const newest = sort === 'newest';
  return api({
    generator: 'categorymembers', gcmtitle: categoryTitle(name), gcmtype: 'file', gcmlimit: String(PAGE_SIZE),
    gcmsort: newest ? 'timestamp' : 'sortkey', gcmdir: newest ? 'desc' : 'asc',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(GRID_WIDTH),
    iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|DateTimeOriginal',
    ...(cont || {}),
  });
}

// Wikimedia refuses thumbnails larger than the original.
export function resize(file, width) {
  if (file.mime === 'image/svg+xml' || !file.thumb || file.width <= width) return file.url;
  return file.thumb.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}
export const gridSrc = file => resize(file, GRID_WIDTH);
export const viewSrc = file => resize(file, VIEW_WIDTH);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': ' ' };
export const plain = html => String(html ?? '').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, e => ENTITIES[e]).replace(/\s+/g, ' ').trim();
export const displayTitle = name => name.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/_/g, ' ');

export function normaliseFiles(json) {
  const pages = (json?.query?.pages || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const files = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\//.test(info.mime || '')) continue;
    const meta = info.extmetadata || {};
    const name = page.title.replace(/^File:/, '');
    files.push({
      title: page.title, name, url: info.url, thumb: info.thumburl || '', width: info.width, height: info.height, mime: info.mime,
      description: plain(meta.ImageDescription?.value), author: plain(meta.Artist?.value), license: plain(meta.LicenseShortName?.value),
      date: plain(meta.DateTimeOriginal?.value), page: pageUrl(page.title),
    });
  }
  return { files, next: json?.continue || null, skipped: pages.length - files.length };
}

export function normaliseInfo(json) {
  const page = json?.query?.pages?.[0];
  const counts = page?.categoryinfo;
  return {
    exists: !!page && (!page.missing || !!counts),
    files: counts?.files ?? 0,
    subcats: (json?.query?.categorymembers || []).map(m => m.title.replace(/^Category:/, '')),
  };
}

export class CommonsError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

export async function getJson(url, { signal, fetchImpl = fetch } = {}) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try { response = await fetchImpl(url, { signal: combined, referrerPolicy: 'no-referrer', credentials: 'omit' }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new CommonsError('network', 'Could not reach Wikimedia Commons.');
  }
  if (!response.ok) throw new CommonsError('http', `Wikimedia Commons answered ${response.status}.`);
  const json = await response.json().catch(() => { throw new CommonsError('http', 'Wikimedia Commons sent an unreadable answer.'); });
  if (json.error) throw new CommonsError('api', json.error.info || 'Wikimedia Commons refused the request.');
  return json;
}

export const fetchInfo = (name, options) => getJson(infoUrl(name), options).then(normaliseInfo);
export const fetchFiles = (name, { sort, cont, ...options } = {}) => getJson(listUrl(name, { sort, cont }), options).then(normaliseFiles);
export const fetchSuggestions = (query, options) => getJson(suggestUrl(query), options).then(normaliseSuggestions);
