#!/usr/bin/env node
/**
 * aplayermode.com's sitemap, derived from each page's CONTENT, never from git
 * commit dates (any automated touch - a Clarity loader, a registry stamp, a bulk
 * stamp commit - moves a commit date without changing the page).
 *
 * Content = the visible text of <body> (scripts, styles, comments, markup and
 * the whole <head> excluded), hashed by the one definition in
 * scripts/lib/sitemap_ledger.mjs. The record data/sitemap/aplayermode_lastmod.json
 * holds one { page, content_hash, lastmod } per URL in PAGES; each entry changes
 * only when that page's hash changes, and aplayermode/sitemap.xml is written
 * from the record - the whole file, in PAGES order, so a page added here appears
 * in the sitemap and one removed here leaves it.
 *
 * The About page joined on 25 Oct 2026 (Search Readiness c6): an answer engine
 * needs a publisher it can cite, and the page it cites has to be crawlable.
 *
 *   node scripts/aplayermode_sitemap_lastmod.mjs          re-derive (writes record + sitemap)
 *   node scripts/aplayermode_sitemap_lastmod.mjs --check  exit 1 if either would change
 *
 * Guard: scripts/validators/validate_aplayermode_landing.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from './lib/sitemap_ledger.mjs';

export const SITEMAP = process.env.APM_SITEMAP || 'aplayermode/sitemap.xml';
export const RECORD = process.env.APM_LASTMOD_RECORD || 'data/sitemap/aplayermode_lastmod.json';
export const ORIGIN = 'https://aplayermode.com';

/** Every page aplayermode.com publishes, in sitemap order. The landing page is first. */
export const PAGES = Object.freeze([
  { loc: `${ORIGIN}/`, page: process.env.APM_LANDING_PAGE || 'aplayermode/index.html' },
  { loc: `${ORIGIN}/about/`, page: 'aplayermode/about.html' },
]);
/** Kept for readers that want the landing page alone. */
export const PAGE = PAGES[0].page;

export const bodyOf = (html) => { const m = String(html).match(/<body\b[^>]*>([\s\S]*)<\/body>/i); return m ? m[1] : String(html); };
export const pageContentHash = (html) => contentHash(bodyOf(html));

/** The whole sitemap, from the record: one <url> per entry, in order. */
export const buildSitemap = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;

/** The record entry for one page, keeping its recorded date while its content hash is unchanged. */
export const entryFor = (previous, { loc, page }, hash, today) => {
  const was = (previous ?? []).find((e) => e.page === page);
  return was && was.content_hash === hash ? { ...was, loc } : { page, loc, content_hash: hash, lastmod: today };
};

/** Accepts the pre-25-Oct-2026 single-page record shape as well as the list. */
export const entriesOf = (rec) => {
  if (Array.isArray(rec?.pages)) return rec.pages;
  if (rec?.page && rec?.content_hash) return [{ page: rec.page, loc: PAGES[0].loc, content_hash: rec.content_hash, lastmod: rec.lastmod }];
  return [];
};

export function derive(root = process.cwd(), today = new Date().toISOString().slice(0, 10)) {
  let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8')); } catch { /* first run */ }
  const previous = entriesOf(rec);
  const pages = PAGES.map((p) => entryFor(previous, p, pageContentHash(fs.readFileSync(path.join(root, p.page), 'utf8')), today));
  const record = { pages };
  const sitemapBefore = fs.readFileSync(path.join(root, SITEMAP), 'utf8');
  return { record, recordChanged: JSON.stringify(rec) !== JSON.stringify(record), sitemap: buildSitemap(pages), sitemapBefore };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = derive();
  const dirty = d.recordChanged || d.sitemap !== d.sitemapBefore;
  const summary = d.record.pages.map((e) => `${e.page} ${e.content_hash} -> ${e.lastmod}`).join('; ');
  if (process.argv.includes('--check')) {
    if (dirty) { console.error(`[aplayermode-lastmod] FAIL ${RECORD} / ${SITEMAP} are stale for the current content (${summary}); run node scripts/aplayermode_sitemap_lastmod.mjs`); process.exit(1); }
    console.log(`[aplayermode-lastmod] OK ${summary}`);
  } else {
    if (d.recordChanged) { fs.mkdirSync(path.dirname(RECORD), { recursive: true }); fs.writeFileSync(RECORD, JSON.stringify(d.record, null, 2) + '\n'); }
    if (d.sitemap !== d.sitemapBefore) fs.writeFileSync(SITEMAP, d.sitemap);
    console.log(`[aplayermode-lastmod] ${dirty ? 'updated' : 'unchanged'} ${summary}`);
  }
}
