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

/**
 * THE DERIVATION RECEIPT.
 *
 * validate_lastmod_ledger_final.mjs has an arm B - "a ledger re-derived in this
 * run must fit the tree" - and it used to decide whether a derivation had
 * happened by asking whether the ledger on disk differs from the one committed
 * at HEAD. That is a proxy, and it is wrong in exactly one case: when the
 * re-derivation is a legitimate no-op because the committed ledger is already
 * correct. The derivation ran, produced the identical bytes, and the proxy
 * concluded it had not run at all.
 *
 * In `pending` scope that is not a missed check, it is a hard failure - the mode
 * REQUIRES arm B to have run - so a correct no-op turned the release lane red.
 * Observed on run 33728997404, where the very next command after the derivation
 * failed with "pending scope ran without re-deriving the ledger (arm B did not
 * run)".
 *
 * So the derivation now records the fact instead of leaving it to be inferred.
 * The receipt carries the sha256 of the ledger text the derivation left on disk;
 * a reader trusts it only while that hash still matches the ledger it can see,
 * which is what keeps a stale receipt from standing in for a derivation that
 * did not happen.
 */
export const LEDGER_RECEIPT_PATH = 'artifacts/validation/lastmod-derivation-receipt.json';

export const ledgerTextHash = (text) =>
  crypto.createHash('sha256').update(text ?? '', 'utf8').digest('hex');

export function writeLedgerDerivationReceipt(ledgerText, extra = {}) {
  const receipt = {
    schema_version: '1.0',
    receipt: 'lastmod-ledger-derivation',
    generated_at: new Date().toISOString(),
    ledger: LEDGER_PATH,
    ledger_sha256: ledgerTextHash(ledgerText),
    ...extra,
  };
  const file = path.join(ROOT, LEDGER_RECEIPT_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

/**
 * True when the ledger currently on disk is the one a derivation produced.
 * A receipt whose hash no longer matches describes a ledger that something has
 * since replaced, and is refused - it proves nothing about what is there now.
 */
export function ledgerDerivationReceipt(ledgerTextOnDisk) {
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER_RECEIPT_PATH), 'utf8')); } catch { return null; }
  if (!receipt || typeof receipt.ledger_sha256 !== 'string') return null;
  if (ledgerTextOnDisk === null || ledgerTextOnDisk === undefined) return null;
  return receipt.ledger_sha256 === ledgerTextHash(ledgerTextOnDisk) ? receipt : null;
}
