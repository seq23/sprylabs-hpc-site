// Admin sign-in (functions/api/admin/login.js) and session check (functions/_runtime/admin.js): audit rows #5 and #1.
// The real handlers run against a real SQLite database built from config/d1-migrations (a D1 stand-in).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as login } from '../functions/api/admin/login.js';
import { onRequestGet as session } from '../functions/api/admin/session.js';
import { onRequestPost as action } from '../functions/api/admin/action.js';
import { validSession } from '../functions/_runtime/admin.js';
import { ipPrefix, LIMITS } from '../functions/_runtime/login_limit.js';

const MIGRATIONS = 'config/d1-migrations';
const PASSWORD = 'TEST-admin-password-not-real', SECRET = 'TEST-session-secret-not-real';

/** D1's prepare/bind/first/run over node:sqlite, with the repo's own migrations applied; fail(true) makes every call throw. */
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(`${MIGRATIONS}/${f}`, 'utf8'));
  let down = false;
  return {
    raw: db, fail(on) { down = on; },
    prepare(sql) {
      let args = [];
      const guard = () => { if (down) throw Error('D1_DOWN'); };
      const stmt = { bind(...a) { args = a; return stmt; },
        async first() { guard(); return db.prepare(sql).get(...args) ?? null; },
        async run() { guard(); db.prepare(sql).run(...args); return { success: true }; } };
      return stmt;
    },
  };
}
const env = (extra = {}) => ({ ADMIN_PASSWORD: PASSWORD, APP_SESSION_SECRET: SECRET, ADMIN_DB: d1(), ...extra });
function post(e, password, ip = '203.0.113.10', headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (ip) h['cf-connecting-ip'] = ip;
  return login({ request: new Request('https://spryexecutiveos.com/api/admin/login', { method: 'POST', headers: h, body: JSON.stringify({ password }) }), env: e });
}
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const getSession = (e, cookie) => session({ request: new Request('https://spryexecutiveos.com/api/admin/session', { headers: cookie ? { cookie } : {} }), env: e });

test('unconfigured: no ADMIN_PASSWORD or APP_SESSION_SECRET is still 503 "not configured", before any limit or store', async () => {
  for (const e of [{}, { APP_SESSION_SECRET: SECRET }, { ADMIN_PASSWORD: PASSWORD }, { ADMIN_PASSWORD: PASSWORD, ADMIN_DB: d1() }]) {
    const res = await post(e, PASSWORD);
    assert.equal(res.status, 503); assert.match((await res.json()).error, /not configured/);
    assert.equal(res.headers.get('set-cookie'), null);
  }
  assert.equal((await getSession({})).status, 503);
});

test('the normal path: the right password signs in, and that session is accepted by /api/admin/session and action.js', async () => {
  const e = env();
  const res = await post(e, PASSWORD);
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { status: 'ok' });
  assert.match(res.headers.get('set-cookie'), /^spry_admin=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);
  const s = await getSession(e, cookieOf(res));
  assert.equal(s.status, 200); assert.deepEqual(await s.json(), { authenticated: true });
  // action.js passes the session check and stops at its own next step (no GitHub token here: 503), not at 401.
  const a = await action({ request: new Request('https://spryexecutiveos.com/api/admin/action', { method: 'POST', headers: { cookie: cookieOf(res) }, body: '{}' }), env: e });
  assert.equal(a.status, 503); assert.match((await a.json()).error, /GitHub bridge not configured/);
  const noCookie = await action({ request: new Request('https://spryexecutiveos.com/api/admin/action', { method: 'POST', body: '{}' }), env: e });
  assert.equal(noCookie.status, 401);
  assert.equal((await post(e, 'wrong')).status, 401);
});

