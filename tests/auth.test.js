import test from 'node:test';
import assert from 'node:assert/strict';

const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = memory(); globalThis.sessionStorage = memory();
globalThis.location = { origin: 'https://commoner.letsimpl.fyi', search: '' };
const { challengeOf, loginUrl, finishLogin, session, signOut, api, redirectUri } = await import('../js/auth.js');

test('PKCE: the challenge is the S256 of the verifier (RFC 7636 appendix B)', async () => {
  assert.equal(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('login: sends the user to Commons with the key, the exact callback, S256 and a state; keeps the verifier on this device only', async () => {
  const url = new URL(await loginUrl('?u=1'));
  assert.equal(url.origin + url.pathname, 'https://commons.wikimedia.org/w/rest.php/oauth2/authorize');
  const q = url.searchParams;
  assert.equal(q.get('client_id'), '12ff63aa5c63f338d304cc12d74abc30'); assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('redirect_uri'), 'https://commoner.letsimpl.fyi/'); assert.equal(q.get('code_challenge_method'), 'S256');
  assert.ok(q.get('state').length >= 16 && q.get('code_challenge').length === 43);
  assert.ok(!url.href.includes('verifier') && !JSON.stringify(localStorage).includes('verifier'));
  assert.ok(!/secret/i.test(url.href));
});

test('return: a wrong state is refused, the right one is exchanged with the verifier and the token is kept', async () => {
  const url = new URL(await loginUrl('?u=1')), state = url.searchParams.get('state'), calls = [];
  globalThis.fetch = async (u, init) => { calls.push({ u, body: Object.fromEntries(init.body), credentials: init.credentials }); return { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 14400 }) }; };
  await assert.rejects(finishLogin('?code=abc&state=wrong'), /try again/);
  assert.equal(calls.length, 0, 'nothing is sent for a bad state');
  await loginUrl('?u=1'); const good = JSON.parse(sessionStorage.getItem('commoner-auth-pending')).state;
  const done = await finishLogin(`?code=abc&state=${good}`);
  assert.deepEqual(done, { returnTo: '?u=1' });
  assert.equal(calls[0].u, 'https://commons.wikimedia.org/w/rest.php/oauth2/access_token');
  assert.equal(calls[0].body.grant_type, 'authorization_code'); assert.equal(calls[0].body.code, 'abc'); assert.ok(calls[0].body.code_verifier.length >= 43);
  assert.ok(!('client_secret' in calls[0].body)); assert.equal(calls[0].credentials, 'omit');
  assert.equal(session().access, 'AT'); assert.equal(sessionStorage.getItem('commoner-auth-pending'), null);
  assert.equal(await finishLogin('?c=Foo'), null, 'a normal page load is not a login return');
  await assert.rejects(finishLogin('?error=access_denied'), /cancelled/);
});

test('api: every call carries the bearer token, sends no cookies, and an expired token is renewed once', async () => {
  signOut(); globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(api({ action: 'query' }), /Not signed in/);
  localStorage.setItem('commoner-auth', JSON.stringify({ access: 'OLD', refresh: 'RT', expires: Date.now() - 1000 }));
  const seen = [];
  globalThis.fetch = async (u, init) => {
    seen.push({ u: String(u), auth: init.headers?.Authorization, credentials: init.credentials, method: init.method });
    if (String(u).includes('oauth2/access_token')) return { ok: true, json: async () => ({ access_token: 'NEW', expires_in: 14400 }) };
    return { ok: true, status: 200, json: async () => ({ query: { ok: true } }) };
  };
  await api({ action: 'query', meta: 'userinfo' });
  assert.equal(seen[0].u, 'https://commons.wikimedia.org/w/rest.php/oauth2/access_token');
  assert.equal(seen[1].auth, 'Bearer NEW'); assert.equal(seen[1].credentials, 'omit'); assert.match(seen[1].u, /origin=\*/);
  assert.equal(session().refresh, 'RT', 'the refresh token is kept when the server sends no new one');
});
test('api: a 401 signs the user out, and a Commons error carries its code', async () => {
  localStorage.setItem('commoner-auth', JSON.stringify({ access: 'A', refresh: '', expires: Date.now() + 1e6 }));
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(api({ action: 'query' }), /Signed out/); assert.equal(session(), null);
  localStorage.setItem('commoner-auth', JSON.stringify({ access: 'A', refresh: '', expires: Date.now() + 1e6 }));
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ error: { code: 'fileexists-no-change', info: 'exists' } }) });
  await assert.rejects(api({ action: 'upload' }, { method: 'POST' }), e => e.code === 'fileexists-no-change');
  assert.equal(redirectUri(), 'https://commoner.letsimpl.fyi/');
});
