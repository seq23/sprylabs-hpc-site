#!/usr/bin/env node
/**
 * Guard the citation signal that feeds competition_opportunity, a DECLARED
 * scoring input with a weight in data/scoring/weights.json.
 *
 * (1) THE JOIN. scripts/scoring/score_cluster.js looked the signal up on
 *     `item.query`. A cluster record has no scalar `query` - it carries a nested
 *     `queries[]`, which is how scripts/intake/build_backlog.js has always read
 *     it. So the lookup key was the empty string for all 120 clusters, every one
 *     recorded "this query has not been probed", and 83 real grounded
 *     observations went unused. The engine then correctly dropped the component
 *     and redistributed its weight - a correct fallback that made a 100% failure
 *     look exactly like normal operation.
 *
 * (2) BLUE-OCEAN CONFLATION. A grounded answer that "cited nobody of ours" was
 *     awarded the maximum competition_opportunity of 90 with no relevance check.
 *     The probe's own list carries brand and competitor monitoring rows -
 *     "sprylabs", "spry reddit", "compare humantelligence" - and
 *     "phone vortex meaning", which returned dictionary sites. "Not cited" is
 *     not "open ground".
 *
 * (3) THE DISCLOSURE. Fixing the key exposed a condition the key was hiding: the
 *     probe reads a 25-row brand/competitor list and the scorer scores 9,179
 *     cluster queries, and the two populations do not intersect at all. The
 *     component therefore cannot be measured however the join is written. That
 *     is a decision about what to probe and what it should cost, not a code
 *     change - so it must be stated in the output, every run, and nothing may
 *     quietly present the component as measured.
 *
 * Hard-fails if it examines zero clusters.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const readText = (p) => { if (!fs.existsSync(p)) { fail(`missing ${p}`); return ''; } return fs.readFileSync(p, 'utf8'); };
const readJson = (p) => { try { return JSON.parse(readText(p)); } catch (e) { fail(`unreadable JSON: ${p} (${e.message})`); return null; } };

const ENGINE = 'scripts/scoring/score_cluster.js';
const SCORES = 'data/intake/query_scores.json';
const CLUSTERS = 'data/intake/query_clusters.json';

const src = readText(ENGINE);

// ------------------------------------------------------------------ (1) the join
if (/normalizeQuery\(item\.query \|\| item\.title/.test(src)) {
  fail(`${ENGINE} is keying the citation lookup on item.query again. A cluster has no scalar query, so this looks up the empty string for every cluster and reports every one as unprobed while real observations sit unused.`);
}
// Extract a function's body by brace matching. A non-greedy regex stops at the
// first inner `}` and so never sees the lines that matter - which is exactly how
// the first version of this validator passed a deliberately broken engine.
function bodyOf(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) return '';
  const open = text.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (!depth) return text.slice(open, i + 1); }
  }
  return '';
}
const coFn = bodyOf(src, 'function competitionOpportunityFor');
if (!coFn) fail(`${ENGINE}: competitionOpportunityFor not found.`);
if (!/function queriesForItem/.test(src)) {
  fail(`${ENGINE} no longer defines queriesForItem, so the nested queries[] a cluster actually carries is not being read.`);
}
if (coFn && !/queriesForItem\(item\)/.test(coFn)) {
  fail(`${ENGINE}: competitionOpportunityFor no longer resolves the cluster's queries through queriesForItem. It is looking the citation signal up on a field the cluster does not have, which reports every cluster as unprobed while real observations sit unused.`);
}

// ------------------------------------------------------- (2) the blue-ocean gate
if (!/blueOceanEligibility/.test(src) || !/BRAND_OR_PERSON_NAME_NAVIGATIONAL/.test(src)) {
  fail(`${ENGINE} has lost the blue-ocean gate. "Cited nobody of ours" would again be awarded the maximum competition_opportunity with no check that the query describes ground this property can contest.`);
}
// Asserting that the gate is CALLED proves nothing - a stubbed call still reads
// as a call, and there is a second call on the refusal path that keeps any text
// match green. So the gate is tested by behaviour instead: feed the scorer a
// cluster whose only probed query is navigational and confirm it is not handed
// the maximum opportunity.

// Functional proof, not just a text match: the gate must actually refuse the
// real queries that made this a defect.
let engine = null;
try { engine = require_(`${process.cwd()}/${ENGINE}`); } catch (e) { fail(`${ENGINE} does not load: ${e.message}`); }
if (engine && typeof engine.blueOceanEligibility === 'function') {
  const mustRefuse = ['sprylabs', 'spry reddit', 'aplayermode', 'billionairehighperformancecoach'];
  for (const q of mustRefuse) {
    const g = engine.blueOceanEligibility(q);
    if (!g || g.eligible) fail(`the blue-ocean gate accepts the navigational query "${q}". Whoever the engine cited for this property's own name is not competitive ground.`);
  }
  const mustAccept = ['ai coach for founders and consultants', 'executive coach vs traditional coaching for entrepreneurs'];
  for (const q of mustAccept) {
    const g = engine.blueOceanEligibility(q);
    if (!g || !g.eligible) fail(`the blue-ocean gate refuses the legitimate query "${q}" (${g && g.reason}). It has been tightened into a filter that rejects this property's real ground.`);
  }
} else if (engine) {
  fail(`${ENGINE} no longer exports blueOceanEligibility, so the gate cannot be tested from outside.`);
}

if (engine && typeof engine.competitionOpportunityFor === 'function') {
  const at = '2026-01-01T00:00:00.000Z';
  const navSignal = new Map([['sprylabs', { self_cited: false, observed_at: at }]]);
  const nav = engine.competitionOpportunityFor({ id: 'nav-probe', queries: [{ query: 'sprylabs' }] }, navSignal);
  if (nav && nav.value === 90) {
    fail(`${ENGINE}: a cluster whose only probed query is the navigational "sprylabs" was scored the maximum competition_opportunity of 90. "Not cited" is being read as "open ground" again.`);
  }
  const realSignal = new Map([['ai coach for founders and consultants', { self_cited: false, observed_at: at }]]);
  const real = engine.competitionOpportunityFor({ id: 'real-probe', queries: [{ query: 'ai coach for founders and consultants' }] }, realSignal);
  if (!real || real.value !== 90) {
    fail(`${ENGINE}: a genuinely open, anchored query scored ${real && real.value} instead of 90. The gate has been tightened into a filter that refuses this property's real ground.`);
  }
  const heldSignal = new Map([['ai coach for founders and consultants', { self_cited: true, observed_at: at }]]);
  const held = engine.competitionOpportunityFor({ id: 'held-probe', queries: [{ query: 'ai coach for founders and consultants' }] }, heldSignal);
  if (!held || held.value !== 30) {
    fail(`${ENGINE}: a query where the engine already cited one of our pages scored ${held && held.value} instead of 30. A position we hold is being reported as an opening.`);
  }
  const unprobed = engine.competitionOpportunityFor({ id: 'unprobed', queries: [{ query: 'something nobody probed' }] }, realSignal);
  if (!unprobed || unprobed.value !== null) {
    fail(`${ENGINE}: an unprobed query returned ${unprobed && unprobed.value} instead of null. An unmeasured component must never be given a number.`);
  }
} else if (engine) {
  fail(`${ENGINE} no longer exports competitionOpportunityFor, so the scoring behaviour cannot be tested from outside.`);
}

// ------------------------------------------------------------ (3) the disclosure
const scores = readJson(SCORES);
const items = (scores && Array.isArray(scores.items)) ? scores.items : [];
if (!items.length) fail(`${SCORES} holds zero scored clusters - this validator examined nothing and must not pass on an empty loop.`);

const cov = scores && scores.competition_opportunity_coverage;
if (!cov) {
  fail(`${SCORES} carries no competition_opportunity_coverage block. competition_opportunity is a weighted, declared scoring input; without this block a run in which it measured nothing at all is indistinguishable from one in which it worked.`);
} else {
  // Recompute independently. A disclosure that reports a number nobody checks is
  // the same silent failure in a new costume.
  const measured = items.filter((i) => i.breakdown && i.breakdown.competition_opportunity !== null && i.breakdown.competition_opportunity !== undefined).length;
  if (cov.clusters_with_a_measured_reading !== measured) {
    fail(`competition_opportunity_coverage claims ${cov.clusters_with_a_measured_reading} clusters with a measured reading; independently counting the items gives ${measured}.`);
  }
  if (cov.scored_clusters !== items.length) {
    fail(`competition_opportunity_coverage claims ${cov.scored_clusters} scored clusters; ${SCORES} holds ${items.length}.`);
  }
  const expected = measured > 0 ? 'MEASURED' : 'NEVER_MEASURABLE_AS_WIRED';
  if (cov.status !== expected) {
    fail(`competition_opportunity_coverage.status is "${cov.status}" but ${measured} of ${items.length} clusters carry a measured reading, so it should be "${expected}".`);
  }
  // Refusing to pass on an empty loop, on either side of the join.
  if (!cov.distinct_cluster_queries) fail('the scored population holds zero queries - refusing to conclude anything about overlap from an empty set.');
  if (!cov.distinct_probe_source_queries) fail(`the probe's query source ${cov.probe_query_source} holds zero queries - refusing to conclude anything about overlap from an empty set.`);

  // THE RULE. A weighted scoring input whose measurement source cannot intersect
  // the population it scores is a number deciding page priority while resting on
  // nothing. Previously this was a NOTE printed inside a PASS, which is invisible
  // - it survived until someone happened to read a CI log. It is now a failure
  // whenever the component is switched on.
  const live = Number(cov.declared_weight || 0) > 0;
  const intersects = Number(cov.probe_source_queries_that_are_cluster_queries || 0) > 0;
  if (live && !intersects) {
    fail(`competition_opportunity carries weight ${cov.declared_weight} but CANNOT BE MEASURED: 0 of the ${cov.distinct_probe_source_queries} queries in ${cov.probe_query_source} is among the ${cov.distinct_cluster_queries} cluster queries being scored. A weighted input that can never be measured must not quietly redistribute - either give the probe a source that intersects the scored population, or set the weight to 0 with the reason recorded in data/scoring/weights.json.`);
  }
  if (!live && intersects) {
    notes.push(`competition_opportunity is switched off (weight 0) although its probe source now intersects the scored population in ${cov.probe_source_queries_that_are_cluster_queries} quer${cov.probe_source_queries_that_are_cluster_queries === 1 ? 'y' : 'ies'}. It can be switched back on.`);
  }
  if (!live) {
    const weights = readJson('data/scoring/weights.json') || {};
    if (!weights._competition_opportunity_note) {
      fail('competition_opportunity is switched off in data/scoring/weights.json with no _competition_opportunity_note recording why. A component turned off silently is indistinguishable from one turned off by accident.');
    }
    // A weight of 0 must survive the read. `weights.x || default` springs a
    // deliberate zero back to the default, which is how switching a component
    // off does nothing and says nothing.
    if (/weights\.competition_opportunity \|\|/.test(src)) {
      fail(`${ENGINE} reads the competition weight with \`||\`, so a deliberately declared weight of 0 falls back to the default and the component is silently still live.`);
    }
    notes.push(`competition_opportunity is SWITCHED OFF: ${cov.why}`);
  }
}

// ------------------------------------------------ every item must be honest
const clusterDoc = readJson(CLUSTERS);
const clusters = Array.isArray(clusterDoc) ? clusterDoc : ((clusterDoc && clusterDoc.clusters) || []);
if (!clusters.length) fail(`${CLUSTERS} holds zero clusters - refusing to pass on an empty loop.`);
if (clusters.length !== items.length) {
  fail(`${CLUSTERS} holds ${clusters.length} clusters but ${SCORES} holds ${items.length} scored items, so the scores do not describe the clusters.`);
}

let examined = 0;
let emptyQuery = 0;
for (const i of items) {
  if (!i || !i.breakdown) { fail('scored item with no breakdown'); continue; }
  examined++;
  if (!String(i.query || '').trim()) emptyQuery++;
  const v = i.breakdown.competition_opportunity;
  if (v !== null && v !== undefined && !i.breakdown.competition_opportunity_basis) {
    fail(`item "${i.id}" carries a competition_opportunity of ${v} with no basis, so the number cannot be traced to an observation.`);
  }
  if ((v === null || v === undefined) && !i.breakdown.competition_opportunity_basis) {
    fail(`item "${i.id}" has no competition reading and does not say why, which reads as a measurement of nothing.`);
  }
}
if (examined === 0) fail('examined zero scored items - refusing to pass on an empty loop.');
// The join bug's fingerprint: every scored item carrying an empty query string.
if (emptyQuery === examined && examined > 0) {
  fail(`all ${examined} scored items carry an empty query string, which is the exact fingerprint of the cluster join reading a field the cluster does not have.`);
}

// ------------------------------------------------------------------- evidence
// Written on every run, pass or fail, so the gate's behaviour is inspectable
// without re-running the validator. The refusal case is the negative fixture:
// it records an actual navigational query being denied the maximum score.
const gateProbe = (engine && typeof engine.competitionOpportunityFor === 'function')
  ? (() => {
      const at = '2026-01-01T00:00:00.000Z';
      const call = (q, self_cited) => engine.competitionOpportunityFor(
        { id: 'gate-probe', queries: [{ query: q }] },
        new Map([[String(q).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), { self_cited, observed_at: at }]])
      );
      return {
        navigational_refused: call('sprylabs', false),
        anchored_open: call('ai coach for founders and consultants', false),
        already_held: call('ai coach for founders and consultants', true),
      };
    })()
  : null;
fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/citation-signal-join.json', JSON.stringify({
  checked_at: new Date().toISOString(),
  status: problems.length ? 'FAIL' : 'PASS',
  scored_clusters: examined,
  clusters: clusters.length,
  coverage: cov || null,
  errors: problems,
  notes,
}, null, 2) + '\n');
fs.writeFileSync('artifacts/validation/citation-signal-join-gate.json', JSON.stringify({
  checked_at: new Date().toISOString(),
  what_this_proves: 'A navigational query that a grounded answer engine did not cite us for is NOT scored as open ground. "Not cited" is not "open ground".',
  probe: gateProbe,
}, null, 2) + '\n');

// --------------------------------------------------------------------- verdict
if (problems.length) {
  console.error('CITATION SIGNAL JOIN CONTRACT FAIL:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`CITATION SIGNAL JOIN CONTRACT PASS: ${examined} scored clusters examined against ${clusters.length} clusters; join reads nested queries[]; blue-ocean gate refuses navigational queries and accepts real ones; coverage disclosed and independently verified.`);
for (const n of notes) console.log(`  NOTE: ${n}`);
