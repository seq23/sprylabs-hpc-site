#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { promote } = require('./authority/cluster_to_authority');
const { generate } = require('./authority/generate_whitepaper');

const ROOT = process.cwd();
const WHITEPAPERS_DIR = path.join(ROOT, 'whitepapers');

function paperPath(item){
  return path.join(WHITEPAPERS_DIR, `${item.slug}.html`);
}

function hasRenderedPaper(item){
  if (!item || !item.slug) return false;
  const file = paperPath(item);
  if (!fs.existsSync(file)) return false;
  const html = fs.readFileSync(file, 'utf8');
  return html.includes('direct-answer')
    && html.includes('cta-block')
    && html.includes(item.cta_target || '')
    && html.includes('id="CITATION_PAGE_SCHEMA"')
    && !html.includes('data-geo-semantic="true"');
}

function isEligible(item){
  if (!item || item.suppressed === true) return false;
  if (Number(item.authority_score || 0) >= 70) return true;
  if (Number(item.signal_count || 0) >= 25) return true;
  if (item.authority_ready === true) return true;
  return false;
}

function shouldRender(item){
  if (!item || !item.slug || !item.cluster_id) return false;

  // Released authority papers are part of the public contract. If the queue says
  // released but the rendered HTML was lost, omitted from a ZIP, or lacks the
  // required blocks, rebuild it instead of letting validation fail later.
  if (item.status === 'released') return !hasRenderedPaper(item);

  if (item.status === 'queued') return isEligible(item);

  return false;
}


function readJson(file, fallback){
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch { return fallback; }
}
function writeJson(file, payload){
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), {recursive:true});
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(payload, null, 2) + '\n');
}
// Admission used to be unconditional, and it fabricated the two fields the
// demand gate reads:
//
//   admission_level: 'baseline'                       // hardcoded for every page
//   primary_query: q?.query || item.title || slug     // invented from the title
//
// `baseline` means "admitted before the demand gate existed, never substantively
// checked". Stamping it on a page created today is a false statement about the
// page's history, and it is the level validate_programmatic_admission.py skips
// every quality check for. The `primary_query` fallback then invented a query
// from the paper's own title, so a page manufactured its own justification -
// and data/citation/query_registry.json mirrored that invented string back as
// though it were an observed query.
//
// validate_demand_backed_pages.mjs caught both, correctly, and the release went
// red daily. The validator was right; this writer was wrong.
//
// A page admitted after the sealed baseline must therefore carry a REGISTERED
// query and a real demand record, or it is not admitted at all. Refusing is a
// named stop, not a crash: the pre-gate papers keep the `baseline` level that is
// true of them, and anything new that cannot be honestly admitted is reported by
// name so it is fixed at creation instead of surfacing days later in CI.
function loadSealedBaselineRoutes(){
  const doc = readJson('data/demand/pre_gate_page_baseline.json', null);
  return new Set(Array.isArray(doc?.routes) ? doc.routes : []);
}
function loadDemandQueries(){
  const demand = readJson('data/demand/measured_demand.json', {records:[]});
  const set = new Set();
  for (const r of demand.records || []) {
    set.add(String(r.query_normalized || r.query || '').toLowerCase().trim());
    for (const a of r.aliases || []) set.add(String(a).toLowerCase().trim());
  }
  set.delete('');
  return set;
}

// The admissibility rule lives here once, because two callers need the SAME
// answer at two different moments: main() asks BEFORE rendering, and
// upsertReleasedAuthorityAdmission asks before writing the registry record.
//
// It used to be asked only at the second moment, and that left a hole the shape
// of the bug it was written to close. `generate()` writes whitepapers/<slug>.html
// to disk; admission runs afterwards and, on refusal, does `continue`. The HTML
// stays. So a paper the demand gate correctly refused was still a published page
// - on disk, in the tree the release lane commits - and now invisible to
// validate:demand-backed-pages, whose checks 2 and 3 walk the admission registry
// the refusal just kept it out of.
//
// That is strictly worse than the failure it replaced. The old writer admitted
// the page dishonestly and CI went red every day until someone fixed it. The
// refusal path publishes the same unbacked page and CI goes green. Refusing to
// render is the only refusal that actually refuses.
function admissionGate(){
  const queries = readJson('data/citation/query_registry.json', {queries:[]}).queries || [];
  const queryByPage = new Map(queries.filter(q => q && q.release_status === 'ACTIVE' && q.primary_page).map(q => [q.primary_page, q]));
  const sealed = loadSealedBaselineRoutes();
  const demandQueries = loadDemandQueries();

  // Returns null if the paper may be admitted, or a refusal record explaining
  // by name why it may not.
  function refuse(item){
    if (!item || !item.slug) return { path: 'whitepapers/<no slug>', reason: 'queue item carries no slug' };
    const rel = `whitepapers/${item.slug}.html`;
    const route = `/${rel}`;
    const q = queryByPage.get(rel);
    if (sealed.has(route)) return null; // pre-gate, exempt by the sealed baseline
    if (!q) {
      return { path: rel, reason: 'no ACTIVE entry in data/citation/query_registry.json; a primary_query invented from the paper title is the page justifying itself' };
    }
    if (!demandQueries.has(String(q.query || '').toLowerCase().trim())) {
      return { path: rel, query: q.query, reason: 'registered query has no record in data/demand/measured_demand.json, so nothing shows anyone searches for it' };
    }
    return null;
  }
  return { queryByPage, sealed, refuse };
}