test('no limit store: configured but ADMIN_DB unbound is a 503 refusal even with the right password, never a sign-in', async () => {
  for (const db of [undefined, null, {}]) {
    const res = await post(env({ ADMIN_DB: db }), PASSWORD);
    assert.equal(res.status, 503); assert.match((await res.json()).error, /attempt limit store is not bound/);
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('store down: D1 throwing, or the table missing, is a plain 503 refusal, never 200 and never a 500', async () => {
  const e = env(); e.ADMIN_DB.fail(true);
  const res = await post(e, PASSWORD);
  assert.equal(res.status, 503); assert.match((await res.json()).error, /unavailable right now/); assert.equal(res.headers.get('set-cookie'), null);
  const empty = new DatabaseSync(':memory:'); // bound but never migrated
  const bare = { prepare: (sql) => { const st = { bind: (...a) => ({ first: async () => empty.prepare(sql).get(...a), run: async () => empty.prepare(sql).run(...a) }) }; return st; } };
  const r2 = await post(env({ ADMIN_DB: bare }), PASSWORD);
  assert.equal(r2.status, 503); assert.equal(r2.headers.get('set-cookie'), null);
});

test('lockout is per network: 5 tries a minute, then 429 even with the right password; a different address still signs in', async () => {
  const e = env();
  for (let i = 0; i < LIMITS.perMinute; i++) assert.equal((await post(e, `guess-${i}`, '198.51.100.7')).status, 401, `try ${i + 1}`);
  const locked = await post(e, PASSWORD, '198.51.100.7');
  assert.equal(locked.status, 429); assert.equal(locked.headers.get('set-cookie'), null);
  // The stranger's tries never touch the owner on another address.
  assert.equal((await post(e, PASSWORD, '203.0.113.200')).status, 200);
  // Forged x-forwarded-for is never read: rotating it does not escape the limit.
  assert.equal((await post(e, PASSWORD, '198.51.100.7', { 'x-forwarded-for': '192.0.2.99' })).status, 429);
  // No raw IP is stored.
  const keys = e.ADMIN_DB.raw.prepare('SELECT key FROM admin_login_try').all().map((r) => r.key);
  assert.ok(keys.length > 0 && keys.every((k) => /^[0-9a-f]{64}$/.test(k)));
});

test('lockout per day: 20 tries a day per network across minutes, then 429; the next UTC day it signs in again; another network is untouched', async () => {
  const e = env(), realNow = Date.now;
  const start = Date.parse('2026-12-01T00:00:00Z');
  try {
    for (let i = 0; i < LIMITS.perNetworkDaily; i++) {
      Date.now = () => start + Math.floor(i / LIMITS.perMinute) * 61_000;
      assert.equal((await post(e, `guess-${i}`, '198.51.100.8')).status, 401, `try ${i + 1}`);
    }
    Date.now = () => start + 10 * 61_000;
    assert.equal((await post(e, PASSWORD, '198.51.100.8')).status, 429);
    assert.equal((await post(e, PASSWORD, '198.51.100.9')).status, 200);
    Date.now = () => start + 86_400_000 + 1000;
    assert.equal((await post(e, PASSWORD, '198.51.100.8')).status, 200);
  } finally { Date.now = realNow; }
});

test('IPv6: one /64 is one network however many addresses it rotates, a /48 gets 40 a day, another /48 still signs in', async () => {
  assert.equal(ipPrefix('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(ipPrefix('2001:db8:1:2::9', 48), '2001:db8:1::/48');
  assert.equal(ipPrefix('::ffff:192.0.2.1'), '192.0.2.1'); assert.equal(ipPrefix('192.0.2.1'), '192.0.2.1');
  const e = env(), realNow = Date.now, start = Date.parse('2026-12-01T00:00:00Z');
  try {
    for (let i = 0; i < LIMITS.perNetworkDaily; i++) {
      Date.now = () => start + Math.floor(i / LIMITS.perMinute) * 61_000;
      assert.equal((await post(e, 'guess', `2001:db8:1:1:${(i + 1).toString(16)}::1`)).status, 401);
    }
    Date.now = () => start + 10 * 61_000;
    assert.equal((await post(e, PASSWORD, '2001:db8:1:1:beef::1')).status, 429);
    for (let i = 0; i < LIMITS.perNet48Daily - LIMITS.perNetworkDaily; i++) {
      Date.now = () => start + Math.floor(i / LIMITS.perMinute) * 61_000;
      assert.equal((await post(e, 'guess', `2001:db8:1:2:${(i + 1).toString(16)}::1`)).status, 401);
    }
    Date.now = () => start + 11 * 61_000;
    assert.equal((await post(e, PASSWORD, '2001:db8:1:3::1')).status, 429);
    assert.equal((await post(e, PASSWORD, '2001:db8:2::1')).status, 200);
  } finally { Date.now = realNow; }
});

test('no cf-connecting-ip: refused before the password is read', async () => {
  const res = await post(env(), PASSWORD, null, { 'x-forwarded-for': '192.0.2.1' });
  assert.equal(res.status, 403); assert.equal(res.headers.get('set-cookie'), null);
});

test('session check: a forged, tampered, garbage or expired cookie is refused, without throwing', async () => {
  const e = env();
  const good = cookieOf(await post(e, PASSWORD)).slice('spry_admin='.length);
  const [p, s] = good.split('.');
  const flip = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const c of [`${p}.${flip}`, `${enc({ exp: Date.now() + 9e9 })}.${s}`, `${p}.`, `${p}.!!!not-base64`, `${p}.${s.slice(0, 10)}`, 'junk', '']) {
    const r = await getSession(e, `spry_admin=${c}`);
    assert.equal(r.status, 401, c);
  }
  // Signed with another secret.
  const other = cookieOf(await post(env({ APP_SESSION_SECRET: 'TEST-other-secret' }), PASSWORD));
  assert.equal((await getSession(e, other)).status, 401);
  // Expired: a correctly signed payload whose exp has passed.
  const realNow = Date.now;
  try { Date.now = () => realNow() + 9 * 3_600_000; assert.equal((await getSession(e, `spry_admin=${good}`)).status, 401); } finally { Date.now = realNow; }
});

test('session check compares the signature in constant time: it decides through crypto.subtle.verify, never a string compare', async () => {
  const e = env();
  const cookie = cookieOf(await post(e, PASSWORD));
  const realVerify = crypto.subtle.verify;
  let verified = 0;
  crypto.subtle.verify = function (...a) { verified++; return realVerify.apply(this, a); };
  try {
    const req = new Request('https://x/', { headers: { cookie } });
    assert.equal(await validSession(req, SECRET), true);
    assert.equal(verified, 1, 'validSession must call crypto.subtle.verify once');
    // And it is verify's answer that decides: a verify that says no is a refusal even for a real cookie.
    crypto.subtle.verify = async () => { verified++; return false; };
    assert.equal(await validSession(req, SECRET), false);
  } finally { crypto.subtle.verify = realVerify; }
});

test('migrations: additive only, and each file records itself in schema_version (the pin)', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length >= 1);
  for (const f of files) {
    const sql = readFileSync(`${MIGRATIONS}/${f}`, 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bRENAME\b/i, f);
    assert.match(sql, new RegExp(`INSERT OR IGNORE INTO schema_version \\(migration\\) VALUES \\('${f.replace(/\.sql$/, '')}'\\)`), f);
  }
  const db = d1().raw;
  assert.equal(db.prepare('SELECT migration FROM schema_version ORDER BY migration DESC LIMIT 1').get().migration, files.at(-1).replace(/\.sql$/, ''));
  for (const f of files) db.exec(readFileSync(`${MIGRATIONS}/${f}`, 'utf8')); // re-applying is a no-op
  assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_version').get().n, files.length);
});
