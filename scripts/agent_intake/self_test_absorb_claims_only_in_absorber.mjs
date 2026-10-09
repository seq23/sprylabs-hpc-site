#!/usr/bin/env node
// A pending Twin Agent drop is inert everywhere except the absorber lane.
//
// Seven Saturdays (2026-08-08 .. 2026-09-26) the drop commit itself went red in
// Validate Repo, because Validate Repo's producer chain ran the absorber, which
// claimed the READY_FOR_ABSORPTION run, and build:all then rewrote governed
// pages the commit did not contain (Validate Repo 36245892704: "[extraction-
// surface-guard] FAIL: 5 governed surfaces changed"). absorb_bhpc_agent_runs.mjs
// now claims a READY run only where BHPC_ABSORB_READY_RUNS=1, which only
// spry-content-release.yml sets.
//
// Proved by running the REAL absorber in a scratch tree holding the real
// 2026-09-26 drop (manifest reset to the writer's template), both ways, and by
// reading the workflows so the switch cannot be flipped on in a validation lane.
// Hard-fails on zero assertions.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const REAL = fs.realpathSync(process.cwd());
const ABSORB = path.join(REAL, 'scripts/agent_intake/absorb_bhpc_agent_runs.mjs');
const DROP_REL = 'data/report_fixes/agent_runs/2026-09-26/bhpc';
const MANIFEST_REL = `${DROP_REL}/agent_run_manifest.json`;
const NORMALIZED_REL = 'data/report_fixes/normalized_agent_runs/2026-09-26_bhpc.json';
const SOCIAL_REL = 'data/social/runs/2026-09-26-bhpc-agent.json';
const WORKFLOWS = '.github/workflows';
const ABSORBER = `${WORKFLOWS}/spry-content-release.yml`;

let assertions = 0;
const failures = [];
function check(name, ok, detail = '') {
  assertions += 1;
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const TEMPLATE = {
  source: 'twin_agent', run_date: '2026-09-26', scope: 'bhpc',
  csv_path: `${DROP_REL}/bhpc.csv`, html_path: `${DROP_REL}/bhpc.html`, json_path: `${DROP_REL}/bhpc.json`,
  status: 'READY_FOR_ABSORPTION',
};

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-claims-'));
  fs.mkdirSync(path.join(dir, DROP_REL), {recursive: true});
  for (const f of ['bhpc.csv', 'bhpc.html', 'bhpc.json']) fs.copyFileSync(path.join(REAL, DROP_REL, f), path.join(dir, DROP_REL, f));
  fs.writeFileSync(path.join(dir, MANIFEST_REL), `${JSON.stringify(TEMPLATE, null, 2)}\n`);
  for (const f of fs.readdirSync(path.join(REAL, 'data/report_fixes')).filter((x) => x.endsWith('.json'))) {
    fs.copyFileSync(path.join(REAL, 'data/report_fixes', f), path.join(dir, 'data/report_fixes', f));
  }
  return dir;
}
function absorb(cwd, value) {
  const env = {...process.env};
  delete env.BHPC_ABSORB_READY_RUNS;
  if (value !== undefined) env.BHPC_ABSORB_READY_RUNS = value;
  const r = spawnSync(process.execPath, [ABSORB], {cwd, env, encoding: 'utf8'});
  return {code: r.status, out: `${r.stdout}\n${r.stderr}`};
}

if (!fs.existsSync(path.join(REAL, DROP_REL, 'bhpc.json'))) {
  console.error(`[absorb-claims-only-in-absorber] FAIL: the fixture drop ${DROP_REL} is not in the tree; this test replays the real 2026-09-26 artifact`);
  process.exit(1);
}

