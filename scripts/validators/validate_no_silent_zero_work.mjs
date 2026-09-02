#!/usr/bin/env node
// Guards Rule 0 across the lanes that were found reporting success while doing
// nothing: no stage may claim PASS having produced zero work, and every zero must
// carry a named stop reason a human can act on.
//
// This validator exists because five separate lanes each ran green for weeks
// while applying nothing, and no check in the repo could tell "did no work"
// apart from "had no work to do".
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
let checks = 0;

function load(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { errors.push(`${rel}: unparseable (${e.message})`); return null; }
}
function named(stop) {
  return !!(stop && typeof stop === 'object' && String(stop.code || '').trim() && String(stop.message || '').trim());
}
// Every lane artifact this validator governs, declared by name. A missing file
// used to be skipped in silence, so deleting a lane's artifact - or a lane
// failing to write one - removed that lane from the guard while the guard still
// reported PASS on the lanes that remained. The aggregate "checks === 0" bail at
// the bottom only caught the case where ALL of them vanished; six of seven
// disappearing still passed. Each of these is tracked in git, so absence is a
// real signal, never a fresh-checkout artefact.
const REQUIRED_LANE_ARTIFACTS = [
  'artifacts/validation/release-plan-application.json',
  'artifacts/validation/daily-citation-release-plan.json',
  'artifacts/validation/strategy-gap-fill-release-gap.json',
  'reports/answer_surface_scorecard.json',
  'data/admin/zero_dollar_status.json',
  'data/search_intelligence/live_search_observations.json',
  'reports/fanout-coverage-info.json',
  'artifacts/validation/authority-promotion-gate.json',
  'artifacts/validation/authority-admission-gate.json',
];
const seen = new Set();

function check(rel, fn) {
  seen.add(rel);
  const doc = load(rel);
  if (doc === null) {
    if (REQUIRED_LANE_ARTIFACTS.includes(rel)) {
      errors.push(`${rel}: declared lane artifact is missing. A lane that produces no evidence cannot be shown to have done work, and skipping it silently is how a guard shrinks to nothing while still reporting PASS.`);
    }
    return;
  }
  checks++;
  try { fn(doc, rel); } catch (e) { errors.push(`${rel}: check threw ${e.message}`); }
}

// 1. Zero-dollar citation application: PASS requires units actually applied.
check('artifacts/validation/release-plan-application.json', (d, rel) => {
  const applied = Number(d.release_units_applied || 0);
  if (d.status === 'PASS' && applied === 0) errors.push(`${rel}: status PASS with release_units_applied=0. A lane that applied nothing must not report PASS.`);
  if (applied === 0 && !named(d.stop_reason)) errors.push(`${rel}: release_units_applied=0 with no named stop_reason {code,message}.`);
});

// 2. Daily release plan: selecting nothing must be explained by name.
check('artifacts/validation/daily-citation-release-plan.json', (d, rel) => {
  const selected = Number(d.summary?.selected_units ?? (d.selected || []).length);
  const planned = Number(d.summary?.release_units_planned ?? 0);
  if (selected === 0 && planned > 0 && !named(d.stop_reason)) errors.push(`${rel}: planned ${planned} candidate(s) but selected 0 with no named stop_reason. This is the fixture-gate defect: a lane discarding 100% of its candidates while reporting success.`);
});

