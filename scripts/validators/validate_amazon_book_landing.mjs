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
 *   4. Each links to a product URL that has been PROVEN to resolve, and each
 *      states, verbatim and in visible text, where that product does not match
 *      the book the reader just finished.
 *
 *      There is no per-book product. monk-mode, task-paralysis and
 *      executive-dysfunction-field-manual all 404 on Gumroad; only
 *      billionaire-high-performance-coach resolves, so all three pages point at
 *      that one general system. That is a deliberate decision, and it is only
 *      safe while the pages are honest about it. A page that implies the
 *      product is a companion to that specific book, or that it contains a
 *      module it does not contain, produces refunds and chargebacks that cost
 *      more than the sale it won. So the gap is not merely permitted to be
 *      stated - it is REQUIRED to be stated, in five separate places per page
 *      (body, the "plain terms" note, the comparison table, the FAQ, and the
 *      claim of what the product does contain), and this validator asserts each
 *      of those sentences is present character-for-character in the built page.
 *      It separately rejects the contradiction: an unnegated claim that the
 *      product includes the book's own named machinery.
 *
 *      "Resolves" is proven over the network by scripts/validators/
 *      verify_product_urls.mjs and committed to artifacts/validation/
 *      product-url-evidence.json; this guard reads that evidence rather than
 *      making its own request, because it runs as a HARD_FAIL prepush gate and
 *      an egress hiccup must not become a red build. The evidence records the
 *      final host as well as the status: gumroad.com/l/monk-mode answers 200
 *      but resolves to a DIFFERENT SELLER's product, so a status code alone
 *      would have green-lit shipping a competitor's checkout inside our book.
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
//
// gap_statements: the sentences that tell the reader where the product they are
// being offered does NOT match the book they just finished. Each must appear
// character-for-character in the page's VISIBLE text - visible, so the guard
// cannot be satisfied by a sentence buried in a comment or an attribute. Five
// per page, in five different places, because one disclaimer at the bottom is
// how a page technically discloses something while functionally hiding it.
//
// contradictions: patterns that would assert the product contains this book's
// own named machinery. Any unnegated match is a false claim about contents.
const BOOKS = [
  {
    slug: 'monk-mode',
    book: 'Monk Mode',
    must_mention: ['Monk Mode', 'suspension list'],
    gap_statements: [
      'The Billionaire High Performance Coach OS does not contain a Monk Mode module.',
      'It has no fixed-length block, no suspension list and no end date that arrives whether or not the work is done',
      'there is no separate product for Monk Mode, and the OS has no fixed-length block, no suspension list and no exit review',
      'Three of the six rows below are things the OS does not have at all, and a fourth it only partly covers.',
      'No. The OS has no Monk Mode module, and buying it does not give you a block protocol.',
    ],
    contradictions: [/\b(includes?|contains?|comes with|you get|provides?)\b[^.]{0,80}\bMonk Mode (module|protocol|block|edition|companion)\b/i],
  },
  {
    slug: 'executive-dysfunction-field-manual',
    book: 'The Executive Dysfunction Field Manual',
    must_mention: ['Executive Dysfunction Field Manual', 'working memory'],
    gap_statements: [
      'The Billionaire High Performance Coach OS does not contain an executive-function module.',
      'it has no six-function check, it does nothing about time estimation, and it does not write the re-entry note that Step 6 depends on',
      'there is no separate product for The Executive Dysfunction Field Manual, and the OS has no six-function check and no re-entry note',
      'Three of the six functions are covered by the OS, two are not covered at all, and one only partly.',
      'No. The OS has no six-function check, and buying it does not give you the routine in this book.',
    ],
    contradictions: [/\b(includes?|contains?|comes with|you get|provides?)\b[^.]{0,80}\b(six-function check|re-entry note|executive.function module)\b/i],
  },
  {
    slug: 'task-paralysis',
    book: 'Task Paralysis',
    must_mention: ['Task Paralysis', 'restart note'],
    gap_statements: [
      'The Billionaire High Performance Coach OS does not contain a Task Paralysis module.',
      'it has no exit ramp, and it does not produce the restart note that Step 5 depends on',
      'there is no separate product for Task Paralysis, and the OS has no exit ramp and no restart note',
      'Two of the five steps are covered by the OS, two are not covered at all, and one only partly.',
      'No. The OS has no Task Paralysis module, and buying it does not give you the exit ramp.',
    ],
    contradictions: [/\b(includes?|contains?|comes with|you get|provides?)\b[^.]{0,80}\b(exit ramp|restart note|Task Paralysis (module|companion))\b/i],
  },
];

// The /amazon/ index sits above all three and must not imply otherwise either.
const INDEX_GAP_STATEMENTS = ['None of the three books has a product of its own.'];