// Everywhere that is not the absorber: pending, named, untouched.
for (const [label, value] of [['unset', undefined], ['"true" (not the switch)', 'true'], ['"0"', '0']]) {
  const dir = scratch();
  const before = fs.readFileSync(path.join(dir, MANIFEST_REL), 'utf8');
  const r = absorb(dir, value);
  check(`BHPC_ABSORB_READY_RUNS ${label}: exit 0`, r.code === 0, r.out.slice(-300));
  check(`BHPC_ABSORB_READY_RUNS ${label}: the READY manifest is byte-for-byte untouched`, fs.readFileSync(path.join(dir, MANIFEST_REL), 'utf8') === before);
  check(`BHPC_ABSORB_READY_RUNS ${label}: no normalized run and no social run are written, so no page can change`, !fs.existsSync(path.join(dir, NORMALIZED_REL)) && !fs.existsSync(path.join(dir, SOCIAL_REL)));
  check(`BHPC_ABSORB_READY_RUNS ${label}: the pending run is named, not silent`, r.out.includes(`NAMED STOP pending_absorption: ${MANIFEST_REL}`) && /pending_for_absorber=1/.test(r.out), r.out.slice(-300));
  fs.rmSync(dir, {recursive: true, force: true});
}

// The absorber lane: claims it.
{
  const dir = scratch();
  const r = absorb(dir, '1');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_REL), 'utf8'));
  check('BHPC_ABSORB_READY_RUNS=1: the absorber claims the run (ABSORBED)', r.code === 0 && manifest.status === 'ABSORBED', `${manifest.status} ${r.out.slice(-200)}`);
  check('BHPC_ABSORB_READY_RUNS=1: normalized and social runs are written', fs.existsSync(path.join(dir, NORMALIZED_REL)) && fs.existsSync(path.join(dir, SOCIAL_REL)));
  fs.rmSync(dir, {recursive: true, force: true});
}

// Only the absorber lane holds the switch.
const workflows = fs.readdirSync(path.join(REAL, WORKFLOWS)).filter((f) => /\.ya?ml$/.test(f));
check('workflows examined', workflows.length > 0);
const absorberText = fs.readFileSync(path.join(REAL, ABSORBER), 'utf8');
const topEnv = absorberText.slice(absorberText.indexOf('\nenv:\n'), absorberText.indexOf('\npermissions:'));
check(`${ABSORBER} sets BHPC_ABSORB_READY_RUNS: "1" in its top-level env`, /\n {2}BHPC_ABSORB_READY_RUNS: "1"\n/.test(topEnv));
for (const f of workflows.filter((x) => `${WORKFLOWS}/${x}` !== ABSORBER)) {
  const text = fs.readFileSync(path.join(REAL, WORKFLOWS, f), 'utf8');
  check(`${WORKFLOWS}/${f} does not set BHPC_ABSORB_READY_RUNS (only the absorber claims new runs)`, !text.includes('BHPC_ABSORB_READY_RUNS'));
}

// One definition: the absorber and every validator that asks "must this run be
// normalized already?" read the same predicate, so they cannot disagree.
for (const rel of ['scripts/agent_intake/absorb_bhpc_agent_runs.mjs', 'scripts/validators/validate_bhpc_agent_source_coverage.mjs', 'scripts/validators/validate_derived_absorber_reproducibility.mjs']) {
  const text = fs.readFileSync(path.join(REAL, rel), 'utf8');
  check(`${rel} reads isPendingForAbsorber from absorption_claim.mjs`, /import \{[^}]*isPendingForAbsorber[^}]*\} from '[./]*(agent_intake\/)?absorption_claim\.mjs'/.test(text) && text.includes('isPendingForAbsorber(entry'));
  check(`${rel} does not read the switch on its own`, !text.includes("BHPC_ABSORB_READY_RUNS === '1'") && !text.includes('env.BHPC_ABSORB_READY_RUNS'));
}

if (assertions === 0) { console.error('[absorb-claims-only-in-absorber] FAIL: zero assertions'); process.exit(1); }
if (failures.length) {
  console.error(`[absorb-claims-only-in-absorber] FAIL: ${failures.length} of ${assertions}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[absorb-claims-only-in-absorber] PASS: ${assertions} assertion(s); a READY drop is inert and named in every lane but Spry Content Release, which alone claims it.`);
