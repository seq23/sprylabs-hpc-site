#!/usr/bin/env node
/**
 * An artifact landing must START the process, and a failed run must not END it.
 *
 * THE GAP THIS FILLS.
 *
 * validate_agent_run_absorption_completeness asks the outcome question about
 * runs that were ABSORBED. It is the right question and it is already asked.
 * What nothing asked was the two questions before it:
 *
 *   1. Is anything still WAITING to be absorbed, and for how long?
 *   2. Will anything ever look at it again if the run that should have
 *      absorbed it failed?
 *
 * Reproduced on this tree before this file existed: flipping
 * data/report_fixes/agent_runs/2026-08-29/bhpc/agent_run_manifest.json from
 * ABSORBED back to READY_FOR_ABSORPTION left all three intake validators green
 * - continuity PASS, priority PASS, absorption-completeness PASS. A stranded
 *   artifact was invisible to every guard in the repository.
 *
 * That is precisely how the sister repo lost a run: the artifact landed, the
 * push trigger fired correctly, the release lane ran on that exact commit and
 * FAILED, and the manifest sat at READY_FOR_ABSORPTION from that moment on.
 * Its ledger recorded 110 page fixes against a page with zero changes. A
 * one-shot trigger is not a process; it is a single chance.
 *
 * Also reproduced: deleting the `release:agent-intake:raw` stage from the
 * `full-content-cycle` mode of data/workflows/workflow_topology.json - the only
 * thing that makes the DAILY schedule absorb anything - left
 * validate:workflow-topology, validate:workflow-contract and
 * validate:bhpc-agent-artifact-priority all green. The catch-up path could be
 * removed silently, leaving only the push trigger, which is the sister repo's
 * failure mode by construction.
 *
 * WHAT IT ASSERTS, all HARD_FAIL:
 *
 *  A. Rule 0. Run manifests are discovered by walking the drop root. Zero runs,
 *     or an unreadable drop root, is a validator that examined nothing.
 *
 *  B. The push trigger REACHES the artifacts. The `paths:` filters declared on
 *     the release workflow's push trigger are matched against the manifest
 *     paths actually found on disk. A trigger watching a directory artifacts do
 *     not land in fires never and looks perfectly wired.
 *
 *  C. A catch-up path exists and reaches absorption. The workflow must carry a
 *     `schedule:` cron, and the mode a NON-push run resolves to must contain an
 *     absorption stage in the workflow topology. This is what survives a failed
 *     run: the next scheduled run re-walks every manifest and picks up whatever
 *     is still READY_FOR_ABSORPTION. The push-resolved mode must contain one
 *     too, so the delivering push still starts the process immediately.
 *
 *  D. Nothing is stranded. A manifest may be pending only inside one cadence
 *     cycle plus one cycle of grace, where the cycle length is DERIVED from the
 *     workflow's own cron rather than hardcoded here - so changing the schedule
 *     changes this verdict. Pending longer than that means at least one whole
 *     catch-up run has been and gone without claiming the work. An unrecognised
 *     status fails immediately: absorption cannot reason about it either.
 *
 *  E. A count is not a change - and neither is a floor. This assertion began as
 *     "at least one REQUIRED entry rendered", which a run declaring 61 records
 *     and rendering 1 passes cleanly. Measured the day it was replaced: the
 *     floor reported 946/946 REQUIRED entries reconciled while 77 of them were
 *     not satisfied on the document their own record names, and it could not
 *     see one of them.
 *
 *     Coverage is now per record, using the repository's own acceptance
 *     predicate, evaluated against the READER's document - the file behind
 *     intended_winner_page - and not implementation_path. Those two disagreed
 *     for 57 REQUIRED entries of run 2026-07-18: the absorber wrote to a
 *     root-level twin while the artifact had measured, and the citation points
 *     at, the /insights/ page. Both files exist, both are self-canonical, both
 *     are in sitemap-spry.xml. Every earlier check asked implementation_path
 *     and so reported that work as done; the reader saw nothing.
 *
 *  E2. The outstanding set only shrinks. Whatever is not satisfied must be
 *     NAMED in agent_absorption_reader_coverage_budget.json - a number would
 *     let one fixed record pay for one newly broken one. A new gap fails; a
 *     budgeted id that is now satisfied and still listed fails until it is
 *     removed, so the file cannot become a licence to regress back up to its
 *     own high-water mark.
 *
 *  F. The count is honest. absorbed_record_count must equal the number of
 *     records in the normalized file it names. A ledger number that does not
 *     match the file it describes is not evidence of anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBhpcAcceptance } from '../lib/bhpc_agent_acceptance_satisfaction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DROP_ROOT = 'data/report_fixes/agent_runs';
const MANIFEST_NAME = 'agent_run_manifest.json';
const ACCEPTANCE = 'data/report_fixes/agent_acceptance_manifest.generated.json';
const BUDGET = 'data/report_fixes/agent_absorption_reader_coverage_budget.json';
const WORKFLOW = '.github/workflows/spry-content-release.yml';
const TOPOLOGY = 'data/workflows/workflow_topology.json';
const LANE = 'spry-content-release';
// Absorption is the chain that turns a READY_FOR_ABSORPTION manifest into
// normalized records and acceptance entries. Either spelling is the real thing;
// anything else is a lane that does not absorb.
const ABSORPTION_STAGE = /\brelease:agent-intake(:raw)?\b/;
const OUT = process.env.AGENT_ABSORPTION_TRIGGER_OUT
  || 'artifacts/validation/agent-artifact-absorption-trigger.json';

const errors = [];
const notes = [];

const readText = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
};
const readJson = (rel) => {
  const text = readText(rel);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
};

// --------------------------------------------------------- A. discover runs

/** Every <date>/<vertical>/agent_run_manifest.json on disk. Walked, never
 *  listed, so a new vertical is covered the day it first arrives. */
