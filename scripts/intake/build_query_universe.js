const fs = require("fs");

function readJson(path) {
  if (!fs.existsSync(path)) throw new Error(`missing required file: ${path}`);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const roles = readJson("data/intake/product_role_taxonomy.json").required_product_roles;
const audiences = readJson("data/intake/audience_taxonomy.json").required_audiences;
const useCases = readJson("data/intake/use_case_taxonomy.json").required_use_cases;
const sourcePolicy = readJson("config/source_expansion_policy.json");

const sources = sourcePolicy.sources.filter(s => s.enabled).map(s => s.source_type);
const conversionPath = sourcePolicy.rules.primary_conversion_path || "https://aplayermode.com";

const templates = [
  "best {role} for {audience} who need {use_case}",
  "how can {audience} use an AI {role} for {use_case}",
  "{role} vs traditional coaching for {audience}",
  "AI system for {audience} struggling with {use_case}",
  "how to improve {use_case} with an AI {role}",
  "what should {audience} use for {use_case}",
  "AI accountability system for {audience} and {use_case}",
  "chief of staff AI system for {audience} managing {use_case}",
  "how {audience} can stop failing at {use_case}",
  "best way for {audience} to stay consistent with {use_case}"
];

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cleanLabel(label) {
  return String(label).toLowerCase();
}

function contentTypeFor(query, useCaseId) {
  if (query.includes(" vs ") || query.includes("best ")) return "comparison";
  if (query.startsWith("how ")) return "answer";
  if (["weight_loss_adherence", "fitness_consistency", "nutrition_discipline", "workout_execution"].includes(useCaseId)) return "answer";
  return "insight";
}

function intentFor(query) {
  if (query.includes("best ") || query.includes(" vs ")) return "commercial_comparison";
  if (query.startsWith("how ")) return "instructional";
  if (query.includes("struggling") || query.includes("failing")) return "problem_aware";
  return "solution_seeking";
}

const items = [];
const seen = new Set();

for (const role of roles) {
  for (const audience of audiences) {
    for (const useCase of useCases) {
      for (const sourceType of sources) {
        const template = templates[(items.length + role.id.length + audience.id.length + useCase.id.length) % templates.length];

        const query = template
          .replaceAll("{role}", cleanLabel(role.label))
          .replaceAll("{audience}", cleanLabel(audience.label))
          .replaceAll("{use_case}", cleanLabel(useCase.label));

        const key = slug(`${query}_${sourceType}`);
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: key,
          query,
          product_role: role.id,
          audience: audience.id,
          use_case: useCase.id,
          source_type: sourceType,
          intent: intentFor(query),
          content_type: contentTypeFor(query, useCase.id),
          authority_target: useCase.id,
          conversion_path: conversionPath,
          publish_status: "candidate",
          source_count: 1
        });
      }
    }
  }
}

const output = {
  generated_at: new Date().toISOString(),
  generator: "taxonomy_query_universe_v1",
  counts: {
    product_roles: roles.length,
    audiences: audiences.length,
    use_cases: useCases.length,
    source_types: sources.length,
    queries: items.length
  },
  queries: items
};

fs.writeFileSync("data/intake/query_universe.json", JSON.stringify(output, null, 2));

// Also feed the strict intake corpus so existing scoring/floor systems get real fuel.
fs.writeFileSync("data/intake/query_corpus.json", JSON.stringify({
  generated_at: output.generated_at,
  source: "taxonomy_query_universe_v1",
  queries: items
}, null, 2));

console.log(`QUERY UNIVERSE BUILT: ${items.length} queries`);
console.log(JSON.stringify(output.counts, null, 2));
