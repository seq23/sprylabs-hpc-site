// Measured queries for the target set: the queries Google actually shows.
//
// The target set used to come only from data/intake/query_universe.json, and the
// GSC export keeps only rows whose query is an exact target. On 25 Oct 2026 that
// filter matched 0 of 124 real rows across both hosts (filter_discarded_every_row),
// so the whole loop reasoned about nothing. The builder now puts every query
// Google measured (>= MEASURED_MIN_IMPRESSIONS over 28 days) first and fills the
// rest of the set from the universe.
import fs from 'node:fs';
import path from 'node:path';

export const MEASURED_MIN_IMPRESSIONS = 2;
export const EXPORT_FILES = [
  'data/search_intelligence/provider_inputs/gsc_bhpc.json',
  'data/search_intelligence/provider_inputs/gsc_spry.json',
];

// One query's rollup from one export. Exports written before measured_queries
// existed still carry the matched rows and the top discarded sample.
function rollup(doc) {
  if (Array.isArray(doc?.measured_queries)) return doc.measured_queries;
  const out = new Map();
  for (const r of [...(doc?.rows || []), ...(doc?.target_query_filter?.discarded_sample || [])]) {
    const q = String(r.query || '').trim().toLowerCase();
    if (!q) continue;
    const m = out.get(q) || { query: q, impressions: 0, clicks: 0, top_page: r.page, _top: -1 };
    m.impressions += Number(r.impressions || 0);
    m.clicks += Number(r.clicks || 0);
    if (Number(r.impressions || 0) > m._top) { m.top_page = r.page; m._top = Number(r.impressions || 0); }
    out.set(q, m);
  }
  return [...out.values()];
}

/** Measured queries across exports, highest impressions first, deduplicated. */
export function measuredQueries(docs, min = MEASURED_MIN_IMPRESSIONS) {
  const all = new Map();
  for (const doc of docs) {
    for (const m of rollup(doc)) {
      const q = String(m.query || '').trim().toLowerCase();
      if (!q) continue;
      const cur = all.get(q) || { query: q, impressions: 0, clicks: 0, top_page: m.top_page, _best: -1 };
      cur.impressions += Number(m.impressions || 0);
      cur.clicks += Number(m.clicks || 0);
      if (Number(m.impressions || 0) > cur._best) { cur.top_page = m.top_page; cur._best = Number(m.impressions || 0); }
      all.set(q, cur);
    }
  }
  return [...all.values()].filter((m) => m.impressions >= min)
    .map(({ _best, ...m }) => m)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.query.localeCompare(b.query));
}

export function readExports(root = process.cwd(), files = EXPORT_FILES) {
  return files.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f))
    .map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

/** Path key shared by a measured page URL and a site route: no host, no .html, no trailing slash. */
export function pathKey(urlOrRoute) {
  let p = String(urlOrRoute || '');
  try { if (/^https?:/i.test(p)) p = new URL(p).pathname; } catch { /* keep as is */ }
  p = p.replace(/index\.html$/i, '').replace(/\.html$/i, '').replace(/\/+$/, '');
  return (p || '/').toLowerCase();
}

/**
 * Files rebuilt by apply_demand_families.py on every build:all. Their title, meta
 * and FAQ are governed there, so a search-intelligence repair on them is stripped
 * by the next build and the ledger then claims a block that is gone (main went red
 * on executive-coach-cost/index.html, 25 Oct 2026). The target set never maps a
 * target onto these pages.
 */
export function demandFamilyFiles(root = process.cwd()) {
  const dir = path.join(root, 'data/search_intelligence');
  const out = new Set();
  let hosts = [];
  try { hosts = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const h of hosts) {
    const f = path.join(dir, h, 'demand_families.json');
    if (!fs.existsSync(f)) continue;
    let doc; try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const fam of doc.families || []) {
      const file = fam?.primary_page?.file;
      if (file) { out.add(file); out.add(file.replace(/\.html$/, '/index.html')); out.add(file.replace(/\/index\.html$/, '.html')); }
    }
  }
  return out;
}
