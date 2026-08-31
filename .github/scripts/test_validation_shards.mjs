#!/usr/bin/env node
/**
 * Negative proofs for the shard coverage gate.
 *
 * The whole argument for sharding is that coverage is proven rather than
 * assumed, and a coverage gate is worth exactly what its failure cases are worth.
 * A gate that only ever runs against healthy input is indistinguishable from one
 * that returns PASS unconditionally, so each case below BREAKS something real,
 * asserts the gate fails and names the thing, then restores it and asserts green.
 *
 * These run against the live _repo_validation_matrix.json, never a fixture, so
 * they re-prove themselves against whatever the profile declares today rather
 * than against the validator set that existed when they were written.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const SHARDS = Number(process.env.SHARD_COUNT || 8);
const SHARDER = '.github/scripts/validation_shards.mjs';
const RECEIPT_DIR = 'artifacts/validation/shards';
const PLAN_FILE = 'artifacts/validation/shard-plan.json';

let failures = 0;
const say = (s) => console.log(s);

function sh(args) {
  const r = spawnSync('node', [SHARDER, ...args], {encoding: 'utf8', env: process.env});
  return {code: r.status ?? 2, out: `${r.stdout || ''}${r.stderr || ''}`};
}

/** Assert the gate's verdict and, when it should fail, that it NAMES the cause. */
function expect(label, {code, out}, wantPass, mustMention = []) {
  const passed = code === 0;
  const problems = [];
  if (passed !== wantPass) problems.push(`expected ${wantPass ? 'exit 0' : 'a non-zero exit'}, got ${code}`);
  for (const needle of mustMention) {
    if (!out.includes(needle)) problems.push(`output never names ${JSON.stringify(needle)}`);
  }
  if (problems.length) {
    failures += 1;
    say(`  FAIL ${label}`);
    for (const p of problems) say(`         ${p}`);
    say(out.split('\n').filter(Boolean).slice(-6).map((l) => `         | ${l}`).join('\n'));
  } else {
    say(`  ok   ${label}`);
  }
}

