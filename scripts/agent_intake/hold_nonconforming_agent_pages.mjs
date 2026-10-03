#!/usr/bin/env node
// INTAKE HOLDS, IT DOES NOT HALT.
//
// Three Fridays in a row (2026-09-19, 2026-09-26, 2026-10-03 - Spry Content
// Release 37127626280 on f4163ce) the Twin Agent's weekly drop reached main by
// direct push and the release it started went red at release:agent-intake:raw,
// each time on ONE page the lane had rendered but could not make conform to a
// validator. Each week's fix repaired that week's symptom; the shape stayed:
// the page-seo contract was the LAST stage, so one nonconforming page was a
// verdict on all eleven, and on main.
//
// This stage runs before the contract validator and asks the SAME question of
// every active page (scripts/lib/page_seo_contract.mjs - one definition). A page
// that fails is HELD, by name:
//   1. its bytes go back to the last validated page (git HEAD; a page that did
//      not exist there is removed), so nothing nonconforming can be committed;
//   2. a row goes into data/content/agent_page_quarantine.json under lane
//      agent_intake_hold, keyed by the plan's own spec fingerprint, so every
//      later plan rebuild in this run (validate:agent-run, content-finalize)
//      and every daily run until the next drop plans the spec BLOCKED and the
//      applier never touches the page;
//   3. the plan is rebuilt here and checked: the held spec must come back
//      BLOCKED with reason held_by_intake:..., or this stage fails by name -
//      a ledger the builder cannot read would be a hold that does not hold;
//   4. the hold is reported: a NAMED STOP line per page with the exact rule it
//      broke, artifacts/validation/agent-intake-held-pages.json (committed by
//      the release), and the GitHub step summary when there is one.
// Every conforming page ships. The run exits 0 with a hold; it exits 1 only when
// the hold itself cannot be made (no plan, no manifest, no validated copy, or a
// plan rebuild that does not honour the ledger).
//
// A hold clears itself: the fingerprint changes when the next drop changes the
// page's acceptance set, so the page is re-rendered and re-judged then - and held
// again by name if it still does not conform. Deleting the ledger row re-judges
// it at once.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {examinePageSeoContract, acceptanceEntriesByPath, activePlanSpecs} from '../lib/page_seo_contract.mjs';
import {readQuarantine, writeQuarantine, quarantinedRow, quarantineReason, HOLD_LANE, QUARANTINE_PATH} from '../lib/agent_page_quarantine.mjs';

const ROOT = process.cwd();
const TAG = '[agent-intake-hold]';
const PLAN_PATH = 'artifacts/validation/agent-exact-implementation-plan.json';
const MANIFEST_PATH = 'data/report_fixes/agent_acceptance_manifest.generated.json';
const REPORT_PATH = 'artifacts/validation/agent-intake-held-pages.json';
const PLAN_BUILDER = path.join(ROOT, 'scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs');

function stop(message) {
  console.error(`${TAG} FAIL: ${message}`);
  process.exit(1);
}
function readRequiredJson(rel, produced) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) stop(`required artifact ${rel} is missing; produce it with \`${produced}\`. A hold stage with no plan cannot say which pages are active, and would hold nothing while reporting PASS.`);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (error) { stop(`required artifact ${rel} is not valid JSON (${error.message}); regenerate it with \`${produced}\`.`); }
  return null;
}
function git(args, opts = {}) {
  return spawnSync('git', args, {cwd: ROOT, encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024});
}

/** Put the page back to its last validated bytes. Returns how. */
function restoreLastValidated(rel) {
  const inRepo = git(['rev-parse', '--is-inside-work-tree']);
  if (inRepo.status !== 0) stop(`${rel} failed the page-seo contract but cannot be held: ${ROOT} is not a git work tree, so there is no last validated copy to restore. (${String(inRepo.stderr).trim()})`);
  const tracked = git(['cat-file', '-e', `HEAD:${rel}`]);
  const abs = path.join(ROOT, rel);
  if (tracked.status === 0) {
    const show = git(['show', `HEAD:${rel}`], {binary: true});
    if (show.status !== 0) stop(`${rel}: git show HEAD:${rel} exited ${show.status}; the page cannot be restored, so it cannot be held. ${String(show.stderr).trim()}`);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, show.stdout);
    return 'restored_from_head';
  }
  if (fs.existsSync(abs)) fs.rmSync(abs);
  return 'removed_not_in_head';
}

const plan = readRequiredJson(PLAN_PATH, 'npm run agent:bhpc:plan-exact');
const manifest = readRequiredJson(MANIFEST_PATH, 'npm run agent:bhpc:compile-acceptance');
const active = activePlanSpecs(plan);
const activeIds = new Set(active.flatMap(x => x.acceptance_ids || []).map(String));
const acceptance = acceptanceEntriesByPath(manifest, activeIds);
const runId = process.env.GITHUB_RUN_ID || 'local';

