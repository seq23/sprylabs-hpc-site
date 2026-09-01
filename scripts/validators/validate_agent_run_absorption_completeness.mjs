#!/usr/bin/env node
/**
 * Did the water come out of the pipe?
 *
 * THE GAP THIS FILLS.
 *
 * Every existing intake validator proves the PLUMBING:
 *
 *   validate_bhpc_agent_artifact_continuity  the manifest exists, csv/html/json
 *                                            are on disk, normalized_path exists
 *   validate_bhpc_agent_artifact_priority    package scripts and workflow
 *                                            permissions are wired
 *   validate_bhpc_agent_source_coverage      every raw row survived into the
 *                                            normalized file
 *
 * Not one of them compares what a run ASKED FOR against what the repository now
 * CONTAINS. A run could deliver 61 recommendations, have every one of them
 * normalized, ledgered and traced, and change nothing on any page - and all
 * three would pass. The sister repo on the same external agent proved that is
 * not hypothetical: a run landed at 09:33 and was inert by lunchtime, 4 of 12
 * named targets absorbed and its reported 404 still a 404, while every intake
 * validator passed. Going back through its history: 336 ready rows unabsorbed
 * across 27 runs.
 *
 * This validator asks the outcome question. It walks the drop directory rather
 * than reading a hardcoded list of verticals, so a new vertical is covered the
 * day it starts arriving and needs no code change here.
 *
 * WHAT IT ASSERTS, all HARD_FAIL:
 *
 *  A. Runs exist and were digested. Zero run directories, or a run directory
 *     with no manifest, means this validator examined nothing (Rule 0).
 *
 *  B. No landed-but-inert run. A run whose artifact carried rows must have
 *     produced acceptance entries. A run that delivered recommendations and
 *     compiled into zero requirements absorbed nothing, however green the
 *     plumbing looks.
 *
 *  C. Absorption is not starved. Outstanding REQUIRED work is carried forward a
 *     bounded number of pages per run (BHPC_BACKLOG_CARRY_LIMIT). If the
 *     outstanding residue reaches that limit the carry is SATURATED: the
 *     backlog can no longer drain, and genuinely new work from the latest run
 *     is crowded out by residue. That is a silent cap starving absorption and
 *     it is a hard failure, not a warning.
 *
 *  D. Every outstanding entry is accounted for. An entry is acceptable as
 *     outstanding only if it is inside the carry window - so the next run will
 *     attempt it - or it carries a NAMED blocked reason. An entry that is
 *     neither is work the pipeline has quietly stopped trying to do.
 *
 * It uses scripts/lib/bhpc_agent_acceptance_satisfaction.mjs, the same test the
 * plan builder and the trace use, so this validator cannot drift from the lanes
 * it is judging - which was itself the defect that produced a 125-entry
 * false-negative backlog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBhpcAcceptance } from '../lib/bhpc_agent_acceptance_satisfaction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DROP_ROOT = 'data/report_fixes/agent_runs';
const MANIFEST = 'data/report_fixes/agent_acceptance_manifest.generated.json';
const CARRY_LIMIT = Number(process.env.BHPC_BACKLOG_CARRY_LIMIT || 120);
const OUT = process.env.AGENT_ABSORPTION_OUT
  || 'artifacts/validation/agent-run-absorption-completeness.json';

const errors = [];
const notes = [];
const namedStops = [];
const POLICY_FILE = 'data/report_fixes/agent_exact_implementation_policy.json';
const readJson = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; }
};

// ------------------------------------------- A. walk the drop directory

/** Every <date>/<vertical> pair that carries a manifest. Discovered, never
 *  listed: a new vertical is covered the day it first arrives. */
