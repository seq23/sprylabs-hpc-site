const fs = require("fs");

const scorecardPath = "reports/answer_surface_scorecard.json";
const historyPath = "data/answer_surface/score_history.json";
const outputPath = "data/answer_surface/weakness_backlog.json";

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const scorecard = readJson(scorecardPath, {});
const history = readJson(historyPath, { runs: [] });

const ranked = Array.isArray(scorecard.ranked) ? scorecard.ranked : [];
const latestRun = history.runs?.length ? history.runs[history.runs.length - 1] : null;

const historyByCluster = new Map(
  (latestRun?.clusters || []).map(c => [c.cluster_id, c])
);

const items = ranked.map((item, index) => {
  const cluster_id = item.cluster_id || item.id || item.name || (item.vertical && item.cluster ? `${item.vertical}__${item.cluster}` : null) || `unknown_${index}`;
  const score = Number(item.score ?? 0);
  const historyItem = historyByCluster.get(cluster_id);
  const delta = historyItem ? historyItem.delta : null;

  let priority = "medium";
  if (score <= 20) priority = "critical";
  else if (score <= 50) priority = "high";

  return {
    id: `answer_surface_${String(index + 1).padStart(3, "0")}`,
    cluster_id,
    vertical: item.vertical || "unknown",
    cluster: item.cluster || cluster_id,
    score,
    status: item.status || "unknown",
    priority,
    delta,
    reason: score <= 50
      ? "Weak answer-surface performance; prioritize content, internal links, and citation reinforcement."
      : "Monitor; not currently critical.",
    recommended_actions: [
      "create_or_refresh_target_page",
      "add_extractable_answer_block",
      "add_internal_links_from_authority_pages",
      "route_conversion_path_to_approved_endpoint",
      "queue_for_observation_rerun"
    ]
  };
}).filter(item => item.priority === "critical" || item.priority === "high");

const output = {
  generated_at: new Date().toISOString(),
  source: "answer_surface_scorecard",
  count: items.length,
  items
};

fs.mkdirSync("data/answer_surface", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`ANSWER SURFACE WEAKNESS BACKLOG BUILT: ${items.length} items`);
