const fs = require("fs");

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const scoreData = read("data/intake/query_scores.json");
const clusterData = read("data/intake/query_clusters.json");

const scores = Array.isArray(scoreData)
  ? scoreData
  : Array.isArray(scoreData.items)
    ? scoreData.items
    : Array.isArray(scoreData.scores)
      ? scoreData.scores
      : [];

const clusters = Array.isArray(clusterData)
  ? clusterData
  : Array.isArray(clusterData.clusters)
    ? clusterData.clusters
    : Array.isArray(clusterData.items)
      ? clusterData.items
      : [];

const scoreByCluster = new Map(
  scores.map(s => [s.cluster_id || s.id, typeof s.score === "number" ? s.score : 0])
);

function monetizationAlignment(clusterId, cluster) {
  const role = cluster.product_role || "assistant";
  const useCase = cluster.use_case || clusterId;

  if (/nutrition|fitness|workout|weight_loss|body/i.test(useCase)) {
    return "AI accountability system for Body pillar discipline, nutrition execution, fitness consistency, and daily life operating system adherence";
  }

  if (/habit|consistency|missed_day|recovery/i.test(useCase)) {
    return "AI accountability system for habit consistency, missed-day recovery, life planning, and execution follow-through";
  }

  if (/decision|priority|planning|overplanning/i.test(useCase)) {
    return "AI executive coach system for planning, decision support, priority arbitration, and operator execution";
  }

  if (/workflow|multi_project|assistant|chief/i.test(useCase) || /assistant|chief_of_staff/i.test(role)) {
    return "AI chief-of-staff system for executive workflows, project coordination, planning, and decision support";
  }

  return "AI coach system for accountability, executive planning, decision support, and personal operating system execution";
}

function intentAnchor(clusterId, cluster) {
  const useCase = cluster.use_case || clusterId;

  if (/daily_planning/i.test(useCase)) return "morning planning system";
  if (/weekly_review/i.test(useCase)) return "weekly review system";
  if (/decision/i.test(useCase)) return "real-time decision system";
  if (/execution/i.test(useCase)) return "task execution system";
  if (/accountability/i.test(useCase)) return "daily accountability system";
  if (/multi_project/i.test(useCase)) return "multi-project system";
  if (/delegation/i.test(useCase)) return "delegation system";
  if (/operating_rhythm/i.test(useCase)) return "operating rhythm system";

  return "general execution system";
}

function differentiator(clusterId, cluster) {
  const useCase = cluster.use_case || clusterId;
  const role = cluster.product_role || "assistant";

  if (/nutrition/i.test(useCase)) {
    return "body system body pillar nutrition discipline daily accountability";
  }

  if (/fitness|workout|weight_loss/i.test(useCase)) {
    return "body system body pillar fitness discipline workout consistency";
  }

  if (/habit|consistency/i.test(useCase)) {
    return "accountability system discipline system habits low-energy execution";
  }

  if (/missed_day|recovery/i.test(useCase)) {
    return "recovery system missed-day recovery next-action system structure not therapy";
  }

  if (/decision|priority/i.test(useCase)) {
    return "decision fatigue system priority system executive operating system";
  }

  if (/planning|overplanning|weekly_review|daily_planning/i.test(useCase)) {
    return "planning system agenda system daily operating system overplanning";
  }

  if (/workflow|multi_project|delegation|execution/i.test(useCase)) {
    return "chief of staff system execution workflow operator system project operating system";
  }

  if (/assistant|chief/i.test(role)) {
    return "chief of staff system AI assistant operating system operator system";
  }

  return "personal operating system execution system accountability system";
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}


const seenUseCases = new Set();

const items = [];

for (const cluster of clusters) {
  const clusterId = cluster.cluster_id || cluster.id;
  if (!clusterId) continue;

  const useCase = cluster.use_case || clusterId;

  if (seenUseCases.has(useCase)) continue;
  seenUseCases.add(useCase);

  const diff = differentiator(clusterId, cluster);
  const target = `/${slugify(clusterId.replace(/__/g, "-"))}-${slugify(diff)}.html`;

  items.push({
    id: `backlog_${String(items.length + 1).padStart(3, "0")}`,
    cluster_id: clusterId,
    score: scoreByCluster.get(clusterId) || 0,
    status: "approved",
    generation_mode: "strict",
    priority: "auto_full_coverage",
    queries: [
      ...(cluster.query_sample || cluster.queries || [])
        .map(q => typeof q === "string" ? q : q.query)
        .filter(Boolean)
        .slice(0, 20),
      intentAnchor(clusterId, cluster)
    ],
    target_pages: cluster.target_pages && cluster.target_pages.length
      ? cluster.target_pages
      : [target],
    required_links: ["https://aplayermode.com", "/"],
    meta: {
      product_role: cluster.product_role || null,
      use_case: cluster.use_case || null,
      audience_count: cluster.audience_count || 0,
      source_count: cluster.source_count || 0,
      full_coverage: true,
      monetization_alignment: monetizationAlignment(clusterId, cluster),
      differentiator: diff,
      intent_anchor: intentAnchor(clusterId, cluster),
      conversion_path: "https://aplayermode.com"
    }
  });
}

const output = {
  generated_at: new Date().toISOString(),
  mode: "full_coverage",
  count: items.length,
  items
};

fs.writeFileSync("data/intake/build_backlog.json", JSON.stringify(output, null, 2) + "\n");

fs.mkdirSync("data/backlog", { recursive: true });
fs.writeFileSync("data/backlog/build_backlog.json", JSON.stringify(output, null, 2) + "\n");

console.log(`FULL COVERAGE BACKLOG: ${items.length} items`);
