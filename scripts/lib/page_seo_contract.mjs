// THE page-seo contract, examined one page at a time.
//
// These rules used to live only inside scripts/validation/validate_page_seo_contract.mjs,
// the last validator in release:agent-intake:raw. That placement made the
// contract a verdict on the whole run: one page that an acceptance record
// could not be rendered to satisfy failed the release, and because the Twin
// Agent's weekly drop reaches main by direct push, that verdict was a red main
// every Friday (2026-09-19, 2026-09-26, 2026-10-03 run 37127626280:
// ai-coach-vs-human-coach.html MISSING_REQUIRED_HEADING "is AI coaching worth
// it", one page of eleven).
//
// The rules are now one function that two stages call: the validator, whose
// verdict is unchanged, and scripts/agent_intake/hold_nonconforming_agent_pages.mjs,
// which runs first and HOLDS a page that fails them - restores the page to its
// last validated bytes, ledgers the hold by name, and lets the other pages
// ship - so the validator then judges a tree with the held page withdrawn.
// One definition, so the hold can never pass a page the validator would fail.
import {normalizeBhpcInternalLinkHref} from './bhpc_internal_links.mjs';
import {saysPhrase} from './bhpc_agent_acceptance_satisfaction.mjs';

export const APPROVED_CANONICAL_HOSTS = new Set(['spryexecutiveos.com', 'billionairehighperformancecoach.com']);
export const FORBIDDEN_PUBLIC_PATTERNS = [
  /Agent recommendation implementation/i,
  /Agent-directed implementation/i,
  /Agent source instruction/i,
  /Source FIX instruction/i,
  /Required acceptance strings/i,
  /BHPC Agent Acceptance Framework/i,
  /visible semantic proof/i,
  /route-specific implementation/i
];

function count(re, text) { return [...String(text).matchAll(re)].length; }
export function stripTags(value = '') { return String(value).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
function metaContent(html, name) {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const m = html.match(re); return (m?.[1] || m?.[2] || '').trim();
}
function canonicalHref(html) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return (m?.[1] || m?.[2] || '').trim();
}
function jsonLdErrors(html) {
  const errors = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let i = 0;
  while ((m = re.exec(html))) {
    i += 1;
    try { JSON.parse(m[1].trim()); } catch (error) { errors.push(`invalid_json_ld_${i}:${error.message}`); }
  }
  return errors;
}

/**
 * Examine one page against the contract.
 *
 * @param {object} input
 * @param {string} input.rel              repo-relative path of the page
 * @param {string} input.html             the page as it would be published
 * @param {Array}  input.acceptanceEntries the ACTIVE acceptance entries whose
 *                                        implementation_path is this page
 * @param {boolean} input.active          whether the page is in the active plan
 * @returns {{failures: Array, warnings: Array}}  the same records the validator reports
 */
