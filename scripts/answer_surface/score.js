#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const dir = path.join(ROOT, 'data/answer_surface_monitoring');
const reports = path.join(ROOT, 'reports');
fs.mkdirSync(reports, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }

// The answer-surface scorer used to read observations ONLY from
// data/answer_surface_monitoring/observations.manual.json - a file no script in
// this repo has ever written (the runbook asks a human to hand-copy it). The
// real measurement lives in data/signals/llm_citation_observations.json, written
// by scripts/llm_citation_probe.mjs. Two components, two lists, no link: every
// cluster scored 0/not_observed forever while the probe was recording answers.
// This joins the probe output into the scorer.
const PROBE_OBSERVATIONS = 'data/signals/llm_citation_observations.json';

const candidates = readJson(path.join(dir, 'observation_candidates.json'), { observations: [] }).observations || [];
const manual = readJson(path.join(dir, 'observations.manual.json'), { observations: [] }).observations || [];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'for', 'and', 'or', 'of', 'to', 'in', 'on', 'with', 'vs', 'best', 'how', 'what', 'my', 'is', 'are']);
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t)));

// Cluster vocabulary: every known cluster plus the words that identify it.
const clusterVocab = new Map();
function addVocab(cluster, text) {
  if (!cluster) return;
  if (!clusterVocab.has(cluster)) clusterVocab.set(cluster, new Set());
  for (const t of tokens(text)) clusterVocab.get(cluster).add(t);
}
for (const c of readJson(path.join(ROOT, 'content/insights/_clusters.json'), [])) {
  addVocab(c.id || c.slug, `${c.name || ''} ${c.id || ''} ${c.description || ''}`);
}
for (const obs of candidates) addVocab(obs.cluster, `${obs.cluster} ${obs.query}`);

const byExactQuery = new Map();
for (const obs of candidates) if (typeof obs.query === 'string') byExactQuery.set(norm(obs.query), obs.cluster);

function clusterForQuery(query) {
  const exact = byExactQuery.get(norm(query));
  if (exact) return { cluster: exact, basis: 'exact_query' };
  const qt = tokens(query);
  let best = null, bestScore = 0;
  for (const [cluster, vocab] of clusterVocab) {
    let overlap = 0;
    for (const t of qt) if (vocab.has(t)) overlap++;
    if (overlap > bestScore) { bestScore = overlap; best = cluster; }
  }
  if (best && bestScore >= 1) return { cluster: best, basis: 'token_overlap' };
  return { cluster: 'unmapped-probe-queries', basis: 'unmapped' };
}

// Latest probe observation wins, per query+engine.
const probeDoc = readJson(path.join(ROOT, PROBE_OBSERVATIONS), { runs: [] });
const probeRuns = Array.isArray(probeDoc.runs) ? probeDoc.runs : [];
const probeLatest = new Map();
for (const run of probeRuns) {
  for (const obs of run.observations || []) {
    if (!obs || typeof obs.query !== 'string') continue;
    const key = `${norm(obs.query)}::${obs.engine || ''}`;
    const prevAt = probeLatest.get(key)?.observed_at || '';
    if (String(obs.observed_at || run.run_at || '') >= prevAt) probeLatest.set(key, { ...obs, observed_at: obs.observed_at || run.run_at });
  }
}

let probeIngested = 0, probeUnmapped = 0, probeAnswered = 0;
const probeObservations = [];
for (const obs of probeLatest.values()) {
  if (obs.status !== 'observed') continue;
  const { cluster, basis } = clusterForQuery(obs.query);
  if (basis === 'unmapped') probeUnmapped++;
  probeIngested++;
  probeAnswered++;
  // Feed the scorer the domains the provider actually cited, in the field it reads.
  probeObservations.push({
    id: `probe:${norm(obs.query)}:${obs.engine || 'unknown'}`,
    vertical: 'bhpc',
    cluster,
    query: obs.query,
    cluster_basis: basis,
    source: 'llm_citation_probe',
    observed_at: obs.observed_at,
    mentions: [
      ...(obs.cited_ours || []),
      ...(obs.cited_domains || []),
      ...(obs.named_in_answer || [])
    ]
  });
}

const byKey = new Map();
for (const obs of candidates) byKey.set(obs.id, { ...obs, mentions: [] });
for (const obs of manual) byKey.set(obs.id || `${obs.cluster}:${obs.query}`, obs);
for (const obs of probeObservations) byKey.set(obs.id, obs);

const groups = new Map();
for (const obs of byKey.values()) {
  const key = `${obs.vertical || 'bhpc'}/${obs.cluster || 'general'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(obs);
}
const ranked = [];
for (const [key, observations] of groups) {
  const [vertical, cluster] = key.split('/');
  let canonical_mentions = 0, velocity_mentions = 0, competitor_mentions = 0, unknown_mentions = 0;
  for (const obs of observations) {
    const text = JSON.stringify(obs.mentions || obs.results || []).toLowerCase();
    if (/billionairehighperformancecoach\.com/.test(text)) canonical_mentions++;
    if (/spryexecutiveos\.com|aplayermode\.com/.test(text)) velocity_mentions++;
    if (/betterup|hone|coachhub|torch|cultureamp|culture amp/.test(text)) competitor_mentions++;
    if (!(obs.mentions || obs.results || []).length) unknown_mentions++;
  }
  const total_queries = observations.length;
  const raw = canonical_mentions * 3 + velocity_mentions * 2 - competitor_mentions + Math.max(0, total_queries - unknown_mentions) * 0.5;
  const score = total_queries ? Math.max(0, Math.min(100, Math.round((raw / (total_queries * 3)) * 100))) : 0;
  const observed_queries = total_queries - unknown_mentions;
  ranked.push({ vertical, cluster, total_queries, observations: total_queries, observed_queries, canonical_mentions, velocity_mentions, competitor_mentions, unknown_mentions, score, status: score >= 60 ? 'strong' : unknown_mentions === total_queries ? 'not_observed' : 'weak' });
}
ranked.sort((a, b) => a.score - b.score || b.total_queries - a.total_queries);

const output = {
  generated_at: new Date().toISOString(),
  clusters: ranked.length,
  observation_sources: {
    candidates: candidates.length,
    manual: manual.length,
    probe_file: PROBE_OBSERVATIONS,
    probe_runs: probeRuns.length,
    probe_observations_ingested: probeIngested,
    probe_observations_answered: probeAnswered,
    probe_observations_unmapped: probeUnmapped
  },
  ranked
};
fs.writeFileSync(path.join(reports, 'answer_surface_scorecard.json'), JSON.stringify(output, null, 2) + '\n');

// Rule 0: never report success having scored nothing.
if (!ranked.length) {
  console.error('answer:score STOP: scored zero clusters. Nothing to rank - check data/answer_surface_monitoring/observation_candidates.json.');
  process.exit(1);
}
const probeHasMeasuredRuns = probeRuns.some((r) => (r.observations || []).some((o) => o && o.status === 'observed'));
if (probeHasMeasuredRuns && probeIngested === 0) {
  console.error(`answer:score STOP: ${PROBE_OBSERVATIONS} contains measured observations but zero of them reached the scorecard. The probe/scorer join is broken - do not report a scorecard built from no measurement.`);
  process.exit(1);
}
console.log(`answer:score wrote ${ranked.length} clusters; ingested ${probeIngested} probe observation(s) (${probeUnmapped} unmapped) from ${PROBE_OBSERVATIONS}`);