// Products a page may link to. NOT a hand-maintained list of URLs someone
// believed in: every entry is read from committed evidence of a live request,
// and an entry whose evidence is not a 200 on the seller account we control is
// dropped here and will therefore fail any page that links to it.
const EVIDENCE_PATH = 'artifacts/validation/product-url-evidence.json';
const SELLER_HOST = 'sprylabs.gumroad.com';
const KNOWN_PRODUCTS = [];
const productEvidence = [];
let evidenceError = null;
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, EVIDENCE_PATH), 'utf8'));
  for (const r of raw.records || []) {
    productEvidence.push(r);
    if (r.http_status === 200 && r.seller_host_ok === true && r.final_host === SELLER_HOST) KNOWN_PRODUCTS.push(r.url);
  }
  if (productEvidence.length === 0) evidenceError = `${EVIDENCE_PATH} contains zero product records.`;
} catch (err) {
  evidenceError = `${EVIDENCE_PATH} is missing or unreadable (${err && err.message ? err.message : err}).`;
}

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
// Counters, so Rule 0 can be enforced on every loop rather than only on pages.
let gapStatementsChecked = 0;
let contradictionChecksRun = 0;
let productLinksChecked = 0;

if (evidenceError) {
  errors.push(`${evidenceError} Product links are only allowed against committed proof that the URL resolves on the seller account we control; with no evidence file there is nothing proving the link inside three shipped books goes anywhere. Run: npm run verify:product-urls`);
}
if (!evidenceError && KNOWN_PRODUCTS.length === 0) {
  errors.push(`${EVIDENCE_PATH} contains ${productEvidence.length} record(s) but none verified as HTTP 200 on ${SELLER_HOST}: ${productEvidence.map((r) => `${r.url} -> ${r.http_status} @ ${r.final_host || 'unreachable'}`).join('; ')}. Every page below will now fail, which is correct: there is no product URL proven safe to print.`);
}

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