// A clean plan derived from the CURRENT matrix, plus synthetic receipts that
// stand in for a perfectly healthy run. Everything below mutates copies of these.
const plan = (() => {
  const r = sh(['plan', '--shards', String(SHARDS)]);
  if (r.code !== 0) {
    console.error(`[shards:test] FAIL: could not derive a plan to test against\n${r.out}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
})();

const declared = plan.declared_validator_ids;
if (!declared.length) {
  console.error('[shards:test] FAIL: the profile declares zero validators; these proofs would assert nothing');
  process.exit(1);
}
say(`[shards:test] proving the coverage gate against the live profile: ${declared.length} validators, ${SHARDS} shards`);

const healthy = plan.shards.map((bin) => ({
  profile: plan.profile,
  shard: bin.shard,
  shard_count: SHARDS,
  executed_ids: bin.steps.map((s) => s.id).sort(),
  executed_count: bin.steps.length,
  failures: [],
  results: bin.steps.map((s) => ({id: s.id, command: s.command, exit_code: 0, seconds: 0.1})),
}));

// The build job's receipt for the ordered steps. `verify` reconciles it together
// with the shard receipts against the whole profile, so the proofs need a
// healthy one in place before they can isolate a single deliberate breakage.
const PRODUCER_RECEIPT = 'artifacts/validation/shard-producers.json';
const orderedIds = plan.ordered_step_ids || [];
const healthyProducers = {
  profile: plan.profile,
  results: orderedIds.map((id) => ({id, command: `# ${id}`, exit_code: 0, seconds: 0.1})),
};
const producerBackup = fs.existsSync(PRODUCER_RECEIPT) ? fs.readFileSync(PRODUCER_RECEIPT, 'utf8') : null;
const layProducers = (r) => {
  fs.mkdirSync(path.dirname(PRODUCER_RECEIPT), {recursive: true});
  fs.writeFileSync(PRODUCER_RECEIPT, JSON.stringify(r, null, 2));
};

const backup = fs.existsSync(RECEIPT_DIR) ? fs.mkdtempSync(path.join(os.tmpdir(), 'shard-receipts-')) : null;
if (backup) for (const f of fs.readdirSync(RECEIPT_DIR)) fs.copyFileSync(path.join(RECEIPT_DIR, f), path.join(backup, f));

function lay(receipts) {
  layProducers(JSON.parse(JSON.stringify(healthyProducers)));
  fs.rmSync(RECEIPT_DIR, {recursive: true, force: true});
  fs.mkdirSync(RECEIPT_DIR, {recursive: true});
  for (const r of receipts) fs.writeFileSync(path.join(RECEIPT_DIR, `shard-${r.shard}.json`), JSON.stringify(r, null, 2));
}
const clone = () => JSON.parse(JSON.stringify(healthy));
const verify = () => sh(['verify', '--shards', String(SHARDS)]);

// 1. The control. Without this the other four prove only that the gate can fail,
//    not that it can distinguish.
lay(clone());
expect('every declared validator executed -> PASS', verify(), true);

// 2. Coverage loss: a validator the matrix declares that no shard ran. This is
//    the failure the whole design exists to catch, and silence here would mean a
//    fast green CI that quietly validates less.
{
  const r = clone();
  // Deliberately a shard with several validators, so the shard is still non-empty
  // afterwards. Emptying a one-validator shard would trip the empty-shard rule
  // instead and this case would silently stop testing coverage loss at all.
  const victim = r.filter((s) => s.executed_ids.length > 1).sort((a, b) => b.executed_ids.length - a.executed_ids.length)[0];
  if (!victim) { console.error('[shards:test] FAIL: no multi-validator shard to test coverage loss against'); process.exit(1); }
  const dropped = victim.executed_ids[0];
  victim.executed_ids = victim.executed_ids.filter((id) => id !== dropped);
  victim.executed_count = victim.executed_ids.length;
  victim.results = victim.results.filter((x) => x.id !== dropped);
  lay(r);
  expect(`one validator dropped -> FAIL naming ${dropped}`, verify(), false, [dropped]);
}

// 3. Rule 0: a shard that ran nothing must never exit 0.
{
  const r = clone();
  const victim = r.find((s) => s.executed_ids.length);
  const lost = victim.executed_ids.slice();
  victim.executed_ids = [];
  victim.executed_count = 0;
  victim.results = [];
  lay(r);
  expect(`an empty shard -> FAIL naming its ${lost.length} unrun validator(s)`, verify(), false, ['executed zero validators', lost[0]]);
}

// 4. A shard whose receipt never arrived - a cancelled or crashed runner. The
//    union of the receipts would simply be smaller, and without this check a
//    lost runner looks identical to a smaller profile.
{
  const r = clone().filter((s) => s.shard !== SHARDS - 1);
  lay(r);
  expect(`a missing shard receipt -> FAIL naming shard ${SHARDS - 1}`, verify(), false, [`shard ${SHARDS - 1} produced no receipt`]);
}

// 5. Restoring the healthy set must return green, proving the failures above were
//    caused by the breakage and not by the harness.
lay(clone());
expect('restored -> PASS', verify(), true);

// 6. Timing drift. Coverage can be perfect while the model is stale, which costs
//    wall clock silently because every run is still green.
{
  const r = clone();
  const victim = r.find((s) => s.results.length);
  victim.results[0].seconds = 9999;
  lay(r);
  expect(`a validator far slower than modelled -> FAIL naming ${victim.results[0].id}`, verify(), false, [victim.results[0].id, 'calibrate']);
}

// 7. The ordered build job is the other half of the coverage argument. A step it
//    failed to run must be named, or the union would simply be smaller and still
//    look internally consistent.
if (orderedIds.length) {
  lay(clone());
  const dropped = orderedIds[0];
  layProducers({...healthyProducers, results: healthyProducers.results.filter((r) => r.id !== dropped)});
  expect(`an ordered build step never run -> FAIL naming ${dropped}`, verify(), false, [dropped]);

  lay(clone());
  layProducers({...healthyProducers, results: healthyProducers.results.map((r, i) => (i ? r : {...r, exit_code: 1}))});
  expect(`an ordered build step that failed -> FAIL naming ${orderedIds[0]}`, verify(), false, [orderedIds[0]]);

  lay(clone());
  fs.rmSync(PRODUCER_RECEIPT, {force: true});
  expect('no build-job receipt at all -> FAIL rather than verifying only the shards', verify(), false, ['unaccounted for']);
}

// 8. A pin in the ordering file for a step the profile no longer declares is
//    doing nothing, and must say so instead of quietly having no effect.
{
  const ORDERING = '.github/validation-shard-ordering.json';
  const before = fs.existsSync(ORDERING) ? fs.readFileSync(ORDERING, 'utf8') : null;
  if (before) {
    const doc = JSON.parse(before);
    doc.ordered_steps = [...doc.ordered_steps, {id: 'VAL-STEP-THAT-DOES-NOT-EXIST', reason: 'deliberate'}];
    fs.writeFileSync(ORDERING, JSON.stringify(doc, null, 2));
    expect('a pinned step the profile no longer declares -> refused', sh(['plan', '--shards', String(SHARDS)]), false, ['VAL-STEP-THAT-DOES-NOT-EXIST']);
    const doc2 = JSON.parse(before);
    doc2.ordered_steps = doc2.ordered_steps.map((d) => ({id: d.id}));
    fs.writeFileSync(ORDERING, JSON.stringify(doc2, null, 2));
    expect('a pin with no stated reason -> refused', sh(['plan', '--shards', String(SHARDS)]), false, ['must carry a reason']);
    fs.writeFileSync(ORDERING, before);
  }
}

// 9. The gate must hard-fail rather than pass when it examines nothing at all.
lay(clone());
fs.rmSync(RECEIPT_DIR, {recursive: true, force: true});
fs.mkdirSync(RECEIPT_DIR, {recursive: true});
expect('zero receipts -> FAIL rather than an empty-loop pass', verify(), false, ['examined zero items']);

// 10. Plan-time Rule 0: more shards than validators would create an empty shard.
expect(
  'more shards than validators -> refused at plan time',
  sh(['plan', '--shards', String(declared.length + 1)]),
  false,
  ['exit 0 having done nothing'],
);

// 11. Every declared validator must be assigned to some shard, at every shard
//    count the workflow might plausibly use.
for (const n of [1, 4, 8, 16]) {
  if (n > declared.length) continue;
  const r = sh(['plan', '--shards', String(n)]);
  const p = r.code === 0 ? JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')) : null;
  const assigned = p ? p.shards.flatMap((b) => b.steps.map((s) => s.id)) : [];
  const ok = p && new Set(assigned).size === declared.length && assigned.length === declared.length;
  if (ok) say(`  ok   ${n} shard(s): all ${declared.length} validators assigned exactly once`);
  else { failures += 1; say(`  FAIL ${n} shard(s): ${new Set(assigned).size} of ${declared.length} validators assigned`); }
}

// Leave the tree as it was found. This matters in CI: the proofs run in the plan
// job before anything is built, and a synthetic receipt left behind would be
// picked up later as if a real run had produced it.
fs.rmSync(PRODUCER_RECEIPT, {force: true});
if (producerBackup !== null) fs.writeFileSync(PRODUCER_RECEIPT, producerBackup);
fs.rmSync(RECEIPT_DIR, {recursive: true, force: true});
if (backup) {
  fs.mkdirSync(RECEIPT_DIR, {recursive: true});
  for (const f of fs.readdirSync(backup)) fs.copyFileSync(path.join(backup, f), path.join(RECEIPT_DIR, f));
  fs.rmSync(backup, {recursive: true, force: true});
}
sh(['plan', '--shards', String(SHARDS)]);

if (failures) {
  console.error(`[shards:test] FAIL: ${failures} coverage-gate proof(s) did not hold`);
  process.exit(1);
}
console.log('[shards:test] OK: the coverage gate fails, and names the cause, in every case it exists to catch');
