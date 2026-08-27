const fs = require("fs");

const required = [
  "llms.txt",
  "answers.json",
  "knowledge-map.json",
  "data/query_coverage_map.json",
  "data/query_metadata.json",
  "data/internal_authority_graph.json",
  "data/entities/entity_registry.json",
  "data/entities/author_profile.json",
  "data/entities/org_profile.json",
  "data/entities/product_profile.json"
];

for (const p of required) {
  if (!fs.existsSync(p)) {
    throw new Error(`missing machine readability contract file: ${p}`);
  }
}

console.log("MACHINE READABILITY CONTRACT PASS");