export function examinePageSeoContract({rel, html, acceptanceEntries = [], active = false}) {
  const failures = [];
  const warnings = [];
  const titleCount = count(/<title\b[^>]*>[\s\S]*?<\/title>/gi, html);
  const h1Count = count(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, html);
  const canonicalCount = count(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, html);
  if (titleCount !== 1) failures.push({path: rel, code: 'TITLE_COUNT', detail: titleCount});
  if (h1Count !== 1) failures.push({path: rel, code: 'H1_COUNT', detail: h1Count});
  if (canonicalCount !== 1) failures.push({path: rel, code: 'CANONICAL_COUNT', detail: canonicalCount});
  const canonical = canonicalHref(html);
  if (canonical) {
    try {
      const u = new URL(canonical);
      if (!APPROVED_CANONICAL_HOSTS.has(u.hostname)) failures.push({path: rel, code: 'CANONICAL_HOST', detail: u.hostname});
    } catch { failures.push({path: rel, code: 'CANONICAL_INVALID', detail: canonical}); }
  }
  for (const detail of jsonLdErrors(html)) failures.push({path: rel, code: 'JSON_LD', detail});
  if (/\{\{[^}]+\}\}|%%[A-Z0-9_:.-]+%%|\[TODO\]|\bTODO:\b/i.test(html)) failures.push({path: rel, code: 'UNRESOLVED_TOKEN'});
  for (const re of FORBIDDEN_PUBLIC_PATTERNS) if (re.test(html)) failures.push({path: rel, code: 'PUBLIC_OPERATIONAL_SCAFFOLDING', detail: re.source});

  for (const entry of acceptanceEntries) {
    const marker = `data-bhpc-agent-record="${entry.record_id}"`;
    if (!html.includes(marker)) failures.push({path: rel, code: 'MISSING_RECORD_MARKER', detail: entry.record_id});
    /*
     * A THIRD LANE USED TO ASK THIS QUESTION ITS OWN WAY. The plan builder and the
     * trace were unified on scripts/lib/bhpc_agent_acceptance_satisfaction.mjs - see
     * the measurement in that file's header - and this contract was left behind on
     * `stripTags(html).toLowerCase().includes(...)`, a raw substring match. So a
     * page that plainly SAYS the required heading still failed here whenever the
     * rendered heading differed by punctuation the applier legitimately writes.
     *
     * Reproduced 2026-09-12: ai-coach-vs-human-coach.html carries
     * <h1>AI Coach vs Human Coach: Which Is Better?</h1> - the CURATED heading - and
     * records 2026-06-27-bhpc-106 and 2026-07-04-bhpc-137 require "AI coach vs human
     * coach which is better". The page says it. A colon and a question mark made
     * this lane call it missing, and it took Spry Content Release red at
     * release:agent-intake:raw immediately after the trace it disagrees with had
     * reported PASS on the same page.
     *
     * saysPhrase is not a loosening: it keeps word order and adjacency and is
     * strictly stronger than the token-wise test this repo has already rejected. It
     * is the weakest test that still means "the page says this", and it is now the
     * ONE test all three lanes use.
     */
    const heading = stripTags(entry.required_heading || '');
    if (heading && !saysPhrase(html, heading)) failures.push({path: rel, code: 'MISSING_REQUIRED_HEADING', detail: heading});
    for (const link of entry.required_internal_links || []) {
      if (!link?.to_url) continue;
      // Compare the route the applier actually renders, not the raw to_url. An
      // artifact writes its target with the .html extension
      // (".../a-practical-way-....html"); every internal link on this site is
      // published at the extensionless route the same normalizer produces, which
      // is why the acceptance entry already carries normalized_internal_href.
      // Checking the raw pathname asked for an href no page has ever contained,
      // so a link that was rendered correctly still failed the contract. The
      // check still fails when the link is genuinely absent - it just looks for
      // the form the site serves.
      let rawPathname = '';
      try { rawPathname = new URL(link.to_url, 'https://billionairehighperformancecoach.com').pathname; } catch { rawPathname = String(link.to_url); }
      // A link action whose to_url resolves to this same page is a self-link. The
      // apply step cannot render it as a related-page link, so requiring its anchor
      // text here can never be satisfied. Skip it and record it as a data warning
      // against the emitting record rather than blocking every downstream deploy.
      if (rawPathname.replace(/^\/+/, '') === rel) {
        warnings.push({path: rel, code: 'SELF_REFERENTIAL_LINK_ACTION', detail: rawPathname, record_id: entry.record_id});
        continue;
      }
      const pathname = link.normalized_internal_href || normalizeBhpcInternalLinkHref(link.to_url) || rawPathname;
      if (!html.includes(`href="${pathname}"`) && !html.includes(`href='${pathname}'`)) failures.push({path: rel, code: 'MISSING_REQUIRED_LINK', detail: pathname});
      // Link presence is an invariant; exact anchor wording is a recommendation.
      if (link.anchor_text && !stripTags(html).toLowerCase().includes(String(link.anchor_text).toLowerCase())) warnings.push({path: rel, code: 'ANCHOR_TEXT_MISMATCH', detail: link.anchor_text, record_id: entry.record_id});
    }
  }

  const title = stripTags((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description = metaContent(html, 'description');
  if (title.length && (title.length < 20 || title.length > 70)) warnings.push({path: rel, code: 'TITLE_LENGTH', detail: title.length});
  if (description.length && (description.length < 70 || description.length > 180)) warnings.push({path: rel, code: 'META_DESCRIPTION_LENGTH', detail: description.length});
  if (active && !/data-bhpc-agent-block=["']direct_answer["']/i.test(html)) warnings.push({path: rel, code: 'NO_DIRECT_ANSWER_BLOCK'});
  return {failures, warnings};
}

/**
 * The active acceptance entries grouped by page: every manifest entry whose
 * record is in an active plan spec and is not NO_ACTION. Shared so the hold
 * stage and the validator examine each page against the same entries.
 */
export function acceptanceEntriesByPath(manifest, activeAcceptanceIds) {
  const map = new Map();
  for (const entry of manifest.entries || []) {
    const rel = String(entry.implementation_path || '').replace(/^\/+/, '');
    const recordId = String(entry.record_id || entry.id || '');
    if (!rel || entry.acceptance_status === 'NO_ACTION') continue;
    if (!activeAcceptanceIds.has(recordId)) continue;
    if (!map.has(rel)) map.set(rel, []);
    map.get(rel).push(entry);
  }
  return map;
}

/** Plan specs that are in force: not BLOCKED (quarantined, held, no demand) and with a page to write. */
export function activePlanSpecs(plan) {
  return (plan.specs || []).filter(x => x.status !== 'BLOCKED' && x.implementation_path);
}