// Sentence segmentation for the claim checks below.
//
// Splitting flattened text on ".!?" alone is wrong here, because a comparison
// table contains no terminal punctuation: every cell in it merges with the
// prose on either side into one enormous pseudo-sentence. That breaks both
// claim checks in the same way - a negation anywhere in the blob excuses a real
// violation elsewhere in it, and a negated statement in one cell gets paired
// with an unrelated phrase in another and reported as a contradiction. So block
// boundaries are turned into sentence boundaries first, and each cell, list
// item, heading and paragraph is judged on its own.
function blockSentences(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return (m ? m[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<\/(p|li|h[1-6]|td|th|tr|div|section|article|blockquote|figcaption|caption)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkClinical(where, sentences) {
  for (const sentence of sentences) {
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
  for (const statement of INDEX_GAP_STATEMENTS) {
    gapStatementsChecked += 1;
    if (!t.includes(statement)) {
      errors.push(`${DIR}/index.html does not print, in visible text, the required gap statement "${statement}". The index is the page a reader reaches by trimming the URL, and it must not leave the impression that any of the three books has a companion product.`);
    }
  }
  checkClinical(`${DIR}/index.html`, blockSentences(indexHtml));
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
  const sents = blockSentences(html);
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

  // a real path to purchase, proven to resolve on our own seller account
  const links = [...html.matchAll(/href="(https:\/\/[^"]*gumroad\.com[^"]*)"/gi)].map((m) => m[1]);
  if (links.length === 0) {
    errors.push(`${rel} contains no product link, so a reader who finished the book has no path to purchase.`);
  }
  for (const l of links) {
    productLinksChecked += 1;
    if (!KNOWN_PRODUCTS.includes(l)) {
      const ev = productEvidence.find((r) => r.url === l);
      const seen = ev ? `verified as HTTP ${ev.http_status} on ${ev.final_host || 'an unreachable host'}` : 'not present in the verification evidence at all';
      errors.push(`${rel} links to ${l}, which is ${seen}. Only a URL proven to answer 200 on ${SELLER_HOST} may be printed on a page that three already-published books link to; the link cannot be corrected after a copy is sold. Run: npm run verify:product-urls`);
    }
  }
  row.product = links[0] || null;

  // the gap is stated, verbatim, in visible text, in five separate places
  const missingGaps = [];
  for (const statement of b.gap_statements) {
    gapStatementsChecked += 1;
    if (!t.includes(statement)) missingGaps.push(statement);
  }
  if (b.gap_statements.length < 5) {
    errors.push(`${rel} declares only ${b.gap_statements.length} gap statement(s); five are required so the mismatch is stated in the body, the plain-terms note, the comparison table, the FAQ and the description of what the product does contain.`);
  }
  for (const statement of missingGaps) {
    errors.push(`${rel} does not print, in visible text, the required gap statement "${statement}". This page offers a product that is not a companion to ${b.book}; the reader has to be told so where they will actually read it. Removing or softening this sentence is how a page starts earning refunds.`);
  }
  row.gap_statements_required = b.gap_statements.length;
  row.gap_statements_present = b.gap_statements.length - missingGaps.length;

  // ...and is not contradicted elsewhere on the same page
  for (const re of b.contradictions) {
    contradictionChecksRun += 1;
    for (const sentence of sents) {
      // A question is not a claim. "Does the OS include the exit ramp?" is the
      // FAQ heading directly above the answer "No" - flagging it would push the
      // page into deleting the very question a buyer needs answered.
      if (/\?\s*\.?\s*$/.test(sentence)) continue;
      if (re.test(sentence) && !CLINICAL_NEGATION.test(sentence)) {
        errors.push(`${rel} asserts that the product includes machinery belonging to ${b.book} — "${sentence.trim().slice(0, 160)}" (matched ${re}). The product has no module for this book; stating otherwise is a false claim about what the buyer receives, and false claims about contents are what produce refunds and chargebacks.`);
      }
    }
  }

  // the comparison table and the FAQ have to exist to hold two of those statements
  if (!/<table[\s>]/i.test(html)) {
    errors.push(`${rel} has no comparison table. Where the product only partly matches the book, the reader needs the split laid out row by row, not summarised in prose they can skim past.`);
  }
  if (!/id="faq"/i.test(html)) {
    errors.push(`${rel} has no FAQ section (id="faq"), which is where the direct question "does this product include the book's method" has to be answered directly.`);
  }

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
  checkClinical(rel, sents);

  rows.push(row);
}

// --- 3. the three pages must not be the same page ----------------------------
const slugs = [...texts.keys()];
const similarities = [];
let pairsCompared = 0;
for (let i = 0; i < slugs.length; i += 1) {
  for (let j = i + 1; j < slugs.length; j += 1) {
    const sim = jaccard(tokenSet(texts.get(slugs[i])), tokenSet(texts.get(slugs[j])));
    pairsCompared += 1;
    similarities.push({ a: slugs[i], b: slugs[j], similarity: Number(sim.toFixed(4)) });
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
// Rule 0 applies to every loop, not just the outer one. Each of these counters
// guards an assertion that would otherwise pass silently by iterating nothing.
const EXPECTED_GAP_CHECKS = BOOKS.reduce((n, b) => n + b.gap_statements.length, 0) + INDEX_GAP_STATEMENTS.length;
const EXPECTED_CONTRADICTION_CHECKS = BOOKS.reduce((n, b) => n + b.contradictions.length, 0);
const EXPECTED_PAIRS = (BOOKS.length * (BOOKS.length - 1)) / 2;
for (const [what, got, want] of [
  ['gap statements', gapStatementsChecked, EXPECTED_GAP_CHECKS],
  ['contradiction checks', contradictionChecksRun, EXPECTED_CONTRADICTION_CHECKS],
  ['near-duplicate page pairs', pairsCompared, EXPECTED_PAIRS],
]) {
  if (got !== want) {
    console.error(`${LABEL} FAIL: ran ${got} ${what} but ${want} are declared. A guard that skipped an assertion must not report protection.`);
    process.exit(1);
  }
}
if (productLinksChecked === 0) {
  console.error(`${LABEL} FAIL: checked 0 product links across ${examined} page(s). The entire purpose of this guard is that the link printed inside a shipped book leads somewhere real.`);
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  validator: 'amazon-book-landing',
  status: errors.length ? 'FAIL' : 'PASS',
  pages_examined: examined,
  gap_statements_checked: gapStatementsChecked,
  contradiction_checks_run: contradictionChecksRun,
  product_links_checked: productLinksChecked,
  verified_products: KNOWN_PRODUCTS,
  product_url_evidence: EVIDENCE_PATH,
  page_pairs_compared: pairsCompared,
  similarities,
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
console.log(`${LABEL} PASS: examined ${examined} book landing page(s) + index; ${rows.map((r) => `${r.page.replace(/^amazon\//, '').replace(/\/index\.html$/, '')}=${r.words}w`).join(', ')}; all noindex and absent from sitemaps; ${productLinksChecked} product link(s) all resolving to ${KNOWN_PRODUCTS.join(', ')} per ${EVIDENCE_PATH}; ${gapStatementsChecked} gap statement(s) printed verbatim and ${contradictionChecksRun} contradiction check(s) clean; max page-pair similarity ${(Math.max(...similarities.map((s) => s.similarity)) * 100).toFixed(1)}% against a ${(MAX_SIMILARITY * 100).toFixed(0)}% ceiling.`);
