const fs = require("fs");
const { scoreItems } = require("../scoring/score_cluster");

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

fs.mkdirSync("data/intake", { recursive: true });
fs.writeFileSync(
  "data/intake/query_scores.json",
  JSON.stringify({
    generated_at: new Date().toISOString(),
    scoring_model: "weighted_conversion_authority_extractability_v1",
    items: scored
  }, null, 2)
);

console.log(`intake: scored ${scored.length} clusters with upgraded scoring engine`);
