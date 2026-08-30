#!/usr/bin/env node
// The guard for "this lane has no real signal source".
//
// Daily Citation Intelligence went red every morning on
// [release:plan] STOP ALL_CANDIDATES_FIXTURE_ONLY. Nothing was broken: every
// credentialed source is deliberately disabled, the operator has supplied no
// data/signals/manual_import.json, and the lane correctly refuses to publish
// fixture-derived pages to a public site. That stop now exits 0 as a NAMED STOP.
//
// An exit 0 on a stop is dangerous exactly once: when it starts swallowing the
// defect it was written to expose. This lane spent eight weeks printing PASS with
// selected=0 while discarding 100% of real candidates behind a gate nothing had
// enabled. So this validator holds both ends:
//
//   A. The registry's `producing` flag and each adapter's own `producing` export
//      must agree. agent_artifacts was registered enabled:true and returned []
//      from both of its branches - a source that could never emit a record while
//      the registry counted it as live. Two lists, one fact, no link.
//   B. The exit-0 path is proven to be conditional. With no non-fixture record in
//      the collection ledger, release:plan must exit 0; with a producing source
//      shown delivering records and the plan still selecting nothing, it must
//      exit 1. Injected, both directions, every run.
//
// Zero-item rule: it hard-fails if it examined no sources or no adapters rather
// than passing on an empty loop.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = process.cwd();
const REGISTRY = 'data/signals/source_registry.json';
const LEDGER = 'artifacts/validation/firehose-collection.json';
const PLAN = 'scripts/citation_intelligence/build_release_plan.mjs';
const errors = [];
const checks = [];

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8'));
const sources = registry.sources || [];
if (!sources.length) {
  console.error('[signal-source-producers] FAIL: the source registry lists no sources; there is nothing to prove.');
  process.exit(1);
}

// --- A. registry `producing` must match what the adapter says about itself -----
let adaptersInspected = 0;
for (const source of sources) {
  if (source.adapter === 'fixture') continue;
  const modPath = path.resolve(ROOT, `scripts/firehose/adapters/${source.adapter}.mjs`);
  if (!fs.existsSync(modPath)) { errors.push(`${source.id}: adapter ${source.adapter}.mjs is missing`); continue; }
  const mod = await import(modPath);
  adaptersInspected += 1;
  const adapterProducing = mod.producing !== false;
  const registryProducing = source.producing !== false;
  if (adapterProducing !== registryProducing) {
    errors.push(`${source.id}: registry says producing=${registryProducing} but ${source.adapter}.mjs declares producing=${adapterProducing}. A source the registry counts as live must be able to emit a record.`);
  }
  // A source declared producing must not be a permanent-empty stub: with the
  // source enabled and allowed, it must either return records or be honest that
  // its operator input is simply absent.
  if (registryProducing) {
    const result = await mod.collect({...source, enabled: true, terms_status: 'allowed'});
    if ((result.records || []).length === 0 && !JSON.stringify(result.warnings || []).length) {
      errors.push(`${source.id}: produced no records and said nothing about why; a silent empty producer is indistinguishable from a broken one`);
    }
  }
}
if (adaptersInspected === 0) {
  errors.push('no non-fixture adapters were inspected; either the registry was emptied or this check no longer reaches the adapters it governs');
} else {
  checks.push(`${adaptersInspected} non-fixture adapter(s) agree with the registry on producing capability`);
}

// --- B. the exit-0 path is conditional, proven in both directions --------------
const ledgerPath = path.join(ROOT, LEDGER);
const ledgerBefore = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : null;
let restored = false;
const restore = () => {
  if (restored) return; restored = true;
  if (ledgerBefore === null) fs.rmSync(ledgerPath, {force: true});
  else fs.writeFileSync(ledgerPath, ledgerBefore);
};
process.on('exit', restore);

const runPlan = () => spawnSync(process.execPath, [PLAN], {cwd: ROOT, encoding: 'utf8'});
const producingIds = sources.filter((s) => s.enabled && s.producing !== false && s.adapter !== 'fixture').map((s) => s.id);
if (!producingIds.length) {
  errors.push('no enabled producing non-fixture source is configured, so the exit-1 direction cannot be injected; this check would prove nothing');
} else if (ledgerBefore === null) {
  errors.push(`${LEDGER} is absent, so the stop discrimination cannot be exercised`);
} else {
  const ledger = JSON.parse(ledgerBefore);
  // B1: nothing real arrived -> named stop, exit 0
  const quiet = {...ledger, adapters: (ledger.adapters || []).map((a) => (producingIds.includes(a.source) ? {...a, records: 0} : a))};
  fs.writeFileSync(ledgerPath, `${JSON.stringify(quiet, null, 2)}\n`);
  const quietRun = runPlan();
  if (quietRun.status !== 0) errors.push(`with no non-fixture record delivered, release:plan exited ${quietRun.status}; the configuration gap must be a named stop, not a red lane\n${quietRun.stdout}${quietRun.stderr}`);
  else if (!/NAMED STOP/.test(quietRun.stdout || '')) errors.push('release:plan exited 0 without printing a NAMED STOP; a silent zero is what this rule exists to prevent');
  else if (!/WHO MUST ACT/.test(quietRun.stdout || '')) errors.push('the named stop does not say who must act; a stop no human can action is a hidden failure');
  else checks.push('no non-fixture record -> NAMED STOP naming the owner, exit 0');

  // B2: something real arrived and still nothing published -> hard failure
  const loud = {...ledger, adapters: (ledger.adapters || []).map((a) => (producingIds.includes(a.source) ? {...a, records: 7, status: 'PASS'} : a))};
  fs.writeFileSync(ledgerPath, `${JSON.stringify(loud, null, 2)}\n`);
  const loudRun = runPlan();
  if (loudRun.status === 0) {
    errors.push('release:plan exited 0 while a producing source had delivered 7 records and the plan still selected nothing; the named stop has started swallowing the eight-week defect it replaced');
  } else {
    checks.push('producing source delivered records but nothing published -> hard failure preserved');
  }
  restore();
}

const report = {
  schema_version: '1.0',
  validator: 'signal-source-producers',
  status: errors.length ? 'FAIL' : 'PASS',
  sources_examined: sources.length,
  adapters_inspected: adaptersInspected,
  enabled_producing_sources: producingIds,
  checks,
  errors,
  checked_at: new Date().toISOString(),
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/signal-source-producers.json'), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`[signal-source-producers] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`[signal-source-producers] PASS sources=${sources.length} adapters=${adaptersInspected}; ${checks.join('; ')}`);
