#!/usr/bin/env node
/**
 * aplayermode.com's sitemap lastmod, derived from the page's CONTENT, never from
 * git commit dates (any automated touch - a Clarity loader, a registry stamp,
 * a bulk stamp commit - moves a commit date without changing the page).
 *
 * Content = the visible text of <body> (scripts, styles, comments, markup and
 * the whole <head> excluded), hashed by the one definition in
 * scripts/lib/sitemap_ledger.mjs. The record data/sitemap/aplayermode_lastmod.json
 * holds { content_hash, lastmod }; it changes only when the hash changes, and
 * aplayermode/sitemap.xml's <lastmod> is written from it.
 *
 *   node scripts/aplayermode_sitemap_lastmod.mjs          re-derive (writes record + sitemap)
 *   node scripts/aplayermode_sitemap_lastmod.mjs --check  exit 1 if either would change
 *
 * Guard: scripts/validators/validate_aplayermode_landing.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentHash } from './lib/sitemap_ledger.mjs';

export const PAGE = process.env.APM_LANDING_PAGE || 'aplayermode/index.html';
export const SITEMAP = process.env.APM_SITEMAP || 'aplayermode/sitemap.xml';
export const RECORD = process.env.APM_LASTMOD_RECORD || 'data/sitemap/aplayermode_lastmod.json';

export const bodyOf = (html) => { const m = String(html).match(/<body\b[^>]*>([\s\S]*)<\/body>/i); return m ? m[1] : String(html); };
export const pageContentHash = (html) => contentHash(bodyOf(html));
export const withLastmod = (xml, date) => xml.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`);

export function derive(root = process.cwd(), today = new Date().toISOString().slice(0, 10)) {
  const hash = pageContentHash(fs.readFileSync(path.join(root, PAGE), 'utf8'));
  let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8')); } catch {}
  const record = rec && rec.content_hash === hash ? rec : { page: PAGE, content_hash: hash, lastmod: today };
  const sitemap = fs.readFileSync(path.join(root, SITEMAP), 'utf8');
  return { record, recordChanged: record !== rec, sitemap: withLastmod(sitemap, record.lastmod), sitemapBefore: sitemap };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = derive();
  const dirty = d.recordChanged || d.sitemap !== d.sitemapBefore;
  if (process.argv.includes('--check')) {
    if (dirty) { console.error(`[aplayermode-lastmod] FAIL ${RECORD} / ${SITEMAP} are stale for the current content of ${PAGE}; run node scripts/aplayermode_sitemap_lastmod.mjs`); process.exit(1); }
    console.log(`[aplayermode-lastmod] OK ${d.record.content_hash} -> ${d.record.lastmod}`);
  } else {
    if (d.recordChanged) { fs.mkdirSync(path.dirname(RECORD), { recursive: true }); fs.writeFileSync(RECORD, JSON.stringify(d.record, null, 2) + '\n'); }
    if (d.sitemap !== d.sitemapBefore) fs.writeFileSync(SITEMAP, d.sitemap);
    console.log(`[aplayermode-lastmod] ${dirty ? 'updated' : 'unchanged'} ${d.record.content_hash} -> ${d.record.lastmod}`);
  }
}
