#!/usr/bin/env node
const fs = require("fs");

function readJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${p}. Run npm run intake && npm run scoring first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function rows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.queries)) return data.queries;
  if (Array.isArray(data.clusters)) return data.clusters;
  if (Array.isArray(data.scores)) return data.scores;
  return [];
}

function useCaseOf(row) {
  return row?.use_case || row?.useCase || row?.meta?.use_case || row?.meta?.useCase || null;
}

const taxonomy = readJson("data/intake/use_case_taxonomy.json");
const canonical = (taxonomy.required_use_cases || []).map(x => x && x.id).filter(Boolean);

if (!canonical.length) {
  throw new Error("USE CASE MAPPING FAIL: no required_use_cases[].id found in data/intake/use_case_taxonomy.json");
}

const checkedFiles = [
  "data/intake/query_clusters.json",
  "data/intake/query_universe.json",
  "data/intake/query_corpus.json",
  "data/intake/query_scores.json",
  "data/intake/build_backlog.json",
  "data/backlog/build_backlog.json"
].filter(fs.existsSync);

const mapped = new Set();

for (const file of checkedFiles) {
  const data = readJson(file);
  for (const row of rows(data)) {
    const direct = useCaseOf(row);
    if (direct) mapped.add(direct);

    if (Array.isArray(row.queries)) {
      for (const q of row.queries) {
        const nested = useCaseOf(q);
        if (nested) mapped.add(nested);
      }
    }

    if (Array.isArray(row.items)) {
      for (const q of row.items) {
        const nested = useCaseOf(q);
        if (nested) mapped.add(nested);
      }
    }
  }
}

const missing = canonical.filter(id => !mapped.has(id));

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/use_case_taxonomy_mapping_gaps.json", JSON.stringify({
  mapping_model: "taxonomy_to_generated_signal_mapping_v1",
  taxonomy_source: "data/intake/use_case_taxonomy.json",
  checked_files: checkedFiles,
  canonical_use_cases: canonical.length,
  mapped_use_cases: canonical.length - missing.length,
  missing
}, null, 2) + "\n");

if (missing.length) {
  throw new Error(`USE CASE MAPPING FAIL: ${missing.length} canonical use_cases have no generated query/cluster/backlog mapping. See reports/use_case_taxonomy_mapping_gaps.json`);
}

console.log(`USE CASE MAPPING PASS: ${canonical.length}/${canonical.length} canonical use_cases mapped`);
