import { COMMONS_API, COMMONS_WIKI, PAGE_SIZE, GRID_WIDTH, VIEW_WIDTH, FETCH_TIMEOUT_MS } from './config.js';

// A shared Commoner link pasted back into the box is accepted too.
const OWN_HOSTS = /^(commoner\.letsimpl\.fyi|commoner-[a-z0-9]+\.pages\.dev|localhost|127\.0\.0\.1)$/;

// Accepts "Foo", "Category:Foo", "[[Category:Foo]]" or a commons.wikimedia.org category link,
// and returns the bare category name ('' when it is not one).
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
  if (!s || s.length > 200 || /[<>[\]{}|#"]/.test(s)) return '';
  return s[0].toUpperCase() + s.slice(1);
}

export const categoryTitle = name => `Category:${name}`;
export const pageUrl = title => COMMONS_WIKI + encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2F/g, '/');

// ---- the query: categories to include (all must match), categories to leave out, subcategories on or off ----
const uniq = list => [...new Set(list)];
export const defaultDeep = q => q.cats.length > 1 || q.not.length > 0;
export function makeQuery({ cats = [], not = [], deep, sort = 'name' } = {}) {
  const include = uniq(cats), exclude = uniq(not).filter(n => !include.includes(n));
  const query = { cats: include, not: exclude, sort: sort === 'newest' ? 'newest' : 'name' };
  query.deep = deep === undefined ? defaultDeep(query) : !!deep;
  return query;
}
const asQuery = q => (typeof q === 'string' ? makeQuery({ cats: [q] }) : makeQuery(q));
export const usesSearch = q => { const x = asQuery(q); return x.deep || x.cats.length > 1 || x.not.length > 0; };
export const queryKey = q => { const x = asQuery(q); return JSON.stringify([x.cats, x.not, x.deep, x.sort]); };
export const queryTitle = q => { const x = asQuery(q); return x.cats.join(' + ') + x.not.map(n => ` − ${n}`).join(''); };

export function parseRoute(search) {
  const p = new URLSearchParams(search);
  const cats = uniq(p.getAll('c').map(parseCategory).filter(Boolean));
  const not = uniq(p.getAll('x').map(parseCategory).filter(Boolean));
  const d = p.get('d');
  return { ...makeQuery({ cats, not, deep: d === '1' ? true : d === '0' ? false : undefined, sort: p.get('s') }), f: p.get('f') || '' };
}

// What the home box accepts: a category name, a Commons category link, or a Commoner link (which can hold several categories).
export function parseInput(text) {
  const s = String(text ?? '').trim();
  if (/^https?:\/\//i.test(s)) {
    try { const url = new URL(s); if (OWN_HOSTS.test(url.hostname) && url.searchParams.has('c')) { const route = parseRoute(url.search); return route.cats.length ? route : null; } } catch { return null; }
  }
  const name = parseCategory(s);
  return name ? makeQuery({ cats: [name] }) : null;
}

export function shareUrl(origin, q, fileName = '') {
  const x = asQuery(q);
  const url = new URL(origin);
  url.search = ''; url.hash = '';
  for (const c of x.cats) url.searchParams.append('c', c);
  for (const n of x.not) url.searchParams.append('x', n);
  if (x.deep !== defaultDeep(x)) url.searchParams.set('d', x.deep ? '1' : '0');
  if (x.sort === 'newest') url.searchParams.set('s', 'newest');
  if (fileName) url.searchParams.set('f', fileName);
  return url.toString();
}

const api = params => `${COMMONS_API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`;
const IMAGE_INFO = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(GRID_WIDTH), iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|DateTimeOriginal' };

// One category, nothing else: the category page itself, its subcategories and its parents.
export function infoUrl(name) {
  return api({ titles: categoryTitle(name), prop: 'categoryinfo|categories', clshow: '!hidden', cllimit: '12', list: 'categorymembers', cmtitle: categoryTitle(name), cmtype: 'subcat', cmlimit: '24' });
}
// Several categories or subcategories: do they exist, and how many photos match.
export const existsUrl = names => api({ titles: names.map(categoryTitle).join('|'), prop: 'categoryinfo' });
// CirrusSearch: AND is a space, NOT is a minus. (OR is not offered: it does not work with deepcategory.)
export function searchTerm(q) {
  const x = asQuery(q), key = x.deep ? 'deepcategory' : 'incategory';
  return [...x.cats.map(c => `${key}:"${c}"`), ...x.not.map(c => `-${key}:"${c}"`)].join(' ');
}
export const countUrl = q => api({ list: 'search', srsearch: searchTerm(q), srnamespace: '6', srlimit: '1', srinfo: 'totalhits' });

export function listUrl(q, { sort, cont = null } = {}) {
  const x = asQuery({ ...asQuery(q), sort: sort ?? asQuery(q).sort });
  const newest = x.sort === 'newest';
  if (usesSearch(x)) {
    return api({ generator: 'search', gsrsearch: searchTerm(x), gsrnamespace: '6', gsrlimit: String(PAGE_SIZE), gsrsort: newest ? 'create_timestamp_desc' : 'relevance', ...IMAGE_INFO, ...(cont || {}) });
  }
  return api({ generator: 'categorymembers', gcmtitle: categoryTitle(x.cats[0]), gcmtype: 'file', gcmlimit: String(PAGE_SIZE), gcmsort: newest ? 'timestamp' : 'sortkey', gcmdir: newest ? 'desc' : 'asc', ...IMAGE_INFO, ...(cont || {}) });
}

export function suggestUrl(query, limit = 8) {
  return api({ list: 'prefixsearch', pssearch: query, psnamespace: '14', pslimit: String(limit) });
}
export const normaliseSuggestions = json => (json?.query?.prefixsearch || []).map(p => p.title.replace(/^Category:/, ''));

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
    parents: (page?.categories || []).map(c => c.title.replace(/^Category:/, '')),
    missing: [],
  };
}
export function normaliseExists(json, names) {
  const present = new Set((json?.query?.pages || []).filter(p => !p.missing || p.categoryinfo).map(p => p.title.replace(/^Category:/, '')));
  return names.filter(n => !present.has(n));
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

// What we know about a query: single plain category -> its page, subcategories and parents; anything else -> which
// categories are missing and how many photos match.
export async function fetchInfo(q, options) {
  const x = asQuery(q);
  if (!usesSearch(x)) return normaliseInfo(await getJson(infoUrl(x.cats[0]), options));
  const names = [...x.cats, ...x.not];
  const [exists, count] = await Promise.all([getJson(existsUrl(names), options), getJson(countUrl(x), options)]);
  const missing = normaliseExists(exists, names);
  return { exists: missing.length === 0, files: count?.query?.searchinfo?.totalhits ?? 0, subcats: [], parents: [], missing };
}
export const fetchFiles = (q, { sort, cont, ...options } = {}) => getJson(listUrl(q, { sort, cont }), options).then(normaliseFiles);
export const fetchSuggestions = (query, options) => getJson(suggestUrl(query), options).then(normaliseSuggestions);
