'use strict';
/**
 * One definition of the search-snippet bounds every indexable page must meet:
 * a <title> of 30-65 characters and a meta description of 120-160 characters,
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
 *   - a title keeps its own site name, shortening the core at a word boundary
 *     when necessary; an over-long description is cut at the last sentence
 *     end that still leaves 110+ characters, else at a word boundary. Both keep
 *     the page's own words - nothing is invented, nothing is appended.
 *   - a SHORT title or description is never padded here. Padding is where
 *     filler comes from ("... explains the decision, the operating method, and
 *     the next practical step." on 48 pages). Short ones are fixed where they
 *     are written: the generator, the content front matter, or
 *     data/content/meta_description_overrides.json for hand-authored pages.
 */

const TITLE_MIN = 30;
// 65, not 70. Google truncates a result title at roughly 600px, which is about
// 60-65 characters; the Search Readiness checklist (item b1) asks for 30-65 and
// reported 305 committed pages above it on 25 Oct 2026 - every one of them a
// title whose tail no searcher ever sees. The ladder in titleCandidates()
// reserves room for the site name before cutting the core.
const TITLE_MAX = 65;
// 120, not 110. The Search Readiness checklist (item b2) asks for 120-160 and
// reported spryexecutiveos.com pages at 118 characters on 25 Oct 2026 - inside
// this repo's bound and outside the checklist's, which is two definitions of
// "long enough" disagreeing. 50 committed pages sat in the 110-119 gap. Google
// shows roughly 155-160 characters of a desktop snippet; under about 120 the
// snippet is padded out with text Google picks from the page instead, which is
// the thing a written description exists to prevent.
//
// Raising it needs no new padding logic: a description below the floor is not
// in range, so descriptionCandidates() returns nothing for it and the repair
// falls through to leadTexts() - the page's OWN paragraphs. That is the rung
// this file already insists on, and nothing is invented.
const DESC_MIN = 120;
const DESC_MAX = 160;

// download.html is the revenue page; its bytes are frozen at a known hash and
// every writer in this repo already skips it (see repair_dual_domain_metadata.js).
// It is exempt by name, not by pattern, so nothing else can shelter here.
const EXEMPT_PAGES = new Set(['download.html']);

const BRANDS = {
  'spryexecutiveos.com': 'Spry Executive OS',
  'billionairehighperformancecoach.com': 'Billionaire High Performance Coach',
};
// The form a title uses when the full product name will not fit. The site's own
// comparison pages already abbreviate it this way. Without this rung, a 29-
// character core under a 34-character brand had no candidate at all between
// "too short alone" and "too long with the brand", and five pages ended with an
// unresolved title.
const SHORT_BRANDS = {
  'spryexecutiveos.com': 'Spry Executive OS',
  'billionairehighperformancecoach.com': 'BHPC',
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

/** A title names the host using its full name or its established short name. */
function titleNamesHost(title, host) {
  const normName = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = normName(title);
  return [BRANDS[host], SHORT_BRANDS[host]].filter(Boolean).some((b) => t.includes(normName(b)));
}

/** A legacy product label must not credit a sibling property in search. */
function titleNamesSibling(title, host) {
  const t = norm(title).toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.entries(BRANDS).some(([h, b]) => h !== host && t.includes(b.toLowerCase().replace(/[^a-z0-9]/g, '')))
    || t.includes('aplayermode');
}

/**
 * "https://spryexecutiveos.com/x" and "spryexecutiveos.com" are the same host.
 * dual_domain_policy.cjs hostFor() returns an origin URL; until 30 Oct 2026 the
 * hub generator passed that straight in, BRANDS[url] was undefined, and four
 * short hub titles came back with no candidate and were written as "undefined".
 */
function bareHost(hostOrUrl) {
  return String(hostOrUrl || '').replace(/^https?:\/\//i, '').replace(/[/:?#].*$/, '').toLowerCase();
}

/** Candidates always retain the host's name, including titles already in range. */
function titleCandidates(title, hostOrUrl) {
  const host = bareHost(hostOrUrl);
  const t = norm(title);
  const brand = BRANDS[host] || '';
  const shortBrand = SHORT_BRANDS[host] || brand;
  if (!brand) return inTitleRange(t) ? [t] : [cutWords(t, TITLE_MAX)].filter(inTitleRange);
  const out = [];
  if (inTitleRange(t) && titleNamesHost(t, host) && !titleNamesSibling(t, host)) out.push(t);
  let core = titleCore(t);
  // The phase4 generator's former product label is now a separate property.
  // Keep the route and visible question, but name this product in its snippet.
  if (host === 'billionairehighperformancecoach.com') core = core.replace(/\bA[ -]player mode\b/gi, shortBrand);
  core = core.replace(/Billionaire High Performance Coach/gi, SHORT_BRANDS['billionairehighperformancecoach.com']);
  if (host !== 'spryexecutiveos.com') core = core.replace(/Spry Executive OS/gi, 'Spry');
  const short = core;
  for (const c of [...new Set([core, short])]) {
    if (titleNamesHost(c, host)) out.push(c, cutWords(c, TITLE_MAX));
    for (const name of [...new Set([brand, shortBrand])]) out.push(`${c} | ${name}`);
    for (const name of [...new Set([shortBrand, brand])]) {
      const tail = ` | ${name}`;
      out.push(`${cutWords(c, TITLE_MAX - tail.length)}${tail}`);
    }
  }
  return [...new Set(out)].filter(inTitleRange).filter((t) => titleNamesHost(t, host) && !titleNamesSibling(t, host));
}

/**
 * The one branded title for a page: the best candidate the policy allows.
 * Every writer that sets a title from its own data (hub generator, demand-family
 * applier) goes through this, so the snippet repair that runs afterwards finds
 * the title already conforming and leaves it alone - two writers can no longer
 * fight over the same <title>. Throws rather than returning undefined: a title
 * the policy cannot express is a build failure, not a page called "undefined".
 */
function brandedTitle(title, hostOrUrl) {
  const host = bareHost(hostOrUrl);
  if (!BRANDS[host]) throw new Error(`[search_snippet_bounds] no brand declared for host "${hostOrUrl}"`);
  const pick = titleCandidates(title, host)[0];
  if (!pick) throw new Error(`[search_snippet_bounds] no title in ${TITLE_MIN}-${TITLE_MAX} chars naming ${BRANDS[host]} can be made from "${title}"`);
  return pick;
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
  TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX, EXEMPT_PAGES, BRANDS, SHORT_BRANDS,
  decodeEntities, escapeText, escapeAttr, norm, titleOf, descriptionOf, META_DESC_RE,
  inTitleRange, inDescRange, cutWords, titleCore, titleCandidates, brandedTitle, bareHost, titleNamesHost, titleNamesSibling, descriptionCandidates,
};
