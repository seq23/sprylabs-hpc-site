/**
 * NOT AN INGESTION. This file writes a hardcoded five-element list of strings
 * somebody typed here by hand. It makes no network call, contacts Reddit
 * at no point, and retains no URL, id or capture timestamp - so nothing
 * downstream can tell one of these rows from a query a real person searched for.
 *
 * It is left in place because the strings themselves are plausible page targets
 * and deleting them loses that. What it may not be is counted as observed
 * demand, which is why every row it writes is now stamped
 * `provenance: "hardcoded_seed_list"` and `observed: false`.
 *
 * See data/intake/query_provenance_audit.json for the full accounting, and
 * scripts/intake/audit_query_provenance.js for the test being applied.
 */
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
  ingested_at: new Date().toISOString(),
  provenance: "hardcoded_seed_list",
  observed: false
}));

fs.writeFileSync(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), queries }, null, 2));

console.log(`REDDIT INGESTION: wrote ${queries.length} queries`);
