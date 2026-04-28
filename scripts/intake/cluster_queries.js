const fs = require("fs");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const corpus = readJson("data/intake/query_corpus.json", { queries: [] });
const queries = corpus.queries || [];

const clusters = new Map();

for (const q of queries) {
  const productRole = q.product_role || "unknown_role";
  const audience = q.audience || "unknown_audience";
  const useCase = q.use_case || "unknown_use_case";
  const sourceType = q.source_type || "unknown_source";

  const clusterId = `${productRole}__${useCase}`;

  if (!clusters.has(clusterId)) {
    clusters.set(clusterId, {
      id: clusterId,
      cluster_id: clusterId,
      product_role: productRole,
      use_case: useCase,
      audiences: new Set(),
      source_types: new Set(),
      queries: [],
      query_count: 0,
      source_count: 0,
      audience_count: 0,
      authority_target: q.authority_target || useCase,
      conversion_path: q.conversion_path || "https://aplayermode.com",
      intent: q.intent || "solution_seeking",
      content_type: q.content_type || "answer"
    });
  }

  const cluster = clusters.get(clusterId);
  cluster.queries.push(q);
  cluster.audiences.add(audience);
  cluster.source_types.add(sourceType);
}

const output = [...clusters.values()].map(c => ({
  ...c,
  audiences: [...c.audiences],
  source_types: [...c.source_types],
  query_count: c.queries.length,
  source_count: c.source_types.size,
  audience_count: c.audiences.size,
  query_sample: c.queries.slice(0, 10).map(q => q.query)
}));

fs.writeFileSync("data/intake/query_clusters.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  clustering_model: "taxonomy_product_role_use_case_v1",
  counts: {
    queries: queries.length,
    clusters: output.length
  },
  clusters: output
}, null, 2));

console.log(`intake: clustered ${output.length} strategic clusters`);
