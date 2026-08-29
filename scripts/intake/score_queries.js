const fs = require("fs");
const { scoreItems, queriesForItem, buildCitationSignal } = require("../scoring/score_cluster");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const clusterData = readJson("data/intake/query_clusters.json", []);
const clusters = Array.isArray(clusterData)
  ? clusterData
  : Array.isArray(clusterData.clusters)
    ? clusterData.clusters
    : [];

const scored = scoreItems(clusters);

// competition_opportunity is a DECLARED scoring input - it carries a weight in
// data/scoring/weights.json. When no cluster can be joined to an observation the
// engine correctly drops the component and redistributes its weight, but that
// correct fallback is indistinguishable, from the outside, from the component
// working. It was not working: the lookup keyed on a scalar `query` that a
// cluster does not have, so all 120 clusters recorded
// "this query has not been probed" while 83 grounded observations sat unused.
//
// The key is fixed above. The deeper condition it exposed is not: the probe
// reads data/seo/priority_queries.json - 25 brand and competitor monitoring
// rows - and the scorer scores 9,179 cluster queries. The two populations do
// not intersect at all, so the component can measure nothing no matter how the
// join is written. That is a decision about what the probe should measure and
// what it should cost, not a code change, so it is recorded here in full rather
// than guessed at. Nothing may quietly present this component as measured.
const signal = buildCitationSignal();
const norm = (q) => String(q || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clusterQueries = new Set();
for (const c of clusters) for (const q of queriesForItem(c)) clusterQueries.add(norm(q));

// The probe's query SOURCE, not just what it has observed so far. Whether the
// component can ever be measured is a property of the two lists, and it is
// answerable without waiting for a probe run.
const probeConfig = readJson("data/signals/citation_probe_config.json", {});
const probeQueriesFile = probeConfig.queries_file || "data/seo/priority_queries.json";
const probeRaw = readJson(probeQueriesFile, []);
const probeRows = Array.isArray(probeRaw) ? probeRaw : (probeRaw.queries || probeRaw.priority_queries || probeRaw.entries || []);
const probeSource = [...new Set(probeRows.map((r) => norm(typeof r === "string" ? r : (r && (r.query || r.text)))).filter(Boolean))];
const sourceIntersection = probeSource.filter((q) => clusterQueries.has(q));

const observed = [...signal.keys()];
const observedIntersection = observed.filter((q) => clusterQueries.has(q));
const measured = scored.filter((s) => s.breakdown && s.breakdown.competition_opportunity !== null).length;
const declaredWeight = readJson("data/scoring/weights.json", {}).competition_opportunity ?? null;
const coverage = {
  declared_weight: declaredWeight,
  scored_clusters: scored.length,
  clusters_with_a_measured_reading: measured,
  distinct_cluster_queries: clusterQueries.size,
  probe_query_source: probeQueriesFile,
  distinct_probe_source_queries: probeSource.length,
  probe_source_queries_that_are_cluster_queries: sourceIntersection.length,
  distinct_probed_queries: observed.length,
  probed_queries_that_are_cluster_queries: observedIntersection.length,
  signal_source: "data/signals/llm_citation_observations.json, written by scripts/llm_citation_probe.mjs",
  status: measured > 0 ? "MEASURED" : (sourceIntersection.length ? "MEASURABLE_NOT_YET_PROBED" : "NEVER_MEASURABLE_AS_WIRED"),
  why: measured > 0
    ? "At least one cluster joined to a grounded observation."
    : (sourceIntersection.length
      ? `${sourceIntersection.length} of the probe's ${probeSource.length} source queries are cluster queries, so the component can be measured; no grounded observation has landed for one of them yet.`
      : `The probe's query source (${probeQueriesFile}) holds queries with MEASURED Search Console demand; the scorer scores phrasings mined from social sources with no demand evidence. The two sets share no query at all, so competition_opportunity cannot be measured for any cluster however the join is keyed.`),
  disposition: declaredWeight ? "LIVE" : "SWITCHED_OFF_SEE_weights.json__competition_opportunity_note",
};
console.log(`intake: competition_opportunity ${coverage.disposition} - coverage ${measured}/${scored.length} (${coverage.status}); ${sourceIntersection.length} of ${probeSource.length} probe-source queries are cluster queries.`);

fs.mkdirSync("data/intake", { recursive: true });
fs.writeFileSync(
  "data/intake/query_scores.json",
  JSON.stringify({
    generated_at: new Date().toISOString(),
    scoring_model: "weighted_conversion_authority_extractability_v1",
    competition_opportunity_coverage: coverage,
    items: scored
  }, null, 2)
);

console.log(`intake: scored ${scored.length} clusters with upgraded scoring engine`);
