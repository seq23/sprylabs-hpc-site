const fs = require("fs");

const scorePath = "data/intake/query_scores.json";
const weightsPath = "data/scoring/weights.json";

if (!fs.existsSync(weightsPath)) {
  throw new Error(`missing scoring weights: ${weightsPath}`);
}

if (!fs.existsSync(scorePath)) {
  throw new Error(`missing query scores: ${scorePath}`);
}

const scores = JSON.parse(fs.readFileSync(scorePath, "utf8"));
const items = Array.isArray(scores) ? scores : scores.items || [];

if (!items.length) {
  throw new Error("scoring contract failed: no scored items");
}

const requiredBreakdown = [
  "source_frequency",
  "conversion_proximity",
  "coverage_gap",
  "authority_graph",
  "extractability",
  "fanout",
  "freshness",
  "competition_opportunity",
  "cannibalization_risk",
  "penalty",
  "penalty_reasons"
];

for (const item of items) {
  if (typeof item.score !== "number") {
    throw new Error(`scoring contract failed: item missing numeric score: ${item.id || item.query}`);
  }

  if (!item.breakdown || typeof item.breakdown !== "object") {
    throw new Error(`scoring contract failed: item missing score breakdown: ${item.id || item.query}`);
  }

  for (const key of requiredBreakdown) {
    if (!(key in item.breakdown)) {
      throw new Error(`scoring contract failed: missing breakdown key ${key} on ${item.id || item.query}`);
    }
  }

  if (item.approved && item.breakdown.conversion_proximity < 60) {
    throw new Error(`scoring contract failed: approved item has weak conversion proximity: ${item.id || item.query}`);
  }

  if (item.approved && item.breakdown.extractability < 70) {
    throw new Error(`scoring contract failed: approved item has weak extractability: ${item.id || item.query}`);
  }

  if (item.approved && item.breakdown.cannibalization_risk >= 80) {
    throw new Error(`scoring contract failed: approved item has high cannibalization risk: ${item.id || item.query}`);
  }
}

console.log(`SCORING CONTRACT PASS: ${items.length} scored items checked`);
