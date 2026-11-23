// APP_VERSION and the cache name in sw.js are stamped together by the deploy workflow on every release.
export const APP_VERSION = 'dev';
export const REPO_URL = 'https://github.com/letsimplfyi/commoner';
export const LETSIMPL_URL = 'https://letsimpl.fyi';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
export const COMMONS_WIKI = 'https://commons.wikimedia.org/wiki/';
export const PAGE_SIZE = 50; // Commons returns image info for at most 50 pages per request
// Wikimedia only serves a fixed set of thumbnail widths.
export const GRID_WIDTH = 500;
export const VIEW_WIDTH = 1280;
export const FETCH_TIMEOUT_MS = 15000;
export const RECENT_KEEP = 10;
