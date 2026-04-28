const fs = require("fs");

const file = "data/answer_surface/score_history.json";

if (!fs.existsSync(file)) {
  throw new Error(`missing answer surface score history: ${file}`);
}

const history = JSON.parse(fs.readFileSync(file, "utf8"));
const runs = history.runs || [];

if (!runs.length) {
  throw new Error("ANSWER SURFACE HISTORY FAIL: no runs recorded");
}

const latest = runs[runs.length - 1];

if (!latest.generated_at) {
  throw new Error("ANSWER SURFACE HISTORY FAIL: latest run missing generated_at");
}

if (!Array.isArray(latest.clusters) || latest.clusters.length === 0) {
  throw new Error("ANSWER SURFACE HISTORY FAIL: latest run has no clusters");
}

for (const c of latest.clusters) {
  if (!c.cluster_id) throw new Error("ANSWER SURFACE HISTORY FAIL: cluster missing cluster_id");
  if (typeof c.score !== "number") throw new Error(`ANSWER SURFACE HISTORY FAIL: cluster missing numeric score: ${c.cluster_id}`);
  if (!("delta" in c)) throw new Error(`ANSWER SURFACE HISTORY FAIL: cluster missing delta field: ${c.cluster_id}`);
}

console.log(`ANSWER SURFACE HISTORY PASS: runs=${runs.length} clusters=${latest.clusters.length}`);
