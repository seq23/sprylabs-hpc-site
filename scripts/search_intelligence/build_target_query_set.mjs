#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, stamp, id, PUBLIC, ROOT, ownerMap, canonicalFromHtml, stripHtml, tokenize } from './lib/core.mjs';
import { measuredQueries, readExports, pathKey, demandFamilyFiles, MEASURED_MIN_IMPRESSIONS } from './lib/measured_targets.mjs';

const universe = readJson('data/intake/query_universe.json', { queries: [] }).queries || [];
const owners = ownerMap();
const MAX = Number(process.env.SEARCH_INTELLIGENCE_MAX_TARGETS || 120);
const OUT = process.env.SEARCH_INTELLIGENCE_TARGET_OUT || 'data/search_intelligence/target_query_set.json';

const DEMAND_PAGES = demandFamilyFiles(ROOT);
const candidates = [];
for (const [rel, own] of owners.entries()) {
  if (!rel?.endsWith('.html')) continue;
  if (DEMAND_PAGES.has(rel)) continue; // rebuilt by apply_demand_families.py; a repair there does not survive build:all
  if (own?.owner === 'paid_agent' || own?.protected === true) continue;
  const file = path.join(PUBLIC, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1];
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1];
  const desc = (html.match(/<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["']/i) || [,''])[1];
  const route = own.route || ('/' + rel).replace(/index\.html$/, '');
  const canonical = canonicalFromHtml(html, route);
  const searchable = tokenize(`${route} ${stripHtml(title)} ${stripHtml(h1)} ${desc}`);
  candidates.push({ rel, route, canonical, owner: own.owner || 'legacy_eligible', searchable: new Set(searchable), title: stripHtml(title || h1) });
}
if (!candidates.length) throw new Error('no non-agent existing pages available for search intelligence');

function scorePage(query) {
  const qt = tokenize(`${query.query} ${query.use_case || ''} ${query.authority_target || ''} ${query.product_role || ''}`);
  let best = null;
  for (const p of candidates) {
    let score = 0;
    for (const t of qt) if (p.searchable.has(t)) score += t.length >= 8 ? 4 : 2;
    const route = p.route.toLowerCase();
    for (const t of qt) if (route.includes(t)) score += 2;
    if (query.intent === 'commercial_comparison' && /compar|alternative|vs-/.test(route)) score += 5;
    if (query.intent === 'instructional' && /answer|how-|guide|system|routine|framework/.test(route)) score += 2;
    if (!best || score > best.score || (score === best.score && p.route.length < best.page.route.length)) best = { score, page: p };
  }
  return best;
}

// Diversity first: round-robin across use cases, then highest source_count and stable query order.
const grouped = new Map();
for (const q of universe) {
  const key = String(q.authority_target || q.use_case || 'general');
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(q);
}
for (const arr of grouped.values()) arr.sort((a,b)=>(b.source_count||0)-(a.source_count||0)||String(a.query).localeCompare(String(b.query)));
const keys = [...grouped.keys()].sort();
// Measured first: every query Google showed us (lib/measured_targets.mjs), so the
// GSC export's exact-match filter keeps real rows. The universe fills the rest.
const measured = measuredQueries(readExports(ROOT));
const byPath = new Map(candidates.map((p) => [pathKey(p.route), p]));
const selected = []; const seen = new Set(); let round = 0;
for (const m of measured) {
  if (selected.length >= MAX) break;
  seen.add(m.query);
  selected.push({ query: m.query, intent: null, audience: null, use_case: null, source_type: 'gsc_measured',
    measured: { impressions_28d: m.impressions, clicks_28d: m.clicks, top_page: m.top_page || null },
    measured_page: byPath.get(pathKey(m.top_page)) || null });
}
const measuredCount = selected.length;
while (selected.length < MAX) {
  let added = false;
  for (const key of keys) {
    const q = grouped.get(key)?.[round];
    if (!q) continue;
    const norm = String(q.query || '').trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm); selected.push(q); added = true;
    if (selected.length >= MAX) break;
  }
  if (!added) break;
  round += 1;
}

const targets = selected.map((q) => {
  // A measured query keeps the page Google ranks for it when that page is ours to
  // repair (non-agent); otherwise it maps by relevance like every other target.
  const match = q.measured_page ? { page: q.measured_page, score: 100 } : scorePage(q);
  return {
    target_id: `si_${id(String(q.query).toLowerCase())}`,
    query: q.query,
    intent: q.intent || null,
    audience: q.audience || null,
    use_case: q.use_case || null,
    source_type: q.source_type || null,
    expected_owned_url: match.page.canonical,
    owned_route: match.page.route,
    owned_file: match.page.rel,
    ownership: match.page.owner,
    route_match_score: match.score,
    route_match_title: match.page.title,
    source: q.source_type === 'gsc_measured' ? 'google_search_console_measured_query' : 'data/intake/query_universe.json',
    ...(q.measured ? { measured: q.measured } : {})
  };
});
writeJson(OUT, {
  schema_version:'1.2', generated_at:stamp(), overall_status:'READY', status_is_healthy:true,
  target_count:targets.length, measured_target_count:measuredCount, measured_min_impressions:MEASURED_MIN_IMPRESSIONS,
  mapping_method:'gsc_measured_queries_first_then_query_universe_token_relevance', targets
});
console.log(`[search:targets] ${targets.length} (${measuredCount} measured by Search Console)`);
