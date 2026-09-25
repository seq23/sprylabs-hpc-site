'use strict';
/**
 * One definition of the search-snippet bounds every indexable page must meet:
 * a <title> of 30-70 characters and a meta description of 110-160 characters,
 * each unique across the site.
 *
 * Why these numbers. Bing Webmaster Tools, 25 Sep 2026, SEO rule 118 ("meta
 * description too short") flagged 8 pages on billionairehighperformancecoach.com
 * and 24 on spryexecutiveos.com, at 41-98 characters; its Site Scan also flags
 * titles under 20 or over 70 characters. A crawl of the committed tree measured
 * 1,813 titles over 70 (mostly a 37-character " | Billionaire High Performance
 * Coach" suffix stacked on a long question) and 1,808 descriptions over 160.
 *
 * The repair (scripts/repair/repair_dual_domain_metadata.js) and the validator
 * (scripts/validators/validate_search_snippet_bounds.mjs) both read the limits
 * and the shortening rules from here, so the check and the thing it checks
 * cannot drift into two definitions.
 *
 * What the repair may do, and what it may not:
 *   - an over-long title loses its brand/qualifier suffixes first, then is cut
 *     at a word boundary; an over-long description is cut at the last sentence
 *     end that still leaves 110+ characters, else at a word boundary. Both keep
 *     the page's own words - nothing is invented, nothing is appended.
 *   - a SHORT title or description is never padded here. Padding is where
 *     filler comes from ("... explains the decision, the operating method, and
 *     the next practical step." on 48 pages). Short ones are fixed where they
 *     are written: the generator, the content front matter, or
 *     data/content/meta_description_overrides.json for hand-authored pages.
 */

const TITLE_MIN = 30;
const TITLE_MAX = 70;
const DESC_MIN = 110;
const DESC_MAX = 160;

// download.html is the revenue page; its bytes are frozen at a known hash and
// every writer in this repo already skips it (see repair_dual_domain_metadata.js).
// It is exempt by name, not by pattern, so nothing else can shelter here.
const EXEMPT_PAGES = new Set(['download.html']);

const BRANDS = {
  'spryexecutiveos.com': 'Spry Executive OS',
  'billionairehighperformancecoach.com': 'Billionaire High Performance Coach',
};

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', rarr: '→' };

function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function titleOf(html) {
  const m = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? norm(decodeEntities(m[1])) : '';
}

const META_DESC_RE = /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i;
function descriptionOf(html) {
  const head = String(html).split(/<\/head>/i)[0];
  const tag = head.match(META_DESC_RE);
  if (!tag) return '';
  const c = tag[0].match(/\bcontent=(["'])([\s\S]*?)\1/i);
  return c ? norm(decodeEntities(c[2])) : '';
}

function inTitleRange(t) { return t.length >= TITLE_MIN && t.length <= TITLE_MAX; }
function inDescRange(d) { return d.length >= DESC_MIN && d.length <= DESC_MAX; }

/** Cut at a word boundary so the result, with a trailing ellipsis, fits `max`. */
function cutWords(s, max) {
  s = norm(s);
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  // Never end on a connective: "... using Ali…" reads as broken, "... using…"
  // reads as cut. Drop dangling function words, then dangling punctuation.
  for (let i = 0; i < 4; i += 1) {
    const next = cut.replace(/[\s,;:.!?—–\-|(]+$/u, '').replace(/\s+(a|an|the|and|or|for|with|to|of|in|on|by|as|at|from|into|vs|using|based|while|when|that|which|is|are|your|my)$/i, '');
    if (next === cut) break;
    cut = next;
  }
  return `${cut}…`;
}

/**
 * The title with its brand and de-duplication qualifiers removed: everything
 * after the first " | ", a trailing " — <brand>", and a "(BHPC agent page)".
 */
function titleCore(t) {
  let core = norm(t).split(/\s+\|\s+/)[0];
  core = core.replace(/\s+[—–-]\s+(Spry Executive OS|Billionaire High Performance Coach)\s*$/i, '');
  return norm(core);
}

/** Candidate titles for an over-long title, best first. Short titles return []. */
function titleCandidates(title, host) {
  const t = norm(title);
  if (inTitleRange(t)) return [t];
  if (t.length < TITLE_MIN) return [];
  const core = titleCore(t);
  // The product name is 34 characters; inside a title it is abbreviated the
  // way the site's own comparison pages already abbreviate it.
  const short = norm(core
    .replace(/\s+[—–]\s+Spry Executive OS\b/gi, '')
    .replace(/Billionaire High Performance Coach/g, 'BHPC'));
  const brand = BRANDS[host] || '';
  const out = [];
  if (brand) out.push(`${core} | ${brand}`);
  out.push(core);
  if (brand) out.push(`${short} | ${brand}`);
  out.push(short);
  out.push(cutWords(short, TITLE_MAX));
  return [...new Set(out)].filter(inTitleRange);
}

/** Candidate descriptions for an over-long description, best first. Short ones return []. */
function descriptionCandidates(desc) {
  const d = norm(desc);
  if (inDescRange(d)) return [d];
  if (d.length < DESC_MIN) return [];
  const out = [];
  const sentences = d.split(/(?<=[.!?])\s+/);
  let acc = '';
  for (const s of sentences) {
    const next = acc ? `${acc} ${s}` : s;
    if (next.length > DESC_MAX) break;
    acc = next;
  }
  if (inDescRange(acc)) out.push(acc);
  out.push(cutWords(d, DESC_MAX));
  return [...new Set(out)].filter(inDescRange);
}

module.exports = {
  TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX, EXEMPT_PAGES, BRANDS,
  decodeEntities, escapeText, escapeAttr, norm, titleOf, descriptionOf, META_DESC_RE,
  inTitleRange, inDescRange, cutWords, titleCore, titleCandidates, descriptionCandidates,
};