function upsertReleasedAuthorityAdmission(queue, gate, refusedBeforeRender = []){
  const registry = readJson('data/content/page_admission_registry.json', {schema_version:'1.0', records:[]});
  const { queryByPage, sealed, refuse } = gate;
  const byPath = new Map((registry.records || []).map(record => [record.path, record]));
  let upserted = 0;
  const refused = [];
  for (const item of queue.items || []) {
    if (!item || item.status !== 'released' || !item.slug) continue;
    const rel = `whitepapers/${item.slug}.html`;
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const route = `/${rel}`;
    const q = queryByPage.get(rel);
    const isPreGate = sealed.has(route);

    const refusal = refuse(item);
    if (refusal) { refused.push(refusal); continue; }

    const primaryQuery = q?.query;
    if (!primaryQuery) {
      refused.push({ path: rel, reason: 'no registered query to admit the page under' });
      continue;
    }

    const record = {
      path: rel,
      route,
      canonical_domain: q?.canonical_domain || 'billionairehighperformancecoach.com',
      generation_lane: 'authority',
      // Truthful: `baseline` states "predates the demand gate", which is only
      // true of the sealed pre-gate set. Anything newer is admitted at `full`
      // and faces the substantive checks like every other post-gate page.
      admission_level: isPreGate ? 'baseline' : 'full',
      status: 'ADMITTED',
      primary_query: primaryQuery,
      query_aliases: q?.aliases || [],
      intent: q?.intent_class || 'concept',
      cluster: q?.observation_cluster || item.cluster_id || 'authority',
      framework: `${primaryQuery} Framework`,
      unique_atom: 'Authority whitepaper released by the governed Content Authority Pipeline from observed citation and social demand signals.',
      artifact_type: 'whitepaper',
      entity: null,
      use_case: null,
      comparison_entities: null,
      comparison_methodology: null,
      official_sources: null,
      conflict_disclosure: null,
      verified_at: null,
      health_adjacent: false,
      commercial_comparison: false,
      admitted_at: item.released_at || new Date().toISOString().slice(0,10),
      source: 'authority_paper_queue'
    };
    if (byPath.has(rel)) Object.assign(byPath.get(rel), record);
    else { registry.records.push(record); byPath.set(rel, record); }
    upserted += 1;
  }
  registry.records.sort((a,b) => a.path.localeCompare(b.path));
  registry.record_count = registry.records.length;
  registry.generated_at = new Date().toISOString();
  writeJson('data/content/page_admission_registry.json', registry);
  writeJson('artifacts/validation/authority-admission-gate.json', {
    generated_at: new Date().toISOString(),
    lane: 'authority-admission',
    status: (refused.length || refusedBeforeRender.length) ? 'NAMED_STOP' : 'PASS',
    admitted_count: upserted,
    refused_count: refused.length,
    refused,
    // Refused BEFORE generate() ran, so no HTML was written. This is the
    // preferred refusal: nothing is published that cannot be admitted.
    refused_before_render_count: refusedBeforeRender.length,
    refused_before_render: refusedBeforeRender,
    outcome: { code: 'ADMITTED', message: `${upserted} released authority paper(s) admitted against a registered query.` },
    stop_reason: refusedBeforeRender.length
      ? { code: 'AUTHORITY_PAPER_NOT_RENDERED_NOT_DEMAND_BACKED', message: `${refusedBeforeRender.length} promoted paper(s) were not rendered because they carry no demand-backed registered query. Nothing was written to disk, so nothing unadmitted was published. Register real demand for the query, or leave the cluster unpromoted.` }
      : refused.length
        ? { code: 'AUTHORITY_PAPER_NOT_DEMAND_BACKED', message: `${refused.length} released paper(s) were not admitted because they carry no demand-backed registered query. They are on disk but unadmitted; retire them or register real demand. Fabricating a primary_query from the title is what made the release red daily.` }
        : null,
  });
  return { upserted, refused };
}

function main(){
  const { queue, created } = promote();
  const gate = admissionGate();
  let rendered = 0;
  let skipped = 0;
  let repaired = 0;
  const refusedBeforeRender = [];

  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    if (!shouldRender(item)) {
      skipped += 1;
      return item;
    }

    // Do not put on disk what cannot be honestly admitted. A refusal after
    // rendering leaves the page published and unadmitted, which is the silent
    // version of the failure this gate exists to make loud.
    const refusal = gate.refuse(item);
    if (refusal) {
      refusedBeforeRender.push(refusal);
      skipped += 1;
      return item;
    }

    const wasReleased = item.status === 'released';
    const result = generate(item);
    rendered += 1;
    if (wasReleased) repaired += 1;
    return result.item;
  });

  queue.generated_at = new Date().toISOString();
  queue.policy = {
    ...(queue.policy || {}),
    trigger_based_authority: true,
    release_model: 'signal_threshold',
    min_authority_score: 70,
    min_signal_count: 25,
    calendar_release_is_fallback_only: true
  };

  const { upserted, refused } = upsertReleasedAuthorityAdmission(queue, gate, refusedBeforeRender);
  fs.writeFileSync('data/authority_paper_queue.json', JSON.stringify(queue, null, 2) + '\n');
  const detail = refused.length ? `; REFUSED ${refused.length} (not demand-backed: ${refused.map(r => r.path).join(', ')})` : '';
  const preDetail = refusedBeforeRender.length ? `; NOT RENDERED ${refusedBeforeRender.length} (${refusedBeforeRender.map(r => r.path).join(', ')})` : '';
  console.log(`authority: promoted ${created.length}; rendered ${rendered}; repaired ${repaired}; skipped ${skipped}; admitted ${upserted}${detail}${preDetail}`);
}

if (require.main === module) main();