const held = [];
let examined = 0;
for (const spec of active) {
  const rel = String(spec.implementation_path).replace(/^\/+/, '');
  const abs = path.join(ROOT, rel);
  let failures;
  if (!fs.existsSync(abs)) {
    failures = [{path: rel, code: 'SCOPED_PAGE_MISSING'}];
  } else {
    const html = fs.readFileSync(abs, 'utf8');
    failures = examinePageSeoContract({rel, html, acceptanceEntries: acceptance.get(rel) || [], active: true}).failures;
  }
  examined += 1;
  if (!failures.length) continue;
  if (!spec.quarantine_fingerprint) stop(`${rel} failed the page-seo contract but its plan spec carries no quarantine_fingerprint, so the hold could not be keyed the way the plan builder reads it back. Rebuild the plan with \`npm run agent:bhpc:plan-exact\` (the builder writes the fingerprint on every spec).`);
  const reasons = failures.map(f => `page-seo-contract ${f.code}${f.detail !== undefined ? `: ${f.detail}` : ''}`);
  const restored = restoreLastValidated(rel);
  held.push({
    path: rel,
    spec_fingerprint: spec.quarantine_fingerprint,
    lane: HOLD_LANE,
    record_id: spec.record_id || null,
    acceptance_ids: spec.acceptance_ids || [],
    operation: spec.operation || null,
    reasons,
    held_by: 'validate:page-seo-contract',
    restored,
    release_run: runId,
    quarantined_at: new Date().toISOString(),
  });
}

if (held.length) {
  const ledger = readQuarantine(ROOT);
  for (const row of held) {
    ledger.rows = ledger.rows.filter(r => !(r.path === row.path && r.spec_fingerprint === row.spec_fingerprint));
    ledger.rows.push(row);
  }
  writeQuarantine(ledger, ROOT);

  // The hold must be honoured by the ONE reader of the ledger, now, in this run.
  const rebuild = spawnSync(process.execPath, [PLAN_BUILDER], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (rebuild.status !== 0) stop(`plan rebuild after the hold exited ${rebuild.status}:\n${rebuild.stdout}\n${rebuild.stderr}`);
  const rebuilt = readRequiredJson(PLAN_PATH, 'npm run agent:bhpc:plan-exact');
  const after = readQuarantine(ROOT);
  for (const row of held) {
    const specs = (rebuilt.specs || []).filter(s => String(s.implementation_path || '').replace(/^\/+/, '') === row.path);
    const planned = specs.filter(s => s.status !== 'BLOCKED');
    const ledgered = quarantinedRow(after, row.path, row.spec_fingerprint);
    if (!ledgered || planned.length) stop(`${row.path} was held and ledgered, but the rebuilt plan still carries ${planned.length} non-BLOCKED spec(s) for it (ledger row ${ledgered ? 'present' : 'MISSING'}). The hold does not hold; the fingerprint this stage wrote is not the one the builder derives. Nothing was committed.`);
    row.plan_blocked_reason = quarantineReason(ledgered);
  }
}

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: held.length ? 'HELD' : 'PASS',
  release_run: runId,
  active_count: active.length,
  examined,
  held_count: held.length,
  shipped_count: active.length - held.length,
  ledger: QUARANTINE_PATH,
  held,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, REPORT_PATH), JSON.stringify(report, null, 2) + '\n');

for (const row of held) {
  console.log(`${TAG} NAMED STOP agent_page_held: ${row.path} broke ${row.reasons.join('; ')}. The page keeps its last validated bytes (${row.restored}); its spec is planned BLOCKED (${row.plan_blocked_reason}); records ${row.acceptance_ids.join(', ') || row.record_id} stay in the backlog and are re-judged when the next drop changes this page's acceptance set, or at once if the row is deleted from ${QUARANTINE_PATH}. The other ${active.length - held.length} active page(s) ship.`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = held.length
    ? [`### Agent intake: ${held.length} page(s) HELD, ${active.length - held.length} shipped`, '', '| page | rule it broke | now |', '|---|---|---|', ...held.map(r => `| \`${r.path}\` | ${r.reasons.join('; ')} | ${r.restored}; spec BLOCKED until the acceptance set changes |`), '', `Ledger: \`${QUARANTINE_PATH}\` (lane \`${HOLD_LANE}\`); report: \`${REPORT_PATH}\`.`]
    : [`### Agent intake: ${active.length} active page(s) examined against the page-seo contract, 0 held`];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
if (!active.length) console.log(`${TAG} PASS: 0 active specs in ${PLAN_PATH} - no agent page was rendered this run, so there is nothing to examine or hold.`);
else console.log(`${TAG} ${report.status}: examined=${examined}; held=${held.length}; shipped=${report.shipped_count}; report=${REPORT_PATH}`);
