// ONE reader of data/demand/measured_demand.json for every stage that asks
// "does this query have a demand record?", so the gate that refuses a page and
// the planner that would create it cannot disagree about what counts.
//
// ─── THE DEFECT THIS EXISTS FOR ────────────────────────────────────────────
//
// Spry Content Release run 35477412322 (commit 3f0a52f7f, 2026-09-20 00:09Z)
// created three insights pages through agent:bhpc:apply-exact from the
// 2026-09-19 bhpc artifact - "ChatGPT prompts for managers", "ChatGPT prompts to
// help executive coaches scale", "how to use ChatGPT as your life and leadership
// coach" - and build:postprocess registered them ADMITTED. None of the three
// queries has a record here. The demand gate
// (scripts/validation/validate_demand_backed_pages.mjs) then failed every Spry
// Content Release on main from 14:23Z on: "3 page(s) admitted after the demand
// gate have no record in data/demand/measured_demand.json".
//
// The gate was right and it was too late: it judges the registry, and the
// registry is written after the page is on disk. The same class as the
// admission-gate incident (scripts/lib/agent_page_quarantine.mjs) - a guard that
// cannot reach what it governs. The 2026-09-12 artifact had already produced the
// three `bhpc_agent_discovery` records that fill the shrink-only ceiling, so the
// "record a discovery" path is closed by design and the planner has no honest
// way to create a page for an unmeasured query.
//
// So the question is asked BEFORE the page exists:
// build_bhpc_agent_exact_implementation_plan.mjs plans a CREATE_NEW_TARGET_PAGE
// whose query has no record as BLOCKED `no_measured_demand`, and the applier and
// apply_citation_program.py skip it as they skip every BLOCKED spec. The block
// lifts on its own the moment a record exists - a measured one, or an
// `owner_approved_seed` with a real approved_by, which is the owner's decision
// and which no script here writes for her.
import fs from 'node:fs';
import path from 'node:path';

export const MEASURED_DEMAND_PATH = 'data/demand/measured_demand.json';

export function normalizeDemandQuery(value) {
  return String(value ?? '').toLowerCase().trim();
}

/**
 * The set of normalized queries (and aliases) that carry a demand record.
 * A missing file yields an EMPTY set - no record, no demand - never a pass.
 */
export function measuredDemandQueries(root = process.cwd()) {
  const abs = path.join(root, MEASURED_DEMAND_PATH);
  const queries = new Set();
  if (!fs.existsSync(abs)) return queries;
  const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const r of doc.records || []) {
    const q = normalizeDemandQuery(r.query_normalized || r.query);
    if (q) queries.add(q);
    for (const a of r.aliases || []) {
      const alias = normalizeDemandQuery(a);
      if (alias) queries.add(alias);
    }
  }
  return queries;
}

export function hasMeasuredDemand(queries, query) {
  const q = normalizeDemandQuery(query);
  return Boolean(q) && queries.has(q);
}

/** The BLOCKED reason the planner writes; the self-test and runbook name it. */
export const NO_MEASURED_DEMAND_REASON = 'no_measured_demand';
export function noMeasuredDemandReason(query) {
  return `${NO_MEASURED_DEMAND_REASON}:"${String(query ?? '').trim()}" has no record in ${MEASURED_DEMAND_PATH}; a created page must answer measured demand or an owner_approved_seed with approved_by, and that approval is the owner's to give`;
}
