#!/usr/bin/env node
/**
 * Guards the three book-attribution landing pages behind the published Kindle
 * titles, and the /amazon/ index that sits above them.
 *
 * WHY THIS EXISTS
 *
 * Three finished books carry a hard-coded, unchangeable-after-print link to
 * /amazon/<slug>. A reader who follows one has already paid for the book; the
 * page they land on is the first thing they see after finishing it. There is no
 * second chance at that impression and no way to edit the link out of a copy
 * already sold.
 *
 * The failure this prevents is specific and has already happened once on this
 * property: the three paths answered HTTP 200 while no page existed. Every path
 * on aplayermode.com - including "/" and slugs that were never real - 301'd to a
 * single generic download page on another domain, so a status check reported
 * 200, three books' worth of readers would have landed on the same generic
 * offer, and per-book attribution was impossible because all three collapsed to
 * one URL. A 200 proved only that a redirect chain terminated somewhere.
 *
 * So this validator never asks whether a path resolves. It asks whether a real,
 * book-specific page is committed at that path, whether it still says what it
 * has to say, and whether it still leads somewhere a reader can actually buy.
 *
 * WHAT IT ASSERTS
 *
 *   1. All four pages exist as committed files.
 *   2. Each carries substantive content, not a template body - measured as
 *      visible words inside <main>, against a floor.
 *   3. Each is about ITS OWN book. Three distinct problems; a reader arriving
 *      from one specific book must not be dumped on generic copy. Enforced two
 *      ways: the page names its own book, and no two pages may be near
 *      duplicates of each other.
 *   4. Each links to a product URL that exists.
 *   5. Attribution is wired: the analytics loader is present and every page has
 *      a distinct canonical path and page key, so the hosts that serve these
 *      record them as distinct paths. This is the entire reason the /amazon/
 *      prefix exists.
 *   6. The deliberate indexing decision holds: noindex, and absent from every
 *      sitemap. Attribution is only clean while these pages receive book
 *      traffic and nothing else, so an organic ranking would corrupt the
 *      measurement the prefix exists to provide.
 *   7. No clinical claim. These titles concern discipline, executive function
 *      and ADHD. The pages must not diagnose and must not promise a clinical
 *      outcome; where a page is health-adjacent it must carry the boundary
 *      block.
 *   8. Rule 0: examining zero pages is a failure, not a pass.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = 'amazon';
const LABEL = '[validate:amazon-book-landing]';

// The books, and the phrase each page must contain to prove it is about its own
// subject rather than generic copy.
const BOOKS = [
  { slug: 'monk-mode', book: 'Monk Mode', must_mention: ['Monk Mode', 'suspension list'] },
  { slug: 'executive-dysfunction-field-manual', book: 'The Executive Dysfunction Field Manual', must_mention: ['Executive Dysfunction Field Manual', 'working memory'] },
  { slug: 'task-paralysis', book: 'Task Paralysis', must_mention: ['Task Paralysis', 'restart note'] },
];

// Products that exist. A page may only link to one of these.
const KNOWN_PRODUCTS = ['https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'];

const MIN_WORDS = 600;
const MIN_INDEX_WORDS = 120;
// Two pages sharing more than this fraction of their distinctive vocabulary are
// treated as the same page wearing two names.
const MAX_SIMILARITY = 0.62;

// Claims that must never appear. These are about outcome guarantees and
// diagnosis, not about the mere mention of a condition.
const CLINICAL_PATTERNS = [
  /\bcures?\b/i, /\bcuring\b/i,
  /\btreats?\b(?!\s+(it|them|the\s+step))/i, /\btreatment for\b/i,
  /\bdiagnos(e|es|ing|is of)\b/i,
  /\bclinically (proven|validated|tested)\b/i,
  /\bmedically (proven|approved)\b/i,
  /\b(eliminates?|removes?|reverses?|fixes)\s+(your\s+)?(adhd|anxiety|depression|executive dysfunction)\b/i,
  /\bguarantee[sd]?\b/i,
  /\bwill (cure|heal|eliminate)\b/i,
  /\breplaces? (therapy|medication|your (doctor|therapist))\b/i,
];
// Sentences that exist precisely to deny a clinical claim are not violations.
const CLINICAL_NEGATION = /\b(does not|do not|not a|never|cannot|is not|are not|rather than|without)\b/i;

// A page whose visible text raises these must carry the boundary block.
const HEALTH_KEYWORDS = /\b(adhd|therapist|therapy|burnout|brain fog|mental health|mental-health)\b/i;

const errors = [];
const rows = [];

function visibleText(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return (m ? m[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const words = (t) => t.split(/\s+/).filter(Boolean);

function tokenSet(text) {
  return new Set(words(text.toLowerCase().replace(/[^a-z\s]/g, ' ')).filter((w) => w.length > 4));
}
function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function read(rel) {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function checkClinical(where, text) {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const re of CLINICAL_PATTERNS) {
      if (re.test(sentence) && !CLINICAL_NEGATION.test(sentence)) {
        errors.push(`${where}: possible clinical or outcome-guarantee claim matching ${re} — "${sentence.trim().slice(0, 160)}". These titles concern ADHD and executive function; the pages describe a process and must not diagnose or promise a clinical result.`);
      }
    }
  }
}

// --- 1. the index ------------------------------------------------------------
const indexHtml = read(`${DIR}/index.html`);
if (!indexHtml) {
  errors.push(`${DIR}/index.html is missing. /amazon/ must answer with an index: a reader who trims the URL printed in a book has to land somewhere that explains what they found. Silently 404ing a path advertised inside a paid product is not acceptable.`);
} else {
  const t = visibleText(indexHtml);
  const n = words(t).length;
  rows.push({ page: `${DIR}/index.html`, words: n });
  if (n < MIN_INDEX_WORDS) errors.push(`${DIR}/index.html has ${n} visible words, below the floor of ${MIN_INDEX_WORDS}.`);
  for (const b of BOOKS) {
    if (!indexHtml.includes(`/amazon/${b.slug}/`)) errors.push(`${DIR}/index.html does not link to /amazon/${b.slug}/, so that book is unreachable from the index above it.`);
  }
  if (!/noindex/i.test(indexHtml)) errors.push(`${DIR}/index.html is not noindex.`);
  checkClinical(`${DIR}/index.html`, t);
}

// --- 2. the three book pages -------------------------------------------------
const texts = new Map();
let examined = 0;

for (const b of BOOKS) {
  const rel = `${DIR}/${b.slug}/index.html`;
  const html = read(rel);
  if (!html) {
    errors.push(`${rel} is missing. A published book carries a hard-coded link to /amazon/${b.slug} that cannot be edited after sale; this file is the only thing standing between that link and a dead end.`);
    continue;
  }
  examined += 1;
  const t = visibleText(html);
  const n = words(t).length;
  texts.set(b.slug, t);
  const row = { page: rel, words: n, book: b.book };

  // substantive content, not a template body
  if (n < MIN_WORDS) {
    errors.push(`${rel} has ${n} visible words, below the floor of ${MIN_WORDS}. A page that only describes what it should say is the failure this guard exists to catch.`);
  }

  // about its own book
  for (const phrase of b.must_mention) {
    if (!new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) {
      errors.push(`${rel} never mentions "${phrase}". A reader arrives here having just finished ${b.book}; generic copy is the failure mode this page exists to avoid.`);
    }
  }

  // a real path to purchase
  const links = [...html.matchAll(/href="(https:\/\/[^"]*gumroad\.com[^"]*)"/gi)].map((m) => m[1]);
  if (links.length === 0) {
    errors.push(`${rel} contains no product link, so a reader who finished the book has no path to purchase.`);
  }
  for (const l of links) {
    if (!KNOWN_PRODUCTS.includes(l)) {
      errors.push(`${rel} links to ${l}, which is not a product known to exist. Verify the product resolves before shipping a link to it inside a book.`);
    }
  }
  row.product = links[0] || null;

  // attribution
  if (!/data-clarity-loader/.test(html)) {
    errors.push(`${rel} has no analytics loader, so arrivals from ${b.book} are not recorded and the /amazon/ prefix buys nothing.`);
  }
  const canon = (html.match(/<link href="([^"]+)" rel="canonical"/i) || [])[1];
  if (!canon || !canon.includes(`/amazon/${b.slug}`)) {
    errors.push(`${rel} has canonical "${canon || 'none'}", which does not carry the per-book path /amazon/${b.slug}. Distinct paths per book are the whole point of the prefix.`);
  }
  row.canonical = canon || null;
  const key = (html.match(/data-page-key="([^"]+)"/) || [])[1];
  if (!key || key === 'download') {
    errors.push(`${rel} has page key "${key || 'none'}"; each book page needs its own key so the three are distinguishable in analytics.`);
  }

  // indexing decision
  if (!/name="robots"[^>]*noindex|noindex[^>]*name="robots"/i.test(html)) {
    errors.push(`${rel} is not noindex. These pages are deliberately excluded from search: if they ranked, book traffic and organic traffic would mix and the per-book attribution would be unreadable.`);
  }

  // health boundary + clinical claims
  if (HEALTH_KEYWORDS.test(t) && !/data-health-boundary="true"/.test(html)) {
    errors.push(`${rel} is health-adjacent (its visible text raises ${(t.match(HEALTH_KEYWORDS) || [])[0]}) but carries no boundary block stating the page is non-diagnostic and naming the condition for seeking professional help.`);
  }
  checkClinical(rel, t);

  rows.push(row);
}

// --- 3. the three pages must not be the same page ----------------------------
const slugs = [...texts.keys()];
for (let i = 0; i < slugs.length; i += 1) {
  for (let j = i + 1; j < slugs.length; j += 1) {
    const sim = jaccard(tokenSet(texts.get(slugs[i])), tokenSet(texts.get(slugs[j])));
    if (sim > MAX_SIMILARITY) {
      errors.push(`${slugs[i]} and ${slugs[j]} share ${(sim * 100).toFixed(1)}% of their distinctive vocabulary (ceiling ${(MAX_SIMILARITY * 100).toFixed(0)}%). Monk Mode, executive dysfunction and task paralysis are three different problems; if the pages read the same, the reader was dumped on a generic offer.`);
    }
  }
}

// --- 4. deliberately absent from every sitemap -------------------------------
for (const f of fs.readdirSync(ROOT).filter((n) => /^sitemap.*\.xml$/.test(n))) {
  const xml = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]*\/amazon\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  if (locs.length) {
    errors.push(`${f} lists ${locs.length} /amazon/ URL(s) (${locs.slice(0, 3).join(', ')}). These pages are noindex by design; advertising them in a sitemap contradicts that and pollutes the book-attribution measurement.`);
  }
}

// --- Rule 0 ------------------------------------------------------------------
if (examined === 0) {
  console.error(`${LABEL} FAIL: examined 0 book landing pages. Three published books link here; a guard that inspected nothing must never report protection.`);
  process.exit(1);
}
if (examined !== BOOKS.length) {
  errors.push(`examined ${examined} of ${BOOKS.length} declared book pages.`);
}

const report = {
  schema_version: '1.0',
  validator: 'amazon-book-landing',
  status: errors.length ? 'FAIL' : 'PASS',
  pages_examined: examined,
  rows,
  errors,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/amazon-book-landing.json'), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`${LABEL} FAIL: ${errors.length} issue(s) across ${examined} examined page(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS: examined ${examined} book landing page(s) + index; ${rows.map((r) => `${r.page.replace(/^amazon\//, '').replace(/\/index\.html$/, '')}=${r.words}w`).join(', ')}; all noindex, absent from sitemaps, each linking a product that exists.`);