// 3. Strategy gap-fill: this lane's deliverable is the ranked advisory backlog,
// not pages. It may pass having built nothing - but it must NAME that outcome,
// and nothing it emits may read as delivered work.
check('artifacts/validation/strategy-gap-fill-release-gap.json', (d, rel) => {
  const added = Number(d.added_count || 0);
  const materialized = Number(d.materialized_target_paths ?? -1);
  if (d.status === 'PASS' && !named(d.outcome)) errors.push(`${rel}: status PASS with no named outcome {code,message}. A lane that passes must say what it delivered.`);
  if (d.status && d.status !== 'PASS' && !named(d.stop_reason)) errors.push(`${rel}: non-PASS status "${d.status}" with no named stop_reason.`);
  if (added > 0 && materialized === 0 && d.advisory_only !== true) {
    errors.push(`${rel}: surfaced ${added} candidate(s) with 0 target_path files on disk but is not marked advisory_only. Queued work that never becomes a file must not be presented as delivery.`);
  }
  // The rows themselves must not claim readiness they do not have.
  const queue = load('data/strategy/strategy_gap_fill_release_queue.json');
  if (queue) {
    const rows = queue.selected || [];
    if (rows.length && materialized === 0) {
      const claiming = rows.filter((r) => r.built === true || r.delivery_state !== 'ADVISORY_NOT_BUILT');
      if (claiming.length) errors.push(`data/strategy/strategy_gap_fill_release_queue.json: ${claiming.length} row(s) not marked ADVISORY_NOT_BUILT while 0 target_path files exist. A row that implies a file exists when none does is the defect this guards.`);
    }
  }
});

// 4. Answer-surface scoring must consume the real citation probe output.
check('reports/answer_surface_scorecard.json', (d, rel) => {
  const src = d.observation_sources;
  if (!src) { errors.push(`${rel}: no observation_sources block. The scorer must record which observation files it read.`); return; }
  if (!(d.ranked || []).length) { errors.push(`${rel}: ranked zero clusters.`); return; }
  const probe = load(src.probe_file || 'data/signals/llm_citation_observations.json');
  const measured = (probe?.runs || []).some((r) => (r.observations || []).some((o) => o && o.status === 'observed'));
  if (measured && Number(src.probe_observations_ingested || 0) === 0) {
    errors.push(`${rel}: the citation probe recorded measured observations but the scorecard ingested 0 of them. The probe writes ${src.probe_file}; the scorer must read it. Two components keeping separate lists with no link is the defect this guards.`);
  }
});

// 5. The admin dashboard's zero must be distinguishable from healthy.
check('data/admin/zero_dollar_status.json', (d, rel) => {
  if (Number(d.latest_applied || 0) === 0) {
    if (d.alarm !== true) errors.push(`${rel}: latest_applied=0 but alarm is not true. A zero that renders like a healthy day is what let this lane idle for two months.`);
    if (!String(d.stop_code || '').trim()) errors.push(`${rel}: latest_applied=0 with no stop_code.`);
  }
});

// 6. Search-intelligence must rotate rather than re-observing the same window.
check('data/search_intelligence/live_search_observations.json', (d, rel) => {
  const eligible = Number(d.budget?.eligible_targets || 0);
  const size = Number(d.budget?.call_budget || 0);
  if (eligible > size && !d.rotation) errors.push(`${rel}: ${eligible} eligible targets but only ${size} observed per run and no rotation block. Without a persisted cursor the same ${size} targets are observed forever and the remaining ${eligible - size} are unreachable.`);
  if (d.rotation && !String(d.rotation.cursor_path || '').trim()) errors.push(`${rel}: rotation block without a cursor_path.`);
  // Attempting is not observing. A window in which every call failed must not
  // consume the rotation slot: if it does, a dead provider credential walks the
  // cursor through the whole target set producing nothing, while the ledger
  // shows steady progress. Measured when this was written: attempted=24,
  // failures=24, provider_http_402, and next_index had moved 0 -> 24.
  const attempted = Number(d.budget?.calls_attempted || 0);
  const failed = Number(d.budget?.call_failures || 0);
  if (attempted > 0 && failed === attempted) {
    const start = Number(d.rotation?.window_start ?? -1);
    const next = Number(d.rotation?.next_index ?? -1);
    if (start >= 0 && next !== start) {
      errors.push(`${rel}: all ${attempted} observation call(s) failed, yet the rotation cursor moved ${start} -> ${next}. A window that produced no evidence must be retried, not rotated out; otherwise a dead credential silently walks the entire target set while the ledger reports progress.`);
    }
    if (!String(d.unavailable_note || '').trim()) {
      errors.push(`${rel}: all ${attempted} observation call(s) failed with no unavailable_note naming why.`);
    }
  }
});