function discoverRuns() {
  const found = [];
  const dropAbs = path.join(ROOT, DROP_ROOT);
  let dates = [];
  try {
    dates = fs.readdirSync(dropAbs, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    errors.push(`${DROP_ROOT}: unreadable. The external agent's drop directory is where every run lands; this validator examined nothing (Rule 0).`);
    return found;
  }
  for (const date of dates) {
    let verticals = [];
    try {
      verticals = fs.readdirSync(path.join(dropAbs, date), { withFileTypes: true })
        .filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch { continue; }
    if (!verticals.length) {
      errors.push(`${DROP_ROOT}/${date}: contains no vertical directory, so a run landed with nothing under it`);
      continue;
    }
    for (const vertical of verticals) {
      const rel = `${DROP_ROOT}/${date}/${vertical}`;
      const manifest = readJson(`${rel}/agent_run_manifest.json`);
      if (!manifest) {
        errors.push(`${rel}: no readable agent_run_manifest.json, so this run cannot be reconciled against the repository at all`);
        continue;
      }
      found.push({ date, vertical, rel, manifest });
    }
  }
  return found;
}

// The absorption cutover is a recorded decision, read from data rather than
// hardcoded here, so changing the policy changes this validator's verdict.
const policy = readJson(POLICY_FILE);
if (!policy) {
  errors.push(`${POLICY_FILE}: unreadable, so a run excluded before the cutover cannot be told apart from one that landed and did nothing`);
}
function beforeCutover(runDate) {
  if (!policy) return false;
  if (policy.retroactive_processing !== false) return false;
  if (!policy.effective_from) return false;
  return String(runDate) < String(policy.effective_from);
}

const runs = discoverRuns();
if (!runs.length) {
  errors.push(`${DROP_ROOT}: no agent run was discovered. This validator refuses to pass on an empty drop directory (Rule 0).`);
}

// ------------------------------------- B/C/D. what was asked vs what is here

const acceptance = readJson(MANIFEST);
if (!acceptance) {
  errors.push(`${MANIFEST}: unreadable, so nothing can be compared against what the runs asked for`);
}
const entries = acceptance?.entries || [];

const htmlCache = new Map();
function pageHtml(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  if (!clean) return null;
  if (htmlCache.has(clean)) return htmlCache.get(clean);
  let text = null;
  try { text = fs.readFileSync(path.join(ROOT, clean), 'utf8'); } catch { text = null; }
  htmlCache.set(clean, text);
  return text;
}

const perRun = [];
let evaluated = 0;
let outstandingTotal = 0;
const outstandingUnaccounted = [];

// Newest run date drives the carry window: the latest run always enters the
// plan whole, and older outstanding work is carried oldest-first up to the
// limit. An outstanding entry inside that window will be attempted next run.
const allRunDates = [...new Set(entries.map((e) => String(e.run_date || '')).filter(Boolean))].sort();
const newestRunDate = allRunDates.at(-1) || '';

const olderOutstanding = [];

for (const run of runs) {
  const forRun = entries.filter((e) => String(e.run_date || '') === run.date
    && String(e.scope || 'bhpc') === run.vertical);
  const required = forRun.filter((e) => e.acceptance_status === 'REQUIRED');
  const blocked = forRun.filter((e) => e.acceptance_status === 'BLOCKED');

  const declaredRows = Number(run.manifest.absorbed_record_count || 0);
  const status = String(run.manifest.status || '').toUpperCase();

  // B. landed but inert.
  //
  // Two of the thirteen runs on disk - 2026-06-23 and 2026-06-24 - are inert:
  // ABSORBED, 17 records between them, zero acceptance entries. They are not a
  // silent defect. data/report_fixes/agent_exact_implementation_policy.json
  // declares effective_from 2026-06-27 with retroactive_processing false and
  // do_not_process_absorbed_runs_before_cutover true, so they are excluded by a
  // recorded decision that a human can read and reverse.
  //
  // A NAMED stop is reported rather than an error. An inert run at or after the
  // cutover has no such cover and stays a hard failure - which is the case this
  // check exists for, and the one that cost the sister repo 336 rows.
  if (status === 'ABSORBED' && declaredRows > 0 && forRun.length === 0) {
    if (beforeCutover(run.date)) {
      namedStops.push(
        `${run.rel}: STOP before_exact_implementation_cutover - ${declaredRows} record(s) absorbed under normalization schema 1.0, which carried no target path, `
        + `and ${POLICY_FILE} declares effective_from=${policy?.effective_from} with retroactive_processing=false. `
        + 'The raw artifact is intact on disk and retains intended_winner_page, so this is recoverable by setting retroactive_processing=true, not lost.',
      );
    } else {
      errors.push(
        `${run.rel}: manifest declares status ABSORBED with ${declaredRows} record(s), but the acceptance manifest holds ZERO entries for this run. `
        + 'The artifact landed, was ledgered, and asked the repository for nothing. That is an inert run, and every plumbing validator passes on it.',
      );
    }
  }

  let satisfied = 0;
  const outstanding = [];
  for (const entry of required) {
    const html = pageHtml(entry.implementation_path);
    evaluated += 1;
    if (html == null) {
      outstanding.push({ id: entry.id, path: entry.implementation_path, reasons: ['target_missing'] });
      continue;
    }
    const verdict = evaluateBhpcAcceptance(entry, html);
    if (verdict.satisfied) satisfied += 1;
    else outstanding.push({ id: entry.id, path: entry.implementation_path, reasons: verdict.reasons });
  }

  outstandingTotal += outstanding.length;
  if (run.date !== newestRunDate) {
    for (const o of outstanding) olderOutstanding.push({ ...o, run_date: run.date, vertical: run.vertical });
  }

  perRun.push({
    run_date: run.date,
    vertical: run.vertical,
    manifest_status: status,
    declared_records: declaredRows,
    acceptance_entries: forRun.length,
    required: required.length,
    blocked: blocked.length,
    satisfied,
    outstanding: outstanding.length,
    outstanding_examples: outstanding.slice(0, 5),
  });
}

// D. every outstanding entry must be inside the carry window or named as blocked.
// The window is pages, carried oldest-first; anything beyond the limit is work
// the pipeline has stopped attempting.
const carryOrdered = olderOutstanding
  .slice()
  .sort((a, b) => String(a.run_date).localeCompare(String(b.run_date)));
const carriedPaths = new Set();
for (const o of carryOrdered) {
  if (carriedPaths.size >= CARRY_LIMIT && !carriedPaths.has(o.path)) {
    outstandingUnaccounted.push(o);
    continue;
  }
  carriedPaths.add(o.path);
}

if (outstandingUnaccounted.length) {
  errors.push(
    `${outstandingUnaccounted.length} outstanding recommendation(s) fall outside the ${CARRY_LIMIT}-page backlog carry window and carry no named blocked reason, `
    + 'so no future run will attempt them. They were delivered by the external agent, accepted as REQUIRED, and silently abandoned.',
  );
}

// C. saturation. Distinct pages, because the carry bounds pages, not entries.
const outstandingPages = new Set(olderOutstanding.map((o) => o.path));
if (outstandingPages.size >= CARRY_LIMIT) {
  errors.push(
    `the backlog carry is SATURATED: ${outstandingPages.size} page(s) carry outstanding work and the carry limit is ${CARRY_LIMIT}. `
    + 'At saturation the backlog cannot drain and new work from the latest run is crowded out by residue - a silent cap starving absorption.',
  );
}

// ------------------------------- E. ledgered work must still be on the page
//
// The three data/citation/agent_*_specs.generated.json manifests are rebuilt
// wholesale from the CURRENT plan each run - they carry an `active_run_date`
// and are a per-run artifact by design - so a page drops out of them the moment
// it stops being planned. In the sister repo the equivalent rewrite silently
// erased injected content, and it was invisible only because the pages were
// frozen.
//
// Here the page-level symptom is absent: the applier iterates plan.specs only,
// so an untouched page is never rewritten, and when a page IS touched the plan
// carries all of its outstanding entries so it cannot regress. That is a
// property of the current code, not a guarantee, and the manifest rewrite would
// hide its loss. So the property is asserted directly and continuously: every
// record id in a page's own `<!-- bhpc-agent-records: ... -->` ledger must still
// have a rendered block on that page. An orphaned ledger id is content that was
// injected, recorded, and then erased.
let ledgersChecked = 0;
const orphanedLedgerIds = [];
{
  const pagePaths = [...new Set(entries.map((e) => String(e.implementation_path || '')).filter(Boolean))];
  for (const rel of pagePaths) {
    const html = pageHtml(rel);
    if (html == null) continue;
    const ledger = html.match(/<!--\s*bhpc-agent-records:\s*([^>]*?)-->/);
    if (!ledger) continue;
    ledgersChecked += 1;
    const ids = ledger[1].split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      if (!html.includes(`data-bhpc-agent-record="${id}"`)) {
        orphanedLedgerIds.push({ path: rel, record_id: id });
      }
    }
  }
  if (orphanedLedgerIds.length) {
    errors.push(
      `${orphanedLedgerIds.length} agent record(s) are named in a page's own ledger but have no rendered block on that page. `
      + 'Content was injected, recorded as done, and then erased - the per-run manifest rewrite would hide exactly this. '
      + `First: ${orphanedLedgerIds.slice(0, 5).map((o) => `${o.path}#${o.record_id}`).join(', ')}`,
    );
  }
}

// Rule 0.
if (runs.length && evaluated === 0) {
  errors.push('no acceptance requirement was evaluated against a page; this validator refuses to pass on an empty loop (Rule 0)');
}

// ------------------------------------------------------------------- report

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  drop_root: DROP_ROOT,
  runs_discovered: runs.length,
  verticals: [...new Set(runs.map((r) => r.vertical))].sort(),
  requirements_evaluated: evaluated,
  outstanding_total: outstandingTotal,
  outstanding_pages: outstandingPages.size,
  carry_limit: CARRY_LIMIT,
  carry_saturated: outstandingPages.size >= CARRY_LIMIT,
  outstanding_unaccounted: outstandingUnaccounted.length,
  page_ledgers_checked: ledgersChecked,
  orphaned_ledger_records: orphanedLedgerIds.length,
  per_run: perRun,
  named_stops: namedStops,
  notes,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[agent-run-absorption-completeness] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 20)) console.error(` - ${e}`);
  process.exit(1);
}
for (const stop of namedStops) console.log(`[agent-run-absorption-completeness] ${stop}`);
console.log(
  `[agent-run-absorption-completeness] PASS: ${runs.length} run(s) across ${report.verticals.length} vertical(s) reconciled against the repository; `
  + `${evaluated} requirement(s) evaluated, ${outstandingTotal} outstanding on ${outstandingPages.size} page(s), carry limit ${CARRY_LIMIT} (not saturated); ${ledgersChecked} page ledger(s) checked with 0 orphaned record(s); ${namedStops.length} named stop(s).`,
);
