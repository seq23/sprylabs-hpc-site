const fs = require("fs");

const scorecardFile = "reports/answer_surface_scorecard.json";
const backlogFile = "reports/answer_surface_expansion_backlog.json";
const weaknessFile = "data/answer_surface/weakness_backlog.json";
const historyFile = "data/answer_surface/score_history.json";

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`ANSWER SURFACE DASHBOARD GATE FAIL: missing ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const scorecard = read(scorecardFile);
const expansionBacklog = read(backlogFile);
const weaknessBacklog = read(weaknessFile);
const history = read(historyFile);

const ranked = Array.isArray(scorecard.ranked) ? scorecard.ranked : [];
const expansionItems = expansionBacklog.items || [];
const weaknessItems = weaknessBacklog.items || [];
const runs = history.runs || [];

if (!ranked.length) {
  throw new Error("ANSWER SURFACE DASHBOARD GATE FAIL: scorecard has no ranked clusters");
}

if (!expansionItems.length) {
  throw new Error("ANSWER SURFACE DASHBOARD GATE FAIL: no expansion backlog items");
}

if (!weaknessItems.length) {
  throw new Error("ANSWER SURFACE DASHBOARD GATE FAIL: no weakness backlog items");
}

if (runs.length < 1) {
  throw new Error("ANSWER SURFACE DASHBOARD GATE FAIL: no score history runs");
}

const weakClusters = ranked.filter(c => Number(c.score || 0) <= 50);
const weaknessClusterIds = new Set(weaknessItems.map(i => i.cluster_id));

const missingWeaknessCoverage = weakClusters.filter(c => {
  const id = c.cluster_id || c.id || c.name || (c.vertical && c.cluster ? `${c.vertical}__${c.cluster}` : null);
  return id && !weaknessClusterIds.has(id);
});

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/answer_surface_dashboard_gates.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  ranked_clusters: ranked.length,
  weak_clusters: weakClusters.length,
  expansion_backlog_items: expansionItems.length,
  weakness_backlog_items: weaknessItems.length,
  history_runs: runs.length,
  missing_weakness_coverage: missingWeaknessCoverage
}, null, 2));

if (missingWeaknessCoverage.length) {
  throw new Error(`ANSWER SURFACE DASHBOARD GATE FAIL: ${missingWeaknessCoverage.length} weak clusters missing weakness backlog coverage`);
}

console.log(`ANSWER SURFACE DASHBOARD GATE PASS: ranked=${ranked.length} weak=${weakClusters.length} backlog=${weaknessItems.length} runs=${runs.length}`);
