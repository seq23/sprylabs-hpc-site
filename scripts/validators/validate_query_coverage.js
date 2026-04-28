const fs = require("fs");

const rawClusters = JSON.parse(fs.readFileSync("data/intake/query_clusters.json", "utf8"));
const rawBacklog = JSON.parse(fs.readFileSync("data/intake/build_backlog.json", "utf8"));

const clusters = Array.isArray(rawClusters)
  ? rawClusters
  : Array.isArray(rawClusters.clusters)
    ? rawClusters.clusters
    : Array.isArray(rawClusters.items)
      ? rawClusters.items
      : [];

const backlogItems = Array.isArray(rawBacklog)
  ? rawBacklog
  : Array.isArray(rawBacklog.items)
    ? rawBacklog.items
    : [];

const clusterIds = new Set(
  clusters.map(c => c.cluster_id || c.id).filter(Boolean)
);

const backlogClusters = new Set(
  backlogItems.map(i => i.cluster_id || i.id).filter(Boolean)
);

if (clusterIds.size === 0) {
  throw new Error("QUERY COVERAGE FAIL: no clusters found in data/intake/query_clusters.json");
}

if (backlogClusters.size === 0) {
  throw new Error("QUERY COVERAGE FAIL: no backlog clusters found in data/intake/build_backlog.json");
}

const uncovered = [...clusterIds].filter(id => !backlogClusters.has(id));

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/query_coverage_gaps.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  total_clusters: clusterIds.size,
  backlog_clusters: backlogClusters.size,
  uncovered_count: uncovered.length,
  coverage_ratio: Number(((clusterIds.size - uncovered.length) / clusterIds.size).toFixed(4)),
  uncovered_clusters: uncovered
}, null, 2));

if (uncovered.length > 0) {
  if (process.env.QUERY_COVERAGE_STRICT === "1") {
    throw new Error(`QUERY COVERAGE FAIL: ${uncovered.length} clusters not represented in backlog. See reports/query_coverage_gaps.json`);
  }

  console.log(`QUERY COVERAGE REPORT: ${uncovered.length} clusters not represented in backlog; report written to reports/query_coverage_gaps.json`);
} else {
  console.log(`QUERY COVERAGE PASS: ${clusterIds.size} clusters covered`);
}
