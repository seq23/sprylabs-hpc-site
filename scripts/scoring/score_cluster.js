const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function textOf(item) {
  return [
    item.query,
    item.title,
    item.name,
    item.cluster,
    item.cluster_id,
    item.intent,
    item.content_type,
    item.source,
    item.target_page
  ].filter(Boolean).join(" ").toLowerCase();
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function termScore(text, terms, high = 95, medium = 65, low = 35) {
  const hits = terms.filter(t => text.includes(String(t).toLowerCase())).length;
  if (hits >= 3) return high;
  if (hits === 2) return medium + 15;
  if (hits === 1) return medium;
  return low;
}

function fileList(dir, ext = ".html") {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function existingHtmlTextIndex() {
  return fileList(".")
    .slice(0, 1000)
    .map(file => {
      let text = "";
      try { text = fs.readFileSync(file, "utf8").toLowerCase(); } catch {}
      return { file, text };
    });
}

function scoreCannibalization(text, htmlIndex, collisionTerms, differentiators) {
  const collisionHits = collisionTerms.filter(t => text.includes(t.toLowerCase())).length;
  const differentiatorHits = differentiators.filter(t => text.includes(t.toLowerCase())).length;

  let existingHits = 0;
  for (const row of htmlIndex) {
    for (const term of collisionTerms) {
      if (text.includes(term.toLowerCase()) && row.text.includes(term.toLowerCase())) {
        existingHits++;
        break;
      }
    }
  }

  let risk = collisionHits * 18 + Math.min(existingHits, 5) * 8 - differentiatorHits * 18;
  return clamp(risk);
}

function scoreCluster(item, context = {}) {
  const weights = context.weights || readJson("data/scoring/weights.json", {});
  const conversionTerms = context.conversionTerms || readJson("data/scoring/conversion_intent_terms.json", {});
  const cannibalizationTerms = context.cannibalizationTerms || readJson("data/scoring/cannibalization_terms.json", {});
  const htmlIndex = context.htmlIndex || [];

  const text = textOf(item);
  const allConversionTerms = [
    ...(conversionTerms.high_intent || []),
    ...(conversionTerms.medium_intent || [])
  ];

  const sourceFrequency = clamp((item.source_count || item.sources?.length || item.query_count || 1) * 20);
  const conversionProximity = termScore(text, allConversionTerms, 95, 65, 25);
  const coverageGap = item.target_page ? 55 : 85;
  const authorityGraph = item.authority_target || item.pillar || item.cluster ? 80 : 45;
  const extractability = text.length >= 35 ? 80 : 45;
  const fanout = text.includes("vs") || text.includes("alternative") || text.includes("best") || text.includes("how to") ? 85 : 55;
  const freshness = String(item.source || "").includes("reddit") || String(item.generated_at || item.date || "").includes("2026") ? 80 : 55;
  const competitionOpportunity = text.includes("betterup") || text.includes("coachhub") || text.includes("culture amp") || text.includes("hone") || text.includes("torch") ? 90 : 55;

  const cannibalizationRisk = scoreCannibalization(
    text,
    htmlIndex,
    cannibalizationTerms.collision_terms || [],
    cannibalizationTerms.approved_differentiators || []
  );

  const weighted =
    sourceFrequency * (weights.source_frequency || 0.15) +
    conversionProximity * (weights.conversion_proximity || 0.20) +
    coverageGap * (weights.coverage_gap || 0.15) +
    authorityGraph * (weights.authority_graph || 0.15) +
    extractability * (weights.extractability || 0.15) +
    fanout * (weights.fanout || 0.10) +
    freshness * (weights.freshness || 0.05) +
    competitionOpportunity * (weights.competition_opportunity || 0.05);

  const penalties = weights.penalties || {};
  let penalty = 0;
  const penaltyReasons = [];

  if (cannibalizationRisk >= 80) {
    penalty += penalties.cannibalization_high || 30;
    penaltyReasons.push("high_cannibalization_risk");
  }
  if (sourceFrequency < 40) {
    penalty += penalties.thin_signal || 20;
    penaltyReasons.push("thin_signal");
  }
  if (conversionProximity < 60) {
    penalty += penalties.missing_conversion_path || 25;
    penaltyReasons.push("weak_conversion_path");
  }
  if (authorityGraph < 60) {
    penalty += penalties.missing_authority_target || 20;
    penaltyReasons.push("missing_authority_target");
  }

  const total = clamp(weighted - penalty);

  return {
    id: item.id || item.cluster_id || item.slug || text.slice(0, 48).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    query: item.query || item.title || item.name || item.cluster || "",
    target_page: item.target_page || item.page || null,
    score: total,
    approved: total >= ((weights.thresholds || {}).approved_min_total || 75),
    breakdown: {
      source_frequency: sourceFrequency,
      conversion_proximity: conversionProximity,
      coverage_gap: coverageGap,
      authority_graph: authorityGraph,
      extractability,
      fanout,
      freshness,
      competition_opportunity: competitionOpportunity,
      cannibalization_risk: cannibalizationRisk,
      penalty,
      penalty_reasons: penaltyReasons
    }
  };
}

function scoreItems(items) {
  const context = {
    weights: readJson("data/scoring/weights.json", {}),
    conversionTerms: readJson("data/scoring/conversion_intent_terms.json", {}),
    cannibalizationTerms: readJson("data/scoring/cannibalization_terms.json", {}),
    htmlIndex: existingHtmlTextIndex()
  };
  return items.map(item => scoreCluster(item, context));
}

module.exports = { scoreCluster, scoreItems };
