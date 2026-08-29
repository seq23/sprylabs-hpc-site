import fs from 'node:fs';
import path from 'node:path';

const INTERNAL_HOSTS = new Set([
  'spryexecutiveos.com',
  'billionairehighperformancecoach.com'
]);

const APPROVED_EXTERNAL_CTA_HOSTS = new Set([
  'sprylabs.gumroad.com',
  'aplayermode.com'
]);

function normalizedHost(hostname = '') {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function parseHttpUrl(value = '', base = 'https://spryexecutiveos.com') {
  const raw = String(value || '').trim();
  if (!raw || /^(?:javascript|data|mailto|tel):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

// /download.html is the one route that keeps its extension: it is the frozen
// revenue surface and its canonical still names the .html form. Every other
// internal link normalizes to the route that answers 200 without a redirect.
const FROZEN_HTML_PATHS = new Set(['/download.html']);

export function normalizeBhpcInternalLinkHref(value = '') {
  const url = parseHttpUrl(value);
  if (!url) return '';
  const host = normalizedHost(url.hostname);
  if (!INTERNAL_HOSTS.has(host)) return '';
  let pathname = url.pathname || '/';
  if (!FROZEN_HTML_PATHS.has(pathname)) {
    if (pathname === '/index.html') pathname = '/';
    else if (pathname.endsWith('/index.html')) pathname = pathname.slice(0, -'index.html'.length);
    else if (pathname.endsWith('.html')) pathname = pathname.slice(0, -'.html'.length);
  }
  return `${pathname}${url.search || ''}${url.hash || ''}`;
}

export function normalizeBhpcExternalCtaHref(value = '') {
  const url = parseHttpUrl(value);
  if (!url) return '';
  const host = normalizedHost(url.hostname);
  if (!APPROVED_EXTERNAL_CTA_HOSTS.has(host)) return '';
  return url.href;
}

export function partitionBhpcInternalLinkActions(actions = []) {
  const internal = [];
  const external_ctas = [];
  const rejected = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    const target = action?.to_url || '';
    const internalHref = normalizeBhpcInternalLinkHref(target);
    if (internalHref) {
      internal.push({...action, normalized_internal_href: internalHref});
      continue;
    }
    const externalHref = normalizeBhpcExternalCtaHref(target);
    if (externalHref) {
      external_ctas.push({...action, normalized_external_href: externalHref});
      continue;
    }
    if (action?.to_url || action?.anchor_text) rejected.push(action);
  }
  return {internal, external_ctas, rejected};
}

export function isBhpcInternalLink(value = '') {
  return Boolean(normalizeBhpcInternalLinkHref(value));
}

// ---------------------------------------------------------------------------
// Deriving link actions from the recommendation prose.
//
// An intake artifact may state its internal-link target in two places: the
// structured seo_execution.internal_link_actions array, or the prose of the
// recommendation itself ("ensure internal links to /download.html are active",
// "replace all six broken related-links with ... /ai-executive-coach.html").
// Only the structured array was ever read. When an artifact named its targets
// in prose alone, blockTypesForAgentText still saw the words "internal link"
// and required an internal_link_set block, while required_internal_links stayed
// empty - so the applier's renderer had nothing to build from and emitted the
// empty string, and the trace then refused the page for a block that no code
// path could ever produce. That refusal is correct; the missing capability was
// upstream, and it silently discarded real work. how-tracks-work.html still
// carries the exact broken spryexecutiveos.com/*.html links an artifact flagged
// on 2026-06-27, because the named replacements were never read.
//
// Targets are taken only where the artifact literally names them, and only when
// they resolve to a file that exists in this repository. Nothing is inferred
// from topic, similarity, or cluster: a link this pipeline invents is a link no
// artifact asked for.
// ---------------------------------------------------------------------------

const MAX_DERIVED_INTERNAL_LINKS = 6;

function repoRoot() {
  return process.cwd();
}

// A normalized href is a served route. Map it back to the file that serves it,
// covering the extensionless routes normalizeBhpcInternalLinkHref produces
// (/faq -> faq.html) and directory routes (/clusters/x -> clusters/x/index.html).
export function repoPathForBhpcInternalHref(href = '') {
  const clean = String(href || '').split(/[?#]/)[0];
  if (!clean.startsWith('/') || clean.includes('..')) return '';
  const rel = clean.slice(1);
  const candidates = rel === ''
    ? ['index.html']
    : [rel, `${rel}.html`, path.posix.join(rel, 'index.html')];
  for (const candidate of candidates) {
    if (!candidate.endsWith('.html')) continue;
    const abs = path.join(repoRoot(), candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return candidate;
  }
  return '';
}

function stripTags(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Anchor text is lifted from the destination page's own <h1>, falling back to
// its <title> with the site-name suffix removed. It is never composed from the
// recommendation text: the anchor has to describe the page a reader lands on.
export function bhpcInternalLinkAnchorText(repoPath = '') {
  if (!repoPath) return '';
  let html = '';
  try { html = fs.readFileSync(path.join(repoRoot(), repoPath), 'utf8'); } catch { return ''; }
  const h1 = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  if (h1) return h1.slice(0, 120);
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  return title.split(/\s+[—|]\s+/)[0].trim().slice(0, 120);
}

// Absolute URLs on an internal host, plus root-relative page paths. A bare word
// is never a target: the artifact has to write a path.
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/gi;
const ROOT_RELATIVE_PATTERN = /(?<![\w./-])\/[a-z0-9][a-z0-9/_-]*(?:\.html)?(?![\w-])/gi;

export function extractBhpcInternalLinkHrefsFromText(text = '') {
  const value = String(text || '');
  const found = [];
  for (const raw of value.match(ABSOLUTE_URL_PATTERN) || []) {
    const href = normalizeBhpcInternalLinkHref(raw.replace(/[.,;:)\]]+$/, ''));
    if (href) found.push(href);
  }
  for (const raw of value.match(ROOT_RELATIVE_PATTERN) || []) {
    const href = normalizeBhpcInternalLinkHref(`https://spryexecutiveos.com${raw}`);
    if (href) found.push(href);
  }
  const seen = new Set();
  return found.filter(href => (seen.has(href) ? false : (seen.add(href), true)));
}

// Some artifacts ask for internal links without naming a destination ("Add
// founder use-case examples and internal link to build topical authority").
// There is nothing to parse, but there is something true to use: the page
// already carries a taxonomy-built <section data-internal-nav="related"> that
// build_navigation_structure.mjs computed from the site's own section tree.
// Those links are real, already published, and already the site's answer to
// "what is related to this page", so an acceptance that asks for internal links
// is honestly satisfied by them. Nothing here is inferred from topic similarity;
// if the page has no related section, this returns nothing.
const RELATED_NAV_SECTION = /<section\b[^>]*data-internal-nav="related"[^>]*>([\s\S]*?)<\/section>/i;

export function readBhpcNavigationRelatedLinks(selfPath = '') {
  const rel = String(selfPath || '').replace(/^\/+/, '');
  if (!rel) return [];
  let html = '';
  try { html = fs.readFileSync(path.join(repoRoot(), rel), 'utf8'); } catch { return []; }
  const section = (html.match(RELATED_NAV_SECTION) || [])[1] || '';
  if (!section) return [];
  const out = [];
  for (const match of section.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    out.push({href: match[1], text: stripTags(match[2])});
  }
  return out;
}

export function deriveBhpcInternalLinkActionsFromNavigation(selfPath = '', {fromUrl = ''} = {}) {
  const selfHref = selfPath ? normalizeBhpcInternalLinkHref(`https://spryexecutiveos.com/${String(selfPath).replace(/^\/+/, '')}`) : '';
  const actions = [];
  const seen = new Set();
  for (const {href: rawHref, text} of readBhpcNavigationRelatedLinks(selfPath)) {
    const href = normalizeBhpcInternalLinkHref(rawHref.startsWith('/') ? `https://spryexecutiveos.com${rawHref}` : rawHref);
    if (!href || href === selfHref || seen.has(href)) continue;
    const repoPath = repoPathForBhpcInternalHref(href);
    if (!repoPath) continue;
    const anchor = text || bhpcInternalLinkAnchorText(repoPath);
    if (!anchor) continue;
    seen.add(href);
    actions.push({
      from_url: fromUrl || '',
      to_url: href,
      anchor_text: anchor.slice(0, 120),
      source: 'site_navigation_related_section',
      resolved_repo_path: repoPath
    });
    if (actions.length >= MAX_DERIVED_INTERNAL_LINKS) break;
  }
  return actions;
}

// selfPath is the page being repaired; a page must not be given a link to
// itself, which is what "/download.html" would become on download.html.
export function deriveBhpcInternalLinkActionsFromText(text = '', {selfPath = '', fromUrl = ''} = {}) {
  const selfHref = selfPath ? normalizeBhpcInternalLinkHref(`https://spryexecutiveos.com/${String(selfPath).replace(/^\/+/, '')}`) : '';
  const actions = [];
  for (const href of extractBhpcInternalLinkHrefsFromText(text)) {
    if (href === selfHref) continue;
    const repoPath = repoPathForBhpcInternalHref(href);
    if (!repoPath) continue;
    if (selfPath && repoPath === String(selfPath).replace(/^\/+/, '')) continue;
    const anchor = bhpcInternalLinkAnchorText(repoPath);
    if (!anchor) continue;
    actions.push({
      from_url: fromUrl || '',
      to_url: href,
      anchor_text: anchor,
      source: 'recommendation_text',
      resolved_repo_path: repoPath
    });
    if (actions.length >= MAX_DERIVED_INTERNAL_LINKS) break;
  }
  return actions;
}
