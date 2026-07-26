const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "../../../data/intake/source_ingestion/reddit.json");

const redditThreads = [
  "how do I stay consistent when I miss a day",
  "is an AI coach actually useful",
  "how to use chatgpt as accountability partner",
  "why do I keep restarting my habits",
  "how do founders stay disciplined daily"
];

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

const queries = redditThreads.map(q => ({
  query: q,
  source_type: "reddit",
  product_role: "accountability_partner",
  audience: "consistency_strugglers",
  use_case: "missed_day_recovery",
  intent: "problem_aware",
  content_type: "answer",
  authority_target: "missed_day_recovery",
  conversion_path: "https://aplayermode.com",
  ingested_at: new Date().toISOString()
}));

fs.writeFileSync(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), queries }, null, 2));

console.log(`REDDIT INGESTION: wrote ${queries.length} queries`);
