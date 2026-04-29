const fs = require("fs");

const scorecardPath = "reports/answer_surface_scorecard.json";
const historyPath = "data/answer_surface/score_history.json";

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const scorecard = readJson(scorecardPath, {});
const previous = readJson(historyPath, { runs: [] });

const clusters = Array.isArray(scorecard.ranked)
  ? scorecard.ranked
  : Array.isArray(scorecard.items)
    ? scorecard.items
    : [];

const lastRun = previous.runs && previous.runs.length ? previous.runs[previous.runs.length - 1] : null;
const lastScores = new Map((lastRun?.clusters || []).map(c => [c.cluster_id, c.score]));

const normalized = clusters.map(c => {
  const cluster_id = c.cluster_id || c.id || c.name || (c.vertical && c.cluster ? `${c.vertical}__${c.cluster}` : null) || c.query || c.title;
  const score = Number(c.score ?? c.answer_surface_score ?? c.priority_score ?? c.average_score ?? 0);
  const previous_score = lastScores.has(cluster_id) ? lastScores.get(cluster_id) : null;

  return {
    cluster_id,
    score,
    previous_score,
    delta: previous_score === null ? null : score - previous_score
  };
}).filter(c => c.cluster_id);

const run = {
  generated_at: new Date().toISOString(),
  cluster_count: normalized.length,
  clusters: normalized
};

const output = {
  version: "1.0",
  runs: [...(previous.runs || []), run].slice(-30)
};

fs.mkdirSync("data/answer_surface", { recursive: true });
fs.writeFileSync(historyPath, JSON.stringify(output, null, 2));

console.log(`ANSWER SURFACE HISTORY UPDATED: runs=${output.runs.length} clusters=${run.cluster_count}`);