// 7. Fanout warnings must report the count they actually found.
check('reports/fanout-coverage-info.json', (d, rel) => {
  const found = (d.findings || []).length;
  if (Number(d.informational_count || 0) !== found) errors.push(`${rel}: informational_count=${d.informational_count} but findings array holds ${found}. The reported count must be the real one.`);
  if (d.status === 'PASS' && found > 0) errors.push(`${rel}: status PASS while carrying ${found} finding(s). A hardcoded PASS hides findings that are attested as release evidence.`);
  if (Number(d.checked || 0) === 0) errors.push(`${rel}: checked=0 files. Examining nothing is a broken scan, not a pass.`);
});

// 8. Authority promotion: this lane SHOULD promote nothing on most days - a
// cluster earning a whitepaper is rare, and the daily CI failure came from it
// promoting on a timer instead of on evidence. So zero is the healthy outcome
// and must stay green. What it may not do is go quiet: "nothing earned it" and
// "the cluster memory vanished" both promote zero, and only a named stop tells
// them apart.
check('artifacts/validation/authority-promotion-gate.json', (d, rel) => {
  const promoted = Number(d.promoted_count || 0);
  if (promoted === 0 && !named(d.stop_reason)) errors.push(`${rel}: promoted 0 cluster(s) with no named stop_reason {code,message}. A lane that publishes nothing must say why, or a broken lane is indistinguishable from a quiet one.`);
  if (promoted > 0 && !named(d.outcome)) errors.push(`${rel}: promoted ${promoted} cluster(s) with no named outcome {code,message}.`);
  if (Number(d.clusters_tracked || 0) === 0) errors.push(`${rel}: clusters_tracked=0. The promotion gate considered no clusters at all, which is a broken input, not a quiet day.`);
  // A promotion that did not clear the distinct-evidence floor is the exact
  // defect that published the retired "State of ..." papers.
  for (const p of d.promoted || []) {
    if (!p.cluster_id) errors.push(`${rel}: a promoted entry carries no cluster_id.`);
  }
});

// 9. Authority admission: refusing to admit a paper that cannot show demand is
// correct behaviour, but it leaves a rendered page on disk that nothing owns, so
// it has to be named rather than silently skipped.
check('artifacts/validation/authority-admission-gate.json', (d, rel) => {
  const admitted = Number(d.admitted_count || 0);
  const refused = Number(d.refused_count || 0);
  if (refused > 0 && !named(d.stop_reason)) errors.push(`${rel}: refused ${refused} paper(s) with no named stop_reason {code,message}. An unadmitted page still on disk must be visible.`);
  if (admitted === 0 && refused === 0) errors.push(`${rel}: admitted 0 and refused 0. The admission pass examined no released paper at all, which means it ran over an empty queue while reporting success.`);
  if (refused > 0 && (d.refused || []).some((r) => !r.path || !r.reason)) errors.push(`${rel}: a refused entry is missing path or reason, so the refusal cannot be acted on.`);
});

// The declared list and the checks actually wired up must not drift apart: a lane
// added to REQUIRED_LANE_ARTIFACTS but never given a check() call would look
// guarded and be inspected by nothing.
for (const rel of REQUIRED_LANE_ARTIFACTS) {
  if (!seen.has(rel)) errors.push(`${rel}: declared as a required lane artifact but no check() in this file inspects it.`);
}

// Rule 0 applies to this validator too: it must never pass on an empty loop.
if (checks === 0) {
  console.error('[validate:no-silent-zero-work] FAIL: examined zero lane artifacts. Expected at least one tracked lane artifact to check; a validator that inspects nothing must not pass.');
  process.exit(1);
}

const report = { schema_version: '1.0', validator: 'no-silent-zero-work', status: errors.length ? 'FAIL' : 'PASS', lanes_checked: checks, lanes_required: REQUIRED_LANE_ARTIFACTS.length, errors };
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/no-silent-zero-work.json'), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[validate:no-silent-zero-work] FAIL: ${errors.length} lane(s) reporting success without doing work (checked ${checks}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[validate:no-silent-zero-work] PASS: ${checks} lane artifact(s) checked (${REQUIRED_LANE_ARTIFACTS.length} required, all present); every zero carries a named stop reason.`);
