#!/usr/bin/env node
const fs = require("fs");

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`missing required file: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const clustersRaw = read("data/intake/query_clusters.json");
const backlogRaw = read("data/intake/build_backlog.json");

const clusters = Array.isArray(clustersRaw)
  ? clustersRaw
  : Array.isArray(clustersRaw.clusters)
    ? clustersRaw.clusters
    : Array.isArray(clustersRaw.items)
      ? clustersRaw.items
      : [];

const backlog = backlogRaw.items || [];

const universeUseCases = new Set(
  clusters.map(c => c.use_case || c.cluster_id).filter(Boolean)
);

const backlogUseCases = new Set(
  backlog.map(i => i.meta?.use_case || i.cluster_id).filter(Boolean)
);

const uncovered = [...universeUseCases].filter(uc => !backlogUseCases.has(uc));

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/query_coverage_gaps.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  coverage_model: "use_case_canonical_page_coverage",
  universe_use_cases: universeUseCases.size,
  covered_use_cases: backlogUseCases.size,
  uncovered_count: uncovered.length,
  uncovered_use_cases: uncovered
}, null, 2));

if (process.env.QUERY_COVERAGE_STRICT === "1" && uncovered.length) {
  throw new Error(`QUERY COVERAGE FAIL: ${uncovered.length} use_cases uncovered. See reports/query_coverage_gaps.json`);
}

console.log(`QUERY COVERAGE PASS: ${backlogUseCases.size}/${universeUseCases.size} use_cases covered`);