function discoverRuns() {
  const found = [];
  const dropAbs = path.join(ROOT, DROP_ROOT);
  let dates = [];
  try {
    dates = fs.readdirSync(dropAbs, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    errors.push(`${DROP_ROOT}: unreadable. This is where every external agent artifact lands; with no drop root this validator examined nothing (Rule 0).`);
    return found;
  }
  for (const date of dates) {
    let verticals = [];
    try {
      verticals = fs.readdirSync(path.join(dropAbs, date), { withFileTypes: true })
        .filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch { continue; }
    for (const vertical of verticals) {
      const rel = `${DROP_ROOT}/${date}/${vertical}/${MANIFEST_NAME}`;
      const manifest = readJson(rel);
      if (!manifest) {
        errors.push(`${rel}: no readable ${MANIFEST_NAME}, so this run has no status a trigger could ever act on`);
        continue;
      }
      found.push({ date, vertical, rel, manifest });
    }
  }
  return found;
}

const runs = discoverRuns();
if (!runs.length) {
  errors.push(`${DROP_ROOT}: zero agent run manifests discovered. This validator refuses to pass on an empty drop root (Rule 0).`);
}

// ------------------------------------------------- workflow trigger surface

/**
 * The release workflow's `on:` block, read structurally enough to answer three
 * questions: are there push paths, is there a schedule, and what cron.
 *
 * Deliberately a small indentation-aware reader rather than a YAML dependency:
 * this file must run in the same bare `npm ci --ignore-scripts` environment as
 * every other validator in the profile.
 */
function readTriggers(text) {
  const lines = text.split('\n');
  const onStart = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (onStart < 0) return null;
  let end = lines.length;
  for (let i = onStart + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(onStart + 1, end);
  const pushIdx = block.findIndex((l) => /^ {2}push:\s*$/.test(l));
  const pushPaths = [];
  if (pushIdx >= 0) {
    let inPaths = false;
    for (let i = pushIdx + 1; i < block.length; i += 1) {
      const line = block[i];
      if (/^ {2}\S/.test(line)) break;
      if (/^ {4}paths:\s*$/.test(line)) { inPaths = true; continue; }
      if (/^ {4}\S/.test(line)) { inPaths = false; continue; }
      if (inPaths) {
        const m = line.match(/^ {6}-\s*["']?([^"'\s]+)["']?\s*$/);
        if (m) pushPaths.push(m[1]);
      }
    }
  }
  const crons = [];
  const schedIdx = block.findIndex((l) => /^ {2}schedule:\s*$/.test(l));
  if (schedIdx >= 0) {
    for (let i = schedIdx + 1; i < block.length; i += 1) {
      const line = block[i];
      if (/^ {2}\S/.test(line)) break;
      const m = line.match(/cron:\s*["']([^"']+)["']/);
      if (m) crons.push(m[1]);
    }
  }
  return { hasPush: pushIdx >= 0, pushPaths, crons };
}

/** GitHub Actions path filter globbing, restricted to the forms that appear in
 *  a `paths:` list: `**` across separators, `*` within one segment, `?`. */
function pathFilterMatches(pattern, candidate) {
  let rx = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { rx += '.*'; i += 1; if (pattern[i + 1] === '/') i += 1; } else rx += '[^/]*';
    } else if (c === '?') rx += '[^/]';
    else rx += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${rx}$`).test(candidate);
}

const workflowText = readText(WORKFLOW);
let triggers = null;
if (!workflowText) {
  errors.push(`${WORKFLOW}: unreadable. Nothing else in this repository starts absorption, so with the release workflow gone an artifact landing starts nothing at all.`);
} else {
  triggers = readTriggers(workflowText);
  if (!triggers) errors.push(`${WORKFLOW}: no parsable \`on:\` trigger block, so it is not possible to say what starts this lane`);
}

// ----------------------------------------- B. the push trigger reaches them

if (triggers) {
  if (!triggers.hasPush) {
    errors.push(`${WORKFLOW}: no \`push:\` trigger. An artifact landing must start the process on the commit that delivered it, not only on the next schedule.`);
  } else if (!triggers.pushPaths.length) {
    errors.push(`${WORKFLOW}: the push trigger declares no \`paths:\` filter, so it cannot be shown to be the artifact trigger at all`);
  } else if (runs.length) {
    const unreached = runs.filter((r) => !triggers.pushPaths.some((p) => pathFilterMatches(p, r.rel)));
    if (unreached.length === runs.length) {
      errors.push(
        `${WORKFLOW}: the push trigger watches ${JSON.stringify(triggers.pushPaths)}, and NOT ONE of the ${runs.length} manifest path(s) actually on disk matches it `
        + `(e.g. ${runs.at(-1).rel}). The trigger is wired to a path artifacts do not land in: it will never fire, and it looks correct in review.`,
      );
    } else if (unreached.length) {
      errors.push(
        `${WORKFLOW}: ${unreached.length} of ${runs.length} run manifest(s) on disk are not matched by any push \`paths:\` filter ${JSON.stringify(triggers.pushPaths)}, `
        + `so an artifact landing at that shape starts nothing. First: ${unreached[0].rel}`,
      );
    } else {
      notes.push(`push trigger ${JSON.stringify(triggers.pushPaths)} matches all ${runs.length} manifest path(s) on disk`);
    }
  }
}

// ------------------------------- C. a catch-up path that reaches absorption

const topology = readJson(TOPOLOGY);
const lane = topology?.canonical_lanes?.[LANE];
const stagesByMode = lane?.stages_by_mode || {};
const modeAbsorbs = (mode) => (stagesByMode[mode] || [])
  .some((s) => ABSORPTION_STAGE.test([].concat(s.command || []).join(' ') || String(s.label || '')));

if (!lane) {
  errors.push(`${TOPOLOGY}: no canonical lane \`${LANE}\`, so what a scheduled run actually executes cannot be established`);
} else {
  // The scheduled/catch-up mode. The workflow resolves an empty dispatch input
  // to a fallback, and a schedule supplies no input, so a scheduled run uses
  // the lane's default_mode. Both are read rather than assumed, and they must
  // agree - a workflow falling back to one mode while the topology defaults to
  // another is two components each keeping their own list with no link.
  const catchUpMode = String(lane.default_mode || '');
  if (!catchUpMode) {
    errors.push(`${TOPOLOGY}: lane ${LANE} declares no default_mode, so a scheduled run has no defined stage list`);
  } else {
    if (workflowText && !new RegExp(`RELEASE_MODE="${catchUpMode}"`).test(workflowText)) {
      errors.push(
        `${WORKFLOW}: does not fall back to "${catchUpMode}", which is ${TOPOLOGY}'s default_mode for ${LANE}. `
        + 'The workflow and the topology disagree about what a scheduled run does, so the catch-up path this validator can prove is not the one that runs.',
      );
    }
    if (!modeAbsorbs(catchUpMode)) {
      errors.push(
        `${TOPOLOGY}: the ${LANE}/${catchUpMode} mode - the one a SCHEDULED run executes - contains no absorption stage matching ${ABSORPTION_STAGE}. `
        + 'Without it the only thing that ever absorbs is the push that delivered the artifact, so one failed run strands that artifact permanently. '
        + 'That is exactly how the sister repo lost a run.',
      );
    }
  }

  // The push-resolved mode. The workflow forces it for push events.
  const pushMode = (workflowText?.match(/GITHUB_EVENT_NAME}"\s*=\s*"push"\s*\];\s*then\s+RELEASE_MODE="([^"]+)"/) || [])[1]
    || (workflowText?.match(/if \[ "\$\{GITHUB_EVENT_NAME\}" = "push" \]; then RELEASE_MODE="([^"]+)"/) || [])[1]
    || '';
  if (!pushMode) {
    errors.push(`${WORKFLOW}: the push event does not force a release mode, so an artifact landing runs whatever the default happens to be that day`);
  } else if (!modeAbsorbs(pushMode)) {
    errors.push(
      `${TOPOLOGY}: the ${LANE}/${pushMode} mode - the one a PUSH of an artifact executes - contains no absorption stage matching ${ABSORPTION_STAGE}, `
      + 'so the artifact that triggered the run is not what the run then processes',
    );
  } else {
    notes.push(`push resolves to mode "${pushMode}" and it absorbs`);
  }

  if (triggers && !triggers.crons.length) {
    errors.push(
      `${WORKFLOW}: no \`schedule:\` cron. The push trigger is a single chance: if the run it starts fails, nothing looks at that artifact again. `
      + 'A recurring run is what makes a failed run survivable.',
    );
  }
}

// -------------------------------------------- D. nothing stranded past a cycle

/** Cycle length in days, derived from the workflow's own cron. A daily cron is
 *  a one-day cycle; a weekly cron is seven. Derived, so changing the schedule
 *  changes what counts as stranded. */
function cycleDaysFromCrons(crons) {
  if (!crons.length) return null;
  let best = null;
  for (const cron of crons) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const [, , dom, , dow] = parts;
    let days;
    if (dow !== '*' && dow !== '?') days = dow.includes(',') ? Math.max(1, Math.round(7 / dow.split(',').length)) : 7;
    else if (dom !== '*' && dom !== '?') days = 28;
    else days = 1;
    best = best == null ? days : Math.min(best, days);
  }
  return best;
}

const KNOWN_TERMINAL = new Set(['ABSORBED']);
const KNOWN_PENDING = new Set(['READY_FOR_ABSORPTION']);
const cycleDays = cycleDaysFromCrons(triggers?.crons || []);
// One cycle to be claimed, one more before it is called stranded: a run that
// lands minutes after tonight's schedule has not missed anything yet.
const graceDays = cycleDays == null ? null : cycleDays * 2;
// Deliberately no clock override. An earlier draft took `today` from an env
// var so the window could be proved in both directions, and that knob is the
// one way this guard could be widened until a stranded artifact fits through
// it. Both directions are provable without it: flip a week-old manifest back
// to pending and it fails, drop a manifest dated today and it passes.
const today = new Date().toISOString().slice(0, 10);
const ageDays = (runDate) => Math.floor(
  (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${runDate}T00:00:00Z`)) / 86400000,
);

const pending = [];
for (const run of runs) {
  const status = String(run.manifest.status || '').toUpperCase();
  if (KNOWN_TERMINAL.has(status)) continue;
  if (!KNOWN_PENDING.has(status)) {
    errors.push(
      `${run.rel}: status "${run.manifest.status}" is neither ABSORBED nor READY_FOR_ABSORPTION. `
      + 'The absorber only ever claims READY_FOR_ABSORPTION, so a run in any other state is work no lane will pick up.',
    );
    continue;
  }
  const age = Number.isFinite(ageDays(run.date)) ? ageDays(run.date) : null;
  pending.push({ run: run.rel, run_date: run.date, age_days: age });
  if (graceDays == null) continue;
  if (age != null && age > graceDays) {
    errors.push(
      `${run.rel}: READY_FOR_ABSORPTION for ${age} day(s), and the release cadence is one run every ${cycleDays} day(s). `
      + `At least one whole catch-up run has been and gone without claiming it. Either the run that should have absorbed it failed and nothing retried, `
      + 'or the catch-up lane no longer absorbs. This is the stranded-artifact state, not a slow day.',
    );
  }
}

// ------------------------------------------- E/F. a count is not a change

const acceptance = readJson(ACCEPTANCE);
if (!acceptance) {
  errors.push(`${ACCEPTANCE}: unreadable, so no run's ledger can be reconciled against what the pages actually carry`);
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

/**
 * The document a READER actually lands on for this record.
 *
 * Not implementation_path. implementation_path is where the absorber decided to
 * write; intended_winner_page is the URL the external agent measured, the one
 * the citation points at, and the only one a reader or a crawler ever sees.
 * Reconciled here they were found to disagree for 57 REQUIRED entries of run
 * 2026-07-18: both files exist, both are self-canonical, both are in
 * sitemap-spry.xml, and the fix went live on the twin nobody cites.
 */
function isFile(rel) {
  try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch { return false; }
}
function resolveDocument(candidate) {
  const clean = String(candidate || '').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) return '';
  if (isFile(clean)) return clean;
  if (clean.endsWith('/') && isFile(`${clean}index.html`)) return `${clean}index.html`;
  if (isFile(`${clean}.html`)) return `${clean}.html`;
  if (isFile(`${clean}/index.html`)) return `${clean}/index.html`;
  return '';
}
function readerDocument(entry) {
  let urlPath = '';
  try { urlPath = new URL(String(entry.intended_winner_page || '')).pathname; } catch { urlPath = ''; }
  return resolveDocument(urlPath) || resolveDocument(entry.implementation_path);
}

const perRun = [];
const outstandingForReader = [];
let reconciled = 0;
for (const run of runs) {
  const status = String(run.manifest.status || '').toUpperCase();
  const declared = Number(run.manifest.absorbed_record_count || 0);

  // F. the number must match the file it names.
  let normalizedCount = null;
  if (run.manifest.normalized_path) {
    const normalized = readJson(run.manifest.normalized_path);
    if (!normalized) {
      if (status === 'ABSORBED') {
        errors.push(`${run.rel}: declares normalized_path ${run.manifest.normalized_path} but it is unreadable, so the ${declared} record(s) it claims are unevidenced`);
      }
    } else {
      normalizedCount = Array.isArray(normalized.records) ? normalized.records.length : null;
      if (status === 'ABSORBED' && normalizedCount != null && normalizedCount !== declared) {
        errors.push(
          `${run.rel}: absorbed_record_count=${declared} but ${run.manifest.normalized_path} holds ${normalizedCount} record(s). `
          + 'A ledger number that does not match the file it describes is not evidence that anything was absorbed.',
        );
      }
    }
  }

  // E. required work must be visible on a real page - EVERY entry, not one.
  //
  // This assertion used to be a floor: "at least one REQUIRED entry rendered".
  // A run declaring 61 records could render 1 and pass. Measured on this tree
  // the day the floor was replaced: the floor reported 946/946 reconciled while
  // 77 REQUIRED entries were not satisfied on the document their own record
  // names, and it could not see a single one of them.
  //
  // Coverage is now per record, evaluated with the repository's own acceptance
  // predicate, against the READER's document rather than implementation_path -
  // see readerDocument(). Anything outstanding must be NAMED in the budget file
  // and the budget only shrinks.
  const required = entries.filter((e) => String(e.run_date || '') === run.date
    && String(e.scope || 'bhpc') === run.vertical
    && e.acceptance_status === 'REQUIRED');
  let satisfiedForReader = 0;
  for (const entry of required) {
    reconciled += 1;
    const id = String(entry.record_id || entry.id || '');
    const doc = readerDocument(entry);
    const html = doc ? pageHtml(doc) : null;
    const verdict = html == null
      ? { satisfied: false, reasons: ['reader_document_missing'] }
      : evaluateBhpcAcceptance(entry, html);
    if (verdict.satisfied) { satisfiedForReader += 1; continue; }
    outstandingForReader.push({
      record_id: id,
      run_date: run.date,
      reader_document: doc,
      implementation_path: String(entry.implementation_path || ''),
      reasons: verdict.reasons.join(','),
    });
  }
  if (status === 'ABSORBED' && declared > 0 && required.length > 0 && satisfiedForReader === 0) {
    errors.push(
      `${run.rel}: declares ${declared} absorbed record(s) and ${required.length} REQUIRED acceptance entry(ies), yet NOT ONE of them is satisfied on the page a reader reaches. `
      + 'The ledger records fixes the repository does not contain. A count is not a change, and every plumbing validator passes on this.',
    );
  }

  perRun.push({
    run_date: run.date,
    vertical: run.vertical,
    status,
    declared_records: declared,
    normalized_records: normalizedCount,
    required_entries: required.length,
    satisfied_for_reader: satisfiedForReader,
    outstanding_for_reader: required.length - satisfiedForReader,
  });
}

// Rule 0 again, on the reconciliation loop specifically: a manifest that
// silently emptied would otherwise leave every assertion above vacuous.
if (runs.length && entries.length && reconciled === 0) {
  errors.push('no REQUIRED acceptance entry was reconciled against a page; this validator refuses to pass on an empty loop (Rule 0)');
}

// ------------------------------------- E2. the outstanding set only shrinks
//
// A tolerance expressed as a NUMBER is a hole: swap one fixed record for one
// newly broken one and the count is unchanged. So the budget names every id.
// Two directions are asserted, both HARD_FAIL:
//
//   - an outstanding id NOT in the budget is a NEW gap, and fails immediately;
//   - a budgeted id that is now satisfied and still listed is a STALE budget,
//     and fails until it is removed. Without this the file would silently
//     become a licence to regress back up to its own high-water mark.
//
// So the file can only ever get shorter, and every line in it is a specific
// named piece of work a human can read - not an opaque allowance.
const budget = readJson(BUDGET);
const outstandingIds = new Set(outstandingForReader.map((o) => o.record_id));
let budgetedIds = new Set();
if (!budget) {
  errors.push(
    `${BUDGET}: unreadable. It is the named, shrinking list of REQUIRED entries known not to be satisfied on the reader's document. `
    + 'Without it there is no way to tell a known gap from a new one, and this check would have to tolerate everything.',
  );
} else {
  budgetedIds = new Set((budget.outstanding || []).map((o) => String(o.record_id)));
  if (!budgetedIds.size && outstandingIds.size) {
    errors.push(`${BUDGET}: declares an empty outstanding list while ${outstandingIds.size} REQUIRED entry(ies) are unsatisfied`);
  }
  const appeared = [...outstandingIds].filter((id) => !budgetedIds.has(id));
  if (appeared.length) {
    const detail = outstandingForReader.filter((o) => appeared.includes(o.record_id)).slice(0, 5)
      .map((o) => `${o.record_id} at ${o.reader_document || '(no document)'} [${o.reasons}]`).join('; ');
    errors.push(
      `${appeared.length} REQUIRED acceptance entry(ies) are not satisfied on the page a reader reaches, and are NOT named in ${BUDGET}. `
      + `These are new gaps: the artifact asked for a change, the ledger recorded it, and the reader at the cited URL does not see it. First: ${detail}`,
    );
  }
  const fixed = [...budgetedIds].filter((id) => !outstandingIds.has(id));
  if (fixed.length) {
    errors.push(
      `${BUDGET} lists ${fixed.length} record id(s) as outstanding that are now satisfied. The budget only ever shrinks: remove them, or it becomes `
      + `a licence to regress back to its own high-water mark. First: ${fixed.slice(0, 5).join(', ')}`,
    );
  }
}

// --------------------------------------------------------------- report

const report = {
  schema_version: '1.0',
  validator: 'agent-artifact-absorption-trigger',
  status: errors.length ? 'FAIL' : 'PASS',
  drop_root: DROP_ROOT,
  runs_discovered: runs.length,
  push_paths: triggers?.pushPaths || [],
  schedule_crons: triggers?.crons || [],
  cycle_days: cycleDays,
  stranded_after_days: graceDays,
  catch_up_mode: lane?.default_mode || null,
  catch_up_mode_absorbs: lane?.default_mode ? modeAbsorbs(String(lane.default_mode)) : null,
  pending_runs: pending,
  requirements_reconciled: reconciled,
  required_entries_total: reconciled,
  satisfied_for_reader: reconciled - outstandingForReader.length,
  outstanding_for_reader: outstandingForReader.length,
  outstanding_budgeted: budgetedIds.size,
  outstanding_records: outstandingForReader,
  per_run: perRun,
  notes,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[agent-artifact-absorption-trigger] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 20)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `[agent-artifact-absorption-trigger] PASS: ${runs.length} run(s); push paths ${JSON.stringify(report.push_paths)} match every manifest on disk; `
  + `catch-up mode "${report.catch_up_mode}" absorbs on a ${cycleDays}-day cadence (stranded past ${graceDays}d); `
  + `${pending.length} pending run(s); ${reconciled - outstandingForReader.length}/${reconciled} REQUIRED entry(ies) satisfied on the reader's own document, `
  + `${outstandingForReader.length} outstanding and every one of them named in ${BUDGET}.`,
);
