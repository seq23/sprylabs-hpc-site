// ONE quarantine ledger for pages the exact-agent lane CREATES, read by every
// writer that could put such a page on disk.
//
// ─── THE DEFECT THIS EXISTS FOR ────────────────────────────────────────────
//
// On 2026-09-19 (Spry Content Release run 35477412322, commit 3f0a52f7f) the
// exact-agent lane created insights/chatgpt-prompts-to-help-executive-coaches-scale.html
// and insights/how-to-use-chatgpt-as-your-life-and-leadership-coach.html from the
// same `comparison` template. Their extraction blocks were 76% identical. The
// release's own `validate:programmatic-admission` step ran AFTER they were written
// and reported PASS, because that validator judges the pages listed in
// data/content/page_admission_registry.json - and the two pages were not registered
// until `build:postprocess`, ninety seconds later, by
// apply_citation_program.sync_agent_page_admission_records(), which admits every
// generated agent page it finds on disk with no gate at all. The gate could not
// reach what it governed. The next Validate Repo on main read the now-registered
// pair and went red: "main-content similarity 0.764 exceeds 0.72".
//
// The fix is that a CREATED page is a CANDIDATE until the admission validator has
// judged it (scripts/agent_intake/admit_bhpc_agent_created_pages.mjs), and a
// rejected candidate is recorded HERE and removed from the tree before anything
// commits. Every writer that could re-create it reads this ledger:
//
//   build_bhpc_agent_exact_implementation_plan.mjs  - plans the spec as BLOCKED
//   apply_bhpc_agent_exact_implementation.mjs       - skips BLOCKED specs (already)
//   apply_citation_program.py                       - will not materialize or admit it
//
// A row is keyed by the page path AND a fingerprint of the spec that produced it.
// Curating the page (data/citation/agent_page_specs.json: h1 / framework /
// definition) changes the fingerprint, so the next release re-judges the page
// automatically. Changing the generator code does not change the fingerprint;
// delete the row to re-judge in that case.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const QUARANTINE_PATH = 'data/content/agent_page_quarantine.json';
export const QUARANTINE_LANE = 'agent_exact_implementation';

function empty() {
  return {
    schema_version: '1.0',
    updated_at: null,
    note: 'Pages the exact-agent lane created that failed validate:programmatic-admission as candidates. Keyed by path + spec fingerprint: curating the spec (h1/framework/definition) re-judges automatically; after a generator change delete the row to re-judge. Rows here are never published, registered, or materialized.',
    rows: [],
  };
}

export function readQuarantine(root = process.cwd()) {
  const abs = path.join(root, QUARANTINE_PATH);
  if (!fs.existsSync(abs)) return empty();
  const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!Array.isArray(doc.rows)) doc.rows = [];
  return doc;
}

export function writeQuarantine(doc, root = process.cwd()) {
  const abs = path.join(root, QUARANTINE_PATH);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  const out = {...empty(), ...doc, updated_at: new Date().toISOString()};
  out.rows = [...(doc.rows || [])].sort((a, b) => String(a.path).localeCompare(String(b.path)) || String(a.spec_fingerprint).localeCompare(String(b.spec_fingerprint)));
  fs.writeFileSync(abs, JSON.stringify(out, null, 2) + '\n');
  return out;
}

/**
 * The identity of "this page from this spec". Anything that changes the page's
 * curated content changes this; the acceptance ids tie it to the agent run.
 */
export function specFingerprint({path: pagePath, acceptanceIds = [], h1 = '', framework = '', type = '', definition = ''}) {
  const basis = JSON.stringify({
    path: String(pagePath || ''),
    acceptance_ids: [...new Set((acceptanceIds || []).map(String))].sort(),
    h1: String(h1 || ''),
    framework: String(framework || ''),
    type: String(type || ''),
    definition: String(definition || ''),
  });
  return crypto.createHash('sha256').update(basis).digest('hex');
}

/** The ledger row that blocks this exact page+spec, or null. */
export function quarantinedRow(doc, pagePath, fingerprint) {
  return (doc?.rows || []).find((row) => row.path === pagePath && row.spec_fingerprint === fingerprint) || null;
}

export function quarantineReason(row) {
  const sample = Array.isArray(row?.reasons) && row.reasons.length ? row.reasons[0] : 'rejected by validate:programmatic-admission';
  return `quarantined_by_admission_gate:${String(sample).slice(0, 220)}`;
}
