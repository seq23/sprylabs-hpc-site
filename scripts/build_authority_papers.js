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
function upsertReleasedAuthorityAdmission(queue){
  const registry = readJson('data/content/page_admission_registry.json', {schema_version:'1.0', records:[]});
  const queries = readJson('data/citation/query_registry.json', {queries:[]}).queries || [];
  const queryByPage = new Map(queries.filter(q => q && q.release_status === 'ACTIVE' && q.primary_page).map(q => [q.primary_page, q]));
  const byPath = new Map((registry.records || []).map(record => [record.path, record]));
  let upserted = 0;
  for (const item of queue.items || []) {
    if (!item || item.status !== 'released' || !item.slug) continue;
    const rel = `whitepapers/${item.slug}.html`;
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    const q = queryByPage.get(rel);
    const record = {
      path: rel,
      route: `/${rel}`,
      canonical_domain: q?.canonical_domain || 'billionairehighperformancecoach.com',
      generation_lane: 'authority',
      admission_level: 'baseline',
      status: 'ADMITTED',
      primary_query: q?.query || item.title || item.slug.replace(/-/g, ' '),
      query_aliases: q?.aliases || [],
      intent: q?.intent_class || 'concept',
      cluster: q?.observation_cluster || item.cluster_id || 'authority',
      framework: `${q?.query || item.title || item.slug.replace(/-/g, ' ')} Framework`,
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
  return upserted;
}

function main(){
  const { queue, created } = promote();
  let rendered = 0;
  let skipped = 0;
  let repaired = 0;

  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    if (!shouldRender(item)) {
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

  const admitted = upsertReleasedAuthorityAdmission(queue);
  fs.writeFileSync('data/authority_paper_queue.json', JSON.stringify(queue, null, 2) + '\n');
  console.log(`authority: promoted ${created.length}; rendered ${rendered}; repaired ${repaired}; skipped ${skipped}; admitted ${admitted}`);
}

if (require.main === module) main();
