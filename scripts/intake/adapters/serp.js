/**
 * NOT AN INGESTION. This file writes a hardcoded five-element list of strings
 * somebody typed here by hand. It makes no network call, contacts a Google SERP
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
  ingested_at: new Date().toISOString(),
  provenance: "hardcoded_seed_list",
  observed: false
}));

fs.writeFileSync(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), queries }, null, 2));

console.log(`SERP INGESTION: wrote ${queries.length} queries`);
