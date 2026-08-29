/**
 * The one definition of "what a page's content is" for lastmod purposes.
 *
 * Two programs have to agree on this byte for byte: the generator that derives
 * data/sitemap/lastmod_ledger.json, and the guard that asserts the committed
 * ledger still describes the tree. When they were separate copies, a divergence
 * between them would have read exactly like a stale ledger, and an earlier
 * investigation had to spend its time ruling that out before it could look at
 * the real defect. Sharing the code makes that class of doubt unavailable.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = process.cwd();
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The visible text of a page. Markup, scripts and styles are excluded on
 *  purpose: a reserialization is not a content change. */
export function visibleText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const contentHash = (html) =>
  crypto.createHash('sha256').update(visibleText(html)).digest('hex').slice(0, 24);

export function sitemapFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.build|\.pages-output|dist)$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sitemapFiles(full, out);
    else if (/^sitemap.*\.xml$/i.test(e.name)) out.push(full);
  }
  return out;
}

/** The file on disk a sitemap <loc> refers to, relative to ROOT, or '' if none. */
export function fileForLoc(loc) {
  const rel = String(loc).replace(/^https?:\/\/[^/]+\/?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const candidates = rel ? [`${rel}/index.html`, `${rel}.html`, rel] : ['index.html'];
  for (const c of candidates) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return c;
  }
  return '';
}

/** Every sitemap in the tree, parsed into {file, rel, text, entries[{loc,lastmod}]}. */
export function parseSitemaps() {
  return sitemapFiles().map((sm) => {
    const text = fs.readFileSync(sm, 'utf8');
    const entries = [...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
      loc: (m[1].match(/<loc>(.*?)<\/loc>/) || [])[1] || '',
      lastmod: (m[1].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
    })).filter((e) => e.loc);
    return { file: sm, rel: path.relative(ROOT, sm), text, entries };
  });
}

export const LEDGER_PATH = process.env.SITEMAP_LASTMOD_LEDGER || 'data/sitemap/lastmod_ledger.json';

export function readLedger(file = LEDGER_PATH) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); } catch { return null; }
}
