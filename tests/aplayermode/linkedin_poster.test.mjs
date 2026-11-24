/**
 * A Player Mode LinkedIn page poster (scripts/aplayermode/linkedin_poster.mjs). Her words 24 Nov 2026:
 * "make sure noelle is in charge of linkedin also for the apps that have a linkedin page".
 * HOW IT BREAKS, each proven here against a fake LinkedIn: posting before access exists, posting twice
 * in a day or on a weekend, a refused post recorded as posted, gate-list wording posted, reserved
 * characters cutting the text, a run that does nothing silently. Run: npm run validate:aplayermode-linkedin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUTHOR, BANK_FILE, LEDGER_FILE, gateHits, littleText, main } from '../../scripts/aplayermode/linkedin_poster.mjs';

const MON = Date.parse('2026-11-30T16:00:00Z'); // Monday 10:00 CT
const SAT = Date.parse('2026-11-28T16:00:00Z');
const env = { LINKEDIN_APLAYERMODE_ACCESS_TOKEN: 'test-token' };
const P = (id, text = `Post ${id}: one small win (before noon).`) => ({ id, text });

function sandbox(posts, access = 'granted', posted = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-li-'));
  const bankFile = path.join(dir, 'posts.json'); const ledgerFile = path.join(dir, 'posted.json');
  fs.writeFileSync(bankFile, JSON.stringify({ posts }));
  fs.writeFileSync(ledgerFile, JSON.stringify({ access, posted }));
  return { bankFile, ledgerFile, read: () => JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) };
}
function fake(status = 201) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(status === 201 ? '' : 'nope', { status, headers: { 'x-restli-id': 'urn:li:share:1' } }); } };
}
async function run(s, li, over = {}) {
  const logs = []; let err = null;
  try { await main({ now: MON, env, fetchImpl: li.fetchImpl, bankFile: s.bankFile, ledgerFile: s.ledgerFile, log: (l) => logs.push(l), ...over }); } catch (e) { err = e; }
  return { logs, err };
}

test('the repo files: unique ids, every banked post clears the gate list, access none or granted', () => {
  const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
  const rec = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  assert.equal(new Set(bank.posts.map((p) => p.id)).size, bank.posts.length);
  for (const p of bank.posts) assert.deepEqual(gateHits(p.text), [], p.id);
  assert.ok(['none', 'granted'].includes(rec.access));
  assert.ok(Array.isArray(rec.posted));
});

test('no access: LinkedIn is never called and nothing is written', async () => {
  const s = sandbox([P('li1')], 'none'); const li = fake();
  const before = fs.readFileSync(s.ledgerFile, 'utf8');
  const r = await run(s, li);
  assert.equal(li.calls.length, 0);
  assert.equal(fs.readFileSync(s.ledgerFile, 'utf8'), before);
  assert.ok(r.logs.some((l) => l.includes('[LINKEDIN_NO_ACCESS]')));
});

test('a weekday posts the first unposted post once, as the page, escaped, and records it', async () => {
  const s = sandbox([P('li1'), P('li2'), P('li3')], 'granted', [{ id: 'li1', at: '2026-11-27T16:00:00Z' }]); const li = fake();
  const r = await run(s, li);
  assert.equal(r.err, null);
  assert.equal(li.calls.length, 1);
  assert.equal(li.calls[0].url, 'https://api.linkedin.com/rest/posts');
  assert.equal(li.calls[0].body.author, AUTHOR);
  assert.equal(li.calls[0].body.commentary, 'Post li2: one small win \\(before noon\\).');
  assert.deepEqual(s.read().posted.map((p) => p.id), ['li1', 'li2']);
  assert.ok(r.logs.includes('OUTPUT: posted 1, waiting 1'));
  const again = await run(s, li, { now: MON + 3_600_000 });
  assert.equal(li.calls.length, 1, 'posted twice in one day');
  assert.ok(again.logs.includes('OUTPUT: posted 0, waiting 1'));
});

test('a weekend posts nothing and still prints OUTPUT', async () => {
  const s = sandbox([P('li1')]); const li = fake();
  const r = await run(s, li, { now: SAT });
  assert.equal(li.calls.length, 0);
  assert.ok(r.logs.some((l) => l.startsWith('OUTPUT:')));
});

test('a missing token is its named stop', async () => {
  const s = sandbox([P('li1')]);
  assert.equal((await run(s, fake(), { env: {} })).err?.code, 'SECRET_MISSING_LINKEDIN_APLAYERMODE_ACCESS_TOKEN');
});

test('a refused post records nothing (401 and 500)', async () => {
  for (const [status, code] of [[401, 'LINKEDIN_TOKEN_REFUSED'], [500, 'LINKEDIN_POST_REFUSED']]) {
    const s = sandbox([P('li1')]);
    assert.equal((await run(s, fake(status))).err?.code, code);
    assert.deepEqual(s.read().posted, []);
  }
});

test('gate-list wording is skipped and ends red; the next clean post goes', async () => {
  const s = sandbox([P('li1', 'Join for $9 a month.'), P('li2')]); const li = fake();
  const r = await run(s, li);
  assert.equal(r.err?.code, 'LINKEDIN_PHRASE_BLOCKED');
  assert.equal(li.calls.length, 1);
  assert.ok(li.calls[0].body.commentary.startsWith('Post li2'));
});

test('an empty bank is a named stop, never a quiet green', async () => {
  assert.equal((await run(sandbox([]), fake())).err?.code, 'LINKEDIN_BANK_EMPTY');
});

test('little text escapes every reserved character', () => {
  assert.equal(littleText('a (b) #c @d [e]'), 'a \\(b\\) \\#c \\@d \\[e\\]');
});
