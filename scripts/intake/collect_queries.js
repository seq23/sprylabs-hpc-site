const fs = require("fs");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeItem(item) {
  return {
    id: item.id || String(item.query || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    query: item.query,
    product_role: item.product_role || "unknown",
    audience: item.audience || "unknown",
    use_case: item.use_case || item.cluster || "unknown",
    source_type: item.source_type || item.source || "existing_repo",
    intent: item.intent || "solution_seeking",
    content_type: item.content_type || "answer",
    authority_target: item.authority_target || item.use_case || item.cluster || "unknown",
    conversion_path: item.conversion_path || "https://aplayermode.com",
    source_count: item.source_count || 1
  };
}

const universe = readJson("data/intake/query_universe.json", { queries: [] }).queries || [];
const existing = readJson("data/intake/query_corpus.json", { queries: [] }).queries || [];

const legacySeeds = [
  {
    query: "how to use ai as an executive coach",
    product_role: "executive_coach",
    audience: "upwardly_mobile_executives",
    use_case: "decision_making",
    source_type: "existing_repo",
    intent: "instructional",
    content_type: "answer",
    authority_target: "decision_making",
    conversion_path: "https://aplayermode.com"
  },
  {
    query: "ai accountability partner for consistency",
    product_role: "accountability_partner",
    audience: "consistency_strugglers",
    use_case: "habit_consistency",
    source_type: "existing_repo",
    intent: "solution_seeking",
    content_type: "answer",
    authority_target: "habit_consistency",
    conversion_path: "https://aplayermode.com"
  },
  {
    query: "chief of staff ai system for people with many projects",
    product_role: "chief_of_staff",
    audience: "multi_project_people",
    use_case: "multi_project_management",
    source_type: "existing_repo",
    intent: "solution_seeking",
    content_type: "answer",
    authority_target: "multi_project_management",
    conversion_path: "https://aplayermode.com"
  }
];

const merged = new Map();

for (const item of [...universe, ...existing, ...legacySeeds]) {
  if (!item.query) continue;
  const normalized = normalizeItem(item);
  const key = `${normalized.query.toLowerCase()}|${normalized.source_type}`;
  if (!merged.has(key)) merged.set(key, normalized);
}

const queries = [...merged.values()];

fs.mkdirSync("data/intake", { recursive: true });
fs.writeFileSync("data/intake/query_corpus.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  source: "taxonomy_universe_plus_existing_signals",
  counts: {
    queries: queries.length
  },
  queries
}, null, 2));

console.log(`intake: collected ${queries.length} queries`);
