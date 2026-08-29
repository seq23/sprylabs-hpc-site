const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function textOf(item) {
  return [
    item.query,
    item.title,
    item.name,
    item.cluster,
    item.cluster_id,
    item.intent,
    item.content_type,
    item.source,
    item.target_page
  ].filter(Boolean).join(" ").toLowerCase();
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function termScore(text, terms, high = 95, medium = 65, low = 35) {
  const hits = terms.filter(t => text.includes(String(t).toLowerCase())).length;
  if (hits >= 3) return high;
  if (hits === 2) return medium + 15;
  if (hits === 1) return medium;
  return low;
}

function fileList(dir, ext = ".html") {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function existingHtmlTextIndex() {
  return fileList(".")
    .slice(0, 1000)
    .map(file => {
      let text = "";
      try { text = fs.readFileSync(file, "utf8").toLowerCase(); } catch {}
      return { file, text };
    });
}

function scoreCannibalization(text, htmlIndex, collisionTerms, differentiators) {
  const collisionHits = collisionTerms.filter(t => text.includes(t.toLowerCase())).length;
  const differentiatorHits = differentiators.filter(t => text.includes(t.toLowerCase())).length;

  let existingHits = 0;
  for (const row of htmlIndex) {
    for (const term of collisionTerms) {
      if (text.includes(term.toLowerCase()) && row.text.includes(term.toLowerCase())) {
        existingHits++;
        break;
      }
    }
  }

  let risk = collisionHits * 18 + Math.min(existingHits, 5) * 8 - differentiatorHits * 18;
  return clamp(risk);
}

const CITATION_OBSERVATIONS = "data/signals/llm_citation_observations.json";

function normalizeQuery(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The measured citation signal, keyed by query.
 *
 * competition_opportunity used to be `text.includes("betterup") || ... ? 90 : 55`
 * against five hardcoded brand names. No item in the backlog mentions any of
 * them, so every one of the 120 scored items received the same default 55 - a
 * constant multiplied by a constant weight, which changes no ranking and
 * measures no competition. It was a placebo occupying the slot where the real
 * signal belongs.
 *
 * The real signal is the grounded citation probe: for a given query, did an
 * answer engine actually answer, and did it build the answer from one of our
 * pages? A query an engine answers without us is a measured opening. A query it
 * already answers with us is not.
 *
 * Only grounded runs count. Knowledge-mode runs record whether a model
 * memorised the brand, which is not a citation and must not be scored as one.
 */
function buildCitationSignal() {
  const doc = readJson(CITATION_OBSERVATIONS, null);
  const index = new Map();
  if (!doc) return index;
  for (const run of doc.runs || []) {
    if (run.mode !== "grounded") continue;
    for (const obs of run.observations || []) {
      if (obs.status !== "observed") continue;   // a provider error measured nothing
      const key = normalizeQuery(obs.query);
      const prior = index.get(key);
      // Latest run wins; runs are appended in order.
      index.set(key, { self_cited: Boolean(obs.self_cited), observed_at: obs.observed_at, prior_self_cited: prior ? prior.self_cited : null });
    }
  }
  return index;
}

// A cluster carries no scalar `query`. It carries a nested `queries[]` (and a
// `query_sample[]`), which is how scripts/intake/build_backlog.js has always
// read it. Keying the citation lookup on item.query therefore looked up the
// empty string for all 120 clusters, and every one of them recorded
// "this query has not been probed" while 83 real grounded observations sat in
// the file.
function queriesForItem(item) {
  const out = [];
  if (Array.isArray(item.queries)) {
    for (const q of item.queries) { const v = typeof q === "string" ? q : (q && q.query); if (v) out.push(v); }
  }
  if (Array.isArray(item.query_sample)) for (const q of item.query_sample) if (q) out.push(q);
  for (const v of [item.query, item.title, item.name, item.cluster]) if (v) out.push(v);
  return [...new Set(out)];
}

// "Not cited" is NOT "open ground". A grounded answer that cited nobody of ours
// says who held the citation slots; it does not say the query describes ground
// this property can contest. The probe's own list carries brand and competitor
// monitoring rows - "sprylabs", "spry reddit", "compare humantelligence",
// "nua coach alternative" - and "phone vortex meaning", which returned
// dictionary sites. Awarding those a maximum competition_opportunity of 90
// would be a false blue-ocean signal, so the gate refuses them before any score
// is given. billionairehighperformancecoach.com, spryexecutiveos.com and
// aplayermode.com are three domains of ONE property, so all three are brand
// tokens here.
const BRAND_TOKENS = /\b(spry|sprylabs|spryexecutiveos|aplayermode|a player mode|bhpc|billionairehighperformancecoach)\b/i;
function blueOceanEligibility(query) {
  const q = String(query || "").trim();
  if (!q) return { eligible: false, reason: "EMPTY_QUERY" };
  if (BRAND_TOKENS.test(q)) {
    return { eligible: false, reason: "BRAND_OR_PERSON_NAME_NAVIGATIONAL", note: "Navigational query for this property's own name. Whoever the engine cited for it is not competitive ground." };
  }
  if (q.split(/\s+/).length < 2) {
    return { eligible: false, reason: "NO_SERVICE_OR_LOCATION_ANCHOR", note: "A single-token query gives the engine nothing to anchor retrieval to, so its citation set does not describe this property's ground." };
  }
  return { eligible: true, reason: "ANCHORED_QUERY" };
}

let memoizedSignal = null;
function competitionOpportunityFor(item, signal) {
  // Callers that score a single item pass no context; they still get the
  // measured signal rather than a silent "unmeasured".
  if (!signal) signal = (memoizedSignal ||= buildCitationSignal());
  if (!signal || !signal.size) return { value: null, basis: "no grounded citation observation recorded for any query" };
  const candidates = queriesForItem(item);
  if (!candidates.length) return { value: null, basis: "this cluster carries no query text, so nothing could be looked up" };
  const hits = [];
  for (const q of candidates) {
    const hit = signal.get(normalizeQuery(q));
    if (hit) hits.push({ query: q, ...hit });
  }
  if (!hits.length) return { value: null, basis: "none of this cluster's queries has been probed, so competition is unmeasured" };
  // Holding ground anywhere in the cluster outranks an open reading elsewhere in
  // it: a page that already surfaces is a position to defend, not an opening.
  const held = hits.find((h) => h.self_cited);
  if (held) return { value: 30, basis: `measured: a grounded answer engine answered "${held.query}" and cited one of our pages (${held.observed_at})` };
  const eligible = hits.map((h) => ({ h, gate: blueOceanEligibility(h.query) })).filter((x) => x.gate.eligible);
  if (!eligible.length) {
    const first = blueOceanEligibility(hits[0].query);
    return { value: null, basis: `refused as open ground: every probed query for this cluster is ${first.reason}. "Not cited" is not "open ground".` };
  }
  const top = eligible[0];
  return { value: 90, basis: `measured: a grounded answer engine answered "${top.h.query}" and cited nobody of ours (${top.h.observed_at})` };
}

function scoreCluster(item, context = {}) {
  const weights = context.weights || readJson("data/scoring/weights.json", {});
  const conversionTerms = context.conversionTerms || readJson("data/scoring/conversion_intent_terms.json", {});
  const cannibalizationTerms = context.cannibalizationTerms || readJson("data/scoring/cannibalization_terms.json", {});
  const htmlIndex = context.htmlIndex || [];

  const text = textOf(item);
  const allConversionTerms = [
    ...(conversionTerms.high_intent || []),
    ...(conversionTerms.medium_intent || [])
  ];

  const sourceFrequency = clamp((item.source_count || item.sources?.length || item.query_count || 1) * 20);
  const conversionProximity = termScore(text, allConversionTerms, 95, 65, 25);
  const coverageGap = item.target_page ? 55 : 85;
  const authorityGraph = item.authority_target || item.pillar || item.cluster ? 80 : 45;
  const extractability = text.length >= 35 ? 80 : 45;
  const fanout = text.includes("vs") || text.includes("alternative") || text.includes("best") || text.includes("how to") ? 85 : 55;
  const freshness = String(item.source || "").includes("reddit") || String(item.generated_at || item.date || "").includes("2026") ? 80 : 55;
  const competition = competitionOpportunityFor(item, context.citationSignal);
  const competitionOpportunity = competition.value;

  const cannibalizationRisk = scoreCannibalization(
    text,
    htmlIndex,
    cannibalizationTerms.collision_terms || [],
    cannibalizationTerms.approved_differentiators || []
  );

  // A component with no measurement behind it is dropped and its weight is
  // redistributed across the components that do have one, rather than being
  // filled with a default. Filling it is what made competition_opportunity a
  // constant on every item.
  const components = [
    [sourceFrequency, weights.source_frequency || 0.15],
    [conversionProximity, weights.conversion_proximity || 0.20],
    [coverageGap, weights.coverage_gap || 0.15],
    [authorityGraph, weights.authority_graph || 0.15],
    [extractability, weights.extractability || 0.15],
    [fanout, weights.fanout || 0.10],
    [freshness, weights.freshness || 0.05],
    // `|| 0.05` meant a deliberately declared weight of 0 sprang straight back
    // to 0.05, because 0 is falsy. A weight set to zero on purpose has to stay
    // zero, or turning a component off does nothing and says nothing.
    [competitionOpportunity, weights.competition_opportunity ?? 0.05]
  ].filter(([value]) => typeof value === "number" && Number.isFinite(value));
  const weightUsed = components.reduce((sum, [, w]) => sum + w, 0) || 1;
  const weighted = components.reduce((sum, [value, w]) => sum + value * w, 0) / weightUsed;

  const penalties = weights.penalties || {};
  let penalty = 0;
  const penaltyReasons = [];

  if (cannibalizationRisk >= 80) {
    penalty += penalties.cannibalization_high || 30;
    penaltyReasons.push("high_cannibalization_risk");
  }
  if (sourceFrequency < 40) {
    penalty += penalties.thin_signal || 20;
    penaltyReasons.push("thin_signal");
  }
  if (conversionProximity < 60) {
    penalty += penalties.missing_conversion_path || 25;
    penaltyReasons.push("weak_conversion_path");
  }
  if (authorityGraph < 60) {
    penalty += penalties.missing_authority_target || 20;
    penaltyReasons.push("missing_authority_target");
  }

  const total = clamp(weighted - penalty);

  return {
    id: item.id || item.cluster_id || item.slug || text.slice(0, 48).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    query: queriesForItem(item)[0] || "",
    target_page: item.target_page || item.page || null,
    score: total,
    approved: total >= ((weights.thresholds || {}).approved_min_total || 75),
    breakdown: {
      source_frequency: sourceFrequency,
      conversion_proximity: conversionProximity,
      coverage_gap: coverageGap,
      authority_graph: authorityGraph,
      extractability,
      fanout,
      freshness,
      competition_opportunity: competitionOpportunity,
      competition_opportunity_basis: competition.basis,
      weight_used: Number(weightUsed.toFixed(4)),
      cannibalization_risk: cannibalizationRisk,
      penalty,
      penalty_reasons: penaltyReasons
    }
  };
}

function scoreItems(items) {
  const context = {
    weights: readJson("data/scoring/weights.json", {}),
    conversionTerms: readJson("data/scoring/conversion_intent_terms.json", {}),
    cannibalizationTerms: readJson("data/scoring/cannibalization_terms.json", {}),
    citationSignal: buildCitationSignal(),
    htmlIndex: existingHtmlTextIndex()
  };
  return items.map(item => scoreCluster(item, context));
}

module.exports = {
  queriesForItem,
  competitionOpportunityFor,
  blueOceanEligibility,
  buildCitationSignal, scoreCluster, scoreItems };
