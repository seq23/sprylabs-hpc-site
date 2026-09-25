'use strict';
/**
 * Bring every indexable page's <title> and meta description inside the bounds in
 * scripts/lib/search_snippet_bounds.cjs, and keep both unique across the site.
 *
 * Runs as the last phase of scripts/repair/repair_dual_domain_metadata.js,
 * which is the last producer that touches page metadata in every lane: the end
 * of build:all, the producer right after it, and the tail of
 * repair:extraction-final-state. Anything earlier in the chain (the citation
 * program's ensure_meta, the agent appliers, the nav builder) can write a
 * title or description of any length; this is where the bounds are enforced.
 *
 * Deterministic and idempotent: pages are visited in sorted order, the first
 * page to claim a title or description keeps it, and a page already inside the
 * bounds with a unique value is never rewritten.
 *
 * Usage (standalone): node scripts/repair/bound_search_snippets.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const B = require('../lib/search_snippet_bounds.cjs');
const { listIndexablePages } = require('../lib/site_pages.js');

const ROOT = process.cwd();
const OVERRIDES_PATH = 'data/content/meta_description_overrides.json';

function loadOverrides() {
  const abs = path.join(ROOT, OVERRIDES_PATH);
  if (!fs.existsSync(abs)) return {};
  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return payload.pages || {};
}

function canonicalHost(html) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  const href = m && (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
  try { return new URL(href).host; } catch { return ''; }
}

const SECTION_LABELS = {
  answers: 'Answers', 'use-cases': 'Use cases', vs: 'Comparisons', glossary: 'Glossary',
  methods: 'Methods', insights: 'Insights', platforms: 'Platforms', 'brand-defense': 'Product questions',
  whitepapers: 'White papers', agent: 'Agent notes', 'case-studies': 'Case studies', pillars: 'Pillars',
  models: 'Models', comparisons: 'Head to head', guides: 'Guides', clusters: 'Clusters', topics: 'Topics',
};
function sectionLabel(rel) {
  const top = rel.includes('/') ? rel.split('/')[0] : '';
  return SECTION_LABELS[top] || '';
}

// Page text a description can honestly be taken from when the meta
// description it was generated with is already claimed by another page.
function leadTexts(html) {
  const body = html.slice(Math.max(0, html.search(/<body\b/i)));
  const out = [];
  const def = body.match(/<p\b[^>]*class=["'][^"']*citation-definition[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  if (def) out.push(def[1]);
  for (const m of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) out.push(m[1]);
  return out
    .map((s) => B.norm(B.decodeEntities(s.replace(/<[^>]+>/g, ' '))))
    .filter((s) => s.length >= B.DESC_MIN && !/the system behind this site/i.test(s));
}

function setTitle(html, title) {
  return html.replace(/<title\b([^>]*)>[\s\S]*?<\/title>/i, `<title$1>${B.escapeText(title)}</title>`);
}
function setDescription(html, desc) {
  const parts = html.split(/(<\/head>)/i);
  const head = parts[0];
  const tag = head.match(B.META_DESC_RE);
  if (!tag) return html;
  const replaced = /\bcontent=(["'])[\s\S]*?\1/i.test(tag[0])
    ? tag[0].replace(/\bcontent=(["'])[\s\S]*?\1/i, `content="${B.escapeAttr(desc)}"`)
    : tag[0].replace(/<meta\b/i, `<meta content="${B.escapeAttr(desc)}"`);
  parts[0] = head.replace(tag[0], replaced);
  return parts.join('');
}

function boundSearchSnippets({ dryRun = false } = {}) {
  const overrides = loadOverrides();
  const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
  const takenTitles = new Set();
  const takenDescs = new Set();
  // Exempt pages still hold their title/description: nothing else may take them.
  for (const rel of B.EXEMPT_PAGES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const html = fs.readFileSync(abs, 'utf8');
    takenTitles.add(B.titleOf(html));
    takenDescs.add(B.descriptionOf(html));
  }
  const changes = [];
  const unresolved = [];
  for (const rel of pages) {
    const abs = path.join(ROOT, rel);
    const before = fs.readFileSync(abs, 'utf8');
    let html = before;
    const host = canonicalHost(html);

    // ---- title
    const title = B.titleOf(html);
    let newTitle = title;
    if (title) {
      const cands = B.titleCandidates(title, host);
      const core = B.titleCore(title);
      const label = sectionLabel(rel);
      if (label) {
        cands.push(`${core} | ${label}`);
        cands.push(`${B.cutWords(core, B.TITLE_MAX - label.length - 3)} | ${label}`);
      }
      const pick = cands.filter(B.inTitleRange).find((c) => !takenTitles.has(c));
      if (pick) newTitle = pick;
      else if (B.inTitleRange(title) || title.length > B.TITLE_MAX) unresolved.push({ path: rel, field: 'title', value: title });
      takenTitles.add(newTitle);
      if (newTitle !== title) html = setTitle(html, newTitle);
    }

    // ---- description
    const override = overrides[rel];
    const desc = B.descriptionOf(html);
    let newDesc = desc;
    if (desc || override) {
      const cands = override ? [B.norm(override)] : [];
      cands.push(...B.descriptionCandidates(desc));
      for (const lead of leadTexts(html)) cands.push(...B.descriptionCandidates(lead));
      const pick = cands.filter(B.inDescRange).find((c) => !takenDescs.has(c));
      if (pick) newDesc = pick;
      else if (desc.length >= B.DESC_MIN) unresolved.push({ path: rel, field: 'description', value: desc });
      takenDescs.add(newDesc);
      if (newDesc !== desc) html = setDescription(html, newDesc);
    }

    if (html !== before) {
      changes.push({ path: rel, title: title !== newTitle ? [title, newTitle] : undefined, description: desc !== newDesc ? [desc, newDesc] : undefined });
      if (!dryRun) fs.writeFileSync(abs, html);
    }
  }
  return { scanned: pages.length, changed: changes.length, changes, unresolved };
}

module.exports = { boundSearchSnippets };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const r = boundSearchSnippets({ dryRun });
  if (dryRun) {
    fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'artifacts/validation/search-snippet-bounds-dry-run.json'), JSON.stringify(r, null, 2) + '\n');
  }
  console.log(`[bound-search-snippets] ${dryRun ? 'DRY RUN ' : ''}scanned=${r.scanned}; changed=${r.changed}; unresolved=${r.unresolved.length}`);
}
