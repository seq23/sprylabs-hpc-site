const fs = require("fs");

const paths = {
  corpus: "data/intake/query_corpus.json",
  clusters: "data/intake/query_clusters.json",
  backlog: "data/backlog/build_backlog.json"
};

function safeCount(path) {
  if (!fs.existsSync(path)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    if (Array.isArray(data)) return data.length;
    if (data.items && Array.isArray(data.items)) return data.items.length;
    if (data.queries && Array.isArray(data.queries)) return data.queries.length;
    if (data.clusters && Array.isArray(data.clusters)) return data.clusters.length;
    return 0;
  } catch {
    return 0;
  }
}

const counts = {
  raw_queries: safeCount(paths.corpus),
  clusters: safeCount(paths.clusters),
  backlog_items: safeCount(paths.backlog)
};

const thresholds = {
  raw_queries: 25,
  clusters: 8,
  backlog_items: 10
};

const publish_allowed =
  counts.raw_queries >= thresholds.raw_queries &&
  counts.clusters >= thresholds.clusters &&
  counts.backlog_items >= thresholds.backlog_items;

const report = {
  status: publish_allowed ? "sufficient_signal" : "insufficient_signal",
  counts,
  thresholds,
  publish_allowed,
  timestamp: new Date().toISOString()
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/signal_floor_report.json", JSON.stringify(report, null, 2));

console.log(`SIGNAL FLOOR REPORT: ${report.status}`);
console.log(JSON.stringify(report, null, 2));
