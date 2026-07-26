#!/usr/bin/env node
const fs = require("fs");

function readJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${p}. Run npm run intake && npm run scoring && npm run backlog first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.backlog)) return data.backlog;
  if (Array.isArray(data.approved)) return data.approved;
  return [];
}

function useCaseOf(item) {
  return item?.meta?.use_case || item?.meta?.useCase || item?.use_case || item?.useCase || null;
}

const taxonomy = readJson("data/intake/use_case_taxonomy.json");
const canonical = (taxonomy.required_use_cases || []).map(x => x && x.id).filter(Boolean);

if (!canonical.length) {
  throw new Error("QUERY COVERAGE FAIL: no required_use_cases[].id found in data/intake/use_case_taxonomy.json");
}

const backlogPath = fs.existsSync("data/backlog/build_backlog.json")
  ? "data/backlog/build_backlog.json"
  : "data/intake/build_backlog.json";

const backlog = asArray(readJson(backlogPath));
const covered = new Set(backlog.map(useCaseOf).filter(Boolean));
const missing = canonical.filter(id => !covered.has(id));

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/query_coverage_gaps.json", JSON.stringify({
  coverage_model: "taxonomy_backed_backlog_coverage_v3",
  taxonomy_source: "data/intake/use_case_taxonomy.json",
  backlog_source: backlogPath,
  canonical_use_cases: canonical.length,
  covered_use_cases: canonical.length - missing.length,
  uncovered_count: missing.length,
  uncovered_use_cases: missing
}, null, 2) + "\n");

if (missing.length) {
  throw new Error(`QUERY COVERAGE FAIL: ${missing.length} canonical use_cases uncovered. See reports/query_coverage_gaps.json`);
}

console.log(`QUERY COVERAGE PASS: ${canonical.length}/${canonical.length} canonical use_cases covered`);
