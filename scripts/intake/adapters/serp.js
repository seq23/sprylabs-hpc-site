const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "../../../data/intake/source_ingestion/serp.json");

const serpQueries = [
  "best ai productivity system",
  "how to stop procrastinating permanently",
  "daily routine for high performers",
  "ai vs human executive coach",
  "how to stay disciplined every day"
];

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

const queries = serpQueries.map(q => ({
  query: q,
  source_type: "google_paa",
  product_role: "executive_coach",
  audience: "upwardly_mobile_executives",
  use_case: "execution",
  intent: "solution_seeking",
  content_type: "answer",
  authority_target: "execution",
  conversion_path: "https://aplayermode.com",
  ingested_at: new Date().toISOString()
}));

fs.writeFileSync(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), queries }, null, 2));

console.log(`SERP INGESTION: wrote ${queries.length} queries`);
