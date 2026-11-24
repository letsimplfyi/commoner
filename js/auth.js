// Sign in to Commons from the browser: OAuth 2.0 authorization code with PKCE, no secret and no server.
// The token lives on this device only and is used only to call the Commons API.
import { COMMONS_API, OAUTH_CLIENT_ID, OAUTH_BASE, FETCH_TIMEOUT_MS } from './config.js';

const KEY = 'commoner-auth', PENDING = 'commoner-auth-pending';
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export const redirectUri = () => `${location.origin}/`;
export const challengeOf = async verifier => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
const write = (store, key, value) => { try { value === null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

export const session = () => { const s = read(localStorage, KEY); return s?.access ? s : null; };
export const signOut = () => write(localStorage, KEY, null);

// Step 1: send the user to Commons to approve. Returns the address (the caller navigates, so tests can read it).
export async function loginUrl(returnTo = '') {
  const verifier = random(48), state = random(16);
  write(sessionStorage, PENDING, { verifier, state, returnTo });
  const q = new URLSearchParams({ response_type: 'code', client_id: OAUTH_CLIENT_ID, redirect_uri: redirectUri(), state, code_challenge: await challengeOf(verifier), code_challenge_method: 'S256' });
  return `${OAUTH_BASE}/authorize?${q}`;
}

async function token(params, signal) {
  const response = await fetch(`${OAUTH_BASE}/access_token`, { method: 'POST', body: new URLSearchParams({ client_id: OAUTH_CLIENT_ID, ...params }), credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.message || 'Sign-in failed.');
  const saved = { access: body.access_token, refresh: body.refresh_token || session()?.refresh || '', expires: Date.now() + (body.expires_in || 3600) * 1000 - 60000 };
  write(localStorage, KEY, saved);
  return saved;
}

// Step 2: Commons sends the user back with ?code=...&state=... . Returns { returnTo } when this page load was that return, else null.
export async function finishLogin(search = location.search) {
  const p = new URLSearchParams(search);
  if (!p.has('code') && !p.has('error')) return null;
  const pending = read(sessionStorage, PENDING);
  write(sessionStorage, PENDING, null);
  if (p.has('error')) throw new Error(p.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed.');
  if (!pending || pending.state !== p.get('state')) throw new Error('Sign-in failed. Please try again.');
  await token({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri(), code_verifier: pending.verifier });
  return { returnTo: pending.returnTo || '' };
}

async function bearer() {
  let s = session();
  if (!s) throw new Error('Not signed in.');
  if (Date.now() > s.expires) {
    if (!s.refresh) { signOut(); throw new Error('Signed out. Please sign in again.'); }
    try { s = await token({ grant_type: 'refresh_token', refresh_token: s.refresh }); } catch (error) { signOut(); throw error; }
  }
  return s.access;
}

// An authenticated Commons API call. params go in the query (GET) or the form (POST); body is a FormData for uploads.
export async function api(params, { method = 'GET', body, signal } = {}) {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...(method === 'GET' ? params : { action: params.action }) });
  const form = method === 'POST' ? (body || new URLSearchParams(params)) : undefined;
  if (form instanceof FormData) for (const [k, v] of Object.entries(params)) if (!form.has(k)) form.append(k, v);
  const response = await fetch(`${COMMONS_API}?${query}`, { method, body: form, headers: { Authorization: `Bearer ${await bearer()}` }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal || AbortSignal.timeout(FETCH_TIMEOUT_MS * 8) });
  if (response.status === 401) { signOut(); throw new Error('Signed out. Please sign in again.'); }
  if (!response.ok) throw new Error(`Commons said ${response.status}.`);
  const data = await response.json();
  if (data.error) { const error = new Error(data.error.info || data.error.code); error.code = data.error.code; throw error; }
  return data;
}

export const csrfToken = async signal => (await api({ action: 'query', meta: 'tokens', type: 'csrf' }, { signal })).query.tokens.csrftoken;
export const whoAmI = async signal => { const u = (await api({ action: 'query', meta: 'userinfo', uiprop: 'rights|blockinfo' }, { signal })).query.userinfo; return { name: u.name, canUpload: (u.rights || []).includes('upload'), blocked: !!u.blockid }; };
