const fs = require("fs");

const file = "data/intake/query_universe.json";
if (!fs.existsSync(file)) throw new Error(`missing query universe file: ${file}`);

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const queries = data.queries || [];

if (queries.length < 1000) {
  throw new Error(`query universe too small: expected >=1000, found ${queries.length}`);
}

const required = [
  "query",
  "product_role",
  "audience",
  "use_case",
  "source_type",
  "intent",
  "content_type",
  "authority_target",
  "conversion_path"
];

const roles = new Set();
const audiences = new Set();
const useCases = new Set();
const sources = new Set();

for (const q of queries) {
  for (const key of required) {
    if (!q[key]) throw new Error(`query universe item missing ${key}: ${JSON.stringify(q)}`);
  }

  if (q.conversion_path !== "https://aplayermode.com") {
    throw new Error(`query universe item has wrong conversion path: ${q.conversion_path}`);
  }

  roles.add(q.product_role);
  audiences.add(q.audience);
  useCases.add(q.use_case);
  sources.add(q.source_type);
}

if (roles.size < 5) throw new Error(`query universe missing product roles: ${roles.size}`);
if (audiences.size < 14) throw new Error(`query universe missing audiences: ${audiences.size}`);
if (useCases.size < 24) throw new Error(`query universe missing use cases: ${useCases.size}`);
if (sources.size < 9) throw new Error(`query universe missing source types: ${sources.size}`);

console.log(`QUERY UNIVERSE CONTRACT PASS: queries=${queries.length} roles=${roles.size} audiences=${audiences.size} use_cases=${useCases.size} sources=${sources.size}`);
