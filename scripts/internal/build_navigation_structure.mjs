#!/usr/bin/env node
/**
 * Build the navigable structure that the library never had.
 *
 * 2,464 of 2,851 pages were unreachable from the homepage: sitemaps and
 * IndexNow announce a URL, but a page with no inbound internal link is not
 * something a crawler has a reason to keep. This script builds the missing
 * middle - section hubs and topic hubs - so every page sits three clicks or
 * fewer from the homepage, and gives each page a breadcrumb and a set of
 * genuine siblings.
 *
 * Deliberately NOT a link dump: no page here carries more than
 * MAX_LINKS_PER_HUB links, hubs are grouped by real topic rather than by
 * alphabet, and nothing is stuffed into a global footer. Anchor text is each
 * target's own h1.
 *
 * Idempotent: every injected block is delimited by a data-internal-nav marker
 * and is replaced, not appended, on re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const ROOT = process.cwd();
const { routeFor, hostFor } = requireCjs(path.join(ROOT, 'scripts/lib/dual_domain_policy.cjs'));

const MAX_LINKS_PER_HUB = 70;
const SIBLINGS_PER_PAGE = 6;
const PROTECTED = new Set(['download.html']);

const OG_IMAGE = 'https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png';

// ---------------------------------------------------------------- taxonomy
// Ordered: a page joins the first topic whose keywords it matches, so the more
// specific topics are listed first.
const TOPICS = [
  ['adhd-and-executive-function', 'ADHD and executive function', ['adhd', 'executive-dysfunction', 'executive-function', 'task-paralysis', 'brain-fog', 'time-blindness']],
  ['chatgpt-prompts-and-setup', 'ChatGPT prompts and setup', ['chatgpt', 'prompt', 'gpt-', 'custom-instruction']],
  ['ai-coaching-and-alternatives', 'AI coaching and alternatives', ['ai-coach', 'ai-executive', 'ai-life-coach', 'ai-accountability', 'ai-vs', 'coaching', 'coach-', 'betterup', 'coachhub', 'torch', 'hone', 'therapist', 'therapy']],
  ['accountability-systems', 'Accountability systems', ['accountab', 'check-in', 'follow-through', 'partner']],
  ['daily-planning-and-routines', 'Daily planning and routines', ['daily', 'morning', 'evening', 'routine', 'plan-your-day', 'wake-up', 'sunday', 'day-'], ],
  ['weekly-and-long-range-planning', 'Weekly and long-range planning', ['weekly', 'week', 'quarterly', '90-day', 'annual', 'review', 'roadmap']],
  ['consistency-and-habits', 'Consistency and habits', ['consistent', 'consistency', 'habit', 'streak', 'discipline', 'never-miss', 'no-catch-up', 'restart', 'reset']],
  ['procrastination-and-overplanning', 'Procrastination and overplanning', ['procrastinat', 'overplan', 'overthink', 'doomscroll', 'lazy', 'avoid', 'stall', 'stuck', 'researching-instead']],
  ['burnout-energy-and-recovery', 'Burnout, energy and recovery', ['burnout', 'recover', 'energy', 'exhaust', 'rest', 'sleep', 'overwhelm', 'stress', 'low-energy']],
  ['focus-and-attention', 'Focus and attention', ['focus', 'distract', 'attention', 'deep-work', 'concentrat']],
  ['decisions-and-prioritisation', 'Decisions and prioritisation', ['decision', 'prioriti', 'choose', 'what-should-i-work-on', 'clarity', 'trade-off', 'quit']],
  ['founders-and-operators', 'Founders and operators', ['founder', 'operator', 'ceo', 'executive', 'chief-of-staff', 'startup', 'entrepreneur', 'solopreneur', 'agency']],
  ['teams-and-leadership', 'Teams and leadership', ['team', 'delegat', 'manager', 'leader', 'hiring', 'report']],
  ['fitness-and-health', 'Fitness and health', ['fitness', 'workout', 'weight', 'diet', 'eating', 'health', 'gym', 'training', 'athlete', 'nutrition']],
  ['money-and-wealth', 'Money and wealth', ['wealth', 'money', 'billionaire', 'revenue', 'income', 'financial', 'rich']],
  ['identity-and-motivation', 'Identity and motivation', ['identity', 'motivat', 'self-respect', 'standards', 'confidence', 'shame', 'failure', 'behind-in-life', 'average']],
  ['tools-and-comparisons', 'Tools and comparisons', ['-vs-', 'versus', 'alternative', 'compare', 'comparison', 'notion', 'todoist', 'app', 'tool', 'platform', 'software']],
  ['systems-and-frameworks', 'Systems and frameworks', ['system', 'framework', 'architecture', 'engine', 'loop', 'protocol', 'method', 'model', 'operating', 'structure', 'template', 'workflow']],
];
const FALLBACK_TOPIC = ['practice-and-application', 'Practice and application'];

// Section -> display name + one-line purpose used in the hub description.
const SECTIONS = [
  ['insights', 'Insights', 'Working notes on execution, attention and follow-through.'],
  ['answers', 'Answers', 'Direct answers to the questions people actually ask about running themselves.'],
  ['use-cases', 'Use cases', 'What the system looks like in a specific situation.'],
  ['vs', 'Comparisons', 'Side-by-side looks at how the approach differs from the alternatives.'],
  ['glossary', 'Glossary', 'Definitions for the terms the rest of the library relies on.'],
  ['methods', 'Methods', 'The named procedures, step by step.'],
  ['guides', 'Guides', 'Longer-form walkthroughs for the recurring execution problems.'],
  ['platforms', 'Platforms', 'How the system behaves on specific tools and surfaces.'],
  ['brand-defense', 'Product questions', 'Straight answers about what this product is and is not.'],
  ['whitepapers', 'White papers', 'The longer research pieces behind the frameworks.'],
  ['agent', 'Agent notes', 'Machine-readable passes over the same questions.'],
  ['case-studies', 'Case studies', 'Worked examples with a named situation and outcome.'],
  ['pillars', 'Pillars', 'The load-bearing themes the library is organised around.'],
  ['models', 'Models', 'The mental models the frameworks are built on.'],
  ['comparisons', 'Head to head', 'Direct product comparisons.'],
];
const SECTION_NAMES = new Map(SECTIONS.map(([id, name]) => [id, name]));
const SECTION_BLURB = new Map(SECTIONS.map(([id, , blurb]) => [id, blurb]));
const DIR_SECTIONS = new Set(['insights', 'answers', 'use-cases', 'vs', 'glossary', 'methods',
  'platforms', 'brand-defense', 'whitepapers', 'agent', 'case-studies', 'pillars', 'models', 'comparisons']);

// -------------------------------------------------------------- utilities
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function cleanHeading(h1) {
  return norm(String(h1)
    .replace(/\s+[—|]\s+(Spry Executive OS|Billionaire High Performance Coach)\s*$/i, '')
    .replace(/\s*\|\s*(Spry Executive OS|Billionaire High Performance Coach)\s*$/i, ''));
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return '';
  return norm(m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

function sectionOf(rel) {
  const top = rel.includes('/') ? rel.split('/')[0] : '(root)';
  return DIR_SECTIONS.has(top) ? top : 'guides';
}

function topicOf(rel, h1) {
  const hay = (rel + ' ' + h1).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const [id, name, keys] of TOPICS) {
    if (keys.some((k) => hay.includes(k))) return [id, name];
  }
  return FALLBACK_TOPIC;
}

// Python json.dumps default separators, so the block sits alongside the
// neighbours the Python schema writers produce without reformatting them.
function pyJson(value) {
  if (Array.isArray(value)) return '[' + value.map(pyJson).join(', ') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pyJson(v)}`).join(', ') + '}';
  }
  return JSON.stringify(value);
}

// ------------------------------------------------------------- page model
// Every publicly served page, not only the citable ones: the synthesis pages,
// product.html and templates/ are served, were orphaned, and are exactly the
// kind of page that never gets found. The deny-list mirrors
// scripts/assemble_pages_output.js.
const DENY_TOP = new Set(['.git', '.github', '.build', '.pages-output', '.wrangler',
  '.validation-cache', '.validation-runtime', 'node_modules', 'scripts', 'data', 'reports',
  'artifacts', 'docs', 'tests', 'fixtures', 'config', 'content', 'functions', 'seo',
  'LICENSES', 'dist', 'admin', 'coverage', 'test-results', 'playwright-report']);
const NEVER_LISTED = new Set(['index.html', '404.html', 'admin.html', 'download.html']);
// The hubs this script owns, so a re-run does not list its own output.
// Anchored to the known section ids: a loose [a-z0-9-]+/index.html would also
// swallow ordinary one-level pages like agency/ or adhd-tips/ and quietly drop
// them back out of the navigation.
const SECTION_IDS = SECTIONS.map(([id]) => id);
const HUB_RE = new RegExp(`^(?:(?:${SECTION_IDS.join('|')})/(?:topics/[a-z0-9-]+/)?index\\.html|guides/[a-z0-9-]+/index\\.html)$`);
function walkHtml(dir, depth, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (depth === 0 && DENY_TOP.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(full, depth + 1, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
const citableByPath = new Map(JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8'))
  .pages.filter((p) => p.status === 'ACTIVE').map((p) => [p.path, p]));
const ownedHubs = new Set(fs.existsSync('artifacts/validation/internal-navigation-structure.json')
  ? (JSON.parse(fs.readFileSync('artifacts/validation/internal-navigation-structure.json', 'utf8')).hub_paths || [])
  : []);
const pages = [];
for (const rel of walkHtml(ROOT, 0, [])) {
  if (PROTECTED.has(rel) || NEVER_LISTED.has(rel)) continue;
  if (ownedHubs.has(rel) || HUB_RE.test(rel)) continue;
  const html = fs.readFileSync(rel, 'utf8');
  if (/content=["'][^"']*noindex/i.test(html)) continue;
  const meta = citableByPath.get(rel);
  const route = routeFor(rel);
  const host = meta ? 'https://' + meta.canonical_domain : hostFor(route);
  const h1 = cleanHeading(extractH1(html)) || (meta && meta.query) || rel;
  const section = sectionOf(rel);
  const [topicId, topicName] = topicOf(rel, h1);
  pages.push({ rel, h1, canonical: meta ? meta.canonical_url : host + route, host, route, section, topicId, topicName });
}
pages.sort((a, b) => a.h1.localeCompare(b.h1) || a.rel.localeCompare(b.rel));

// section -> topic -> pages, splitting any oversized topic into numbered parts
const bySection = new Map();
for (const pg of pages) {
  if (!bySection.has(pg.section)) bySection.set(pg.section, new Map());
  const topics = bySection.get(pg.section);
  if (!topics.has(pg.topicId)) topics.set(pg.topicId, { name: pg.topicName, pages: [] });
  topics.get(pg.topicId).pages.push(pg);
}

// A section small enough to list in full does not get topic hubs: its pages
// belong directly on the section hub, one click closer.
const hubs = [];   // {rel, route, host, title, h1, description, parents:[{name,href}], links:[{href,text}]}
const topicHubByPage = new Map();

function sectionHubRel(section) {
  return section === 'guides' ? 'guides/index.html' : `${section}/index.html`;
}
function topicHubRel(section, topicId, part) {
  const suffix = part > 1 ? `-${part}` : '';
  return section === 'guides'
    ? `guides/${topicId}${suffix}/index.html`
    : `${section}/topics/${topicId}${suffix}/index.html`;
}

for (const [section, topics] of bySection) {
  const total = [...topics.values()].reduce((n, t) => n + t.pages.length, 0);
  const sectionRel = sectionHubRel(section);
  const sectionRoute = routeFor(sectionRel);
  const sectionHost = hostFor(sectionRoute);
  const sectionName = SECTION_NAMES.get(section) || section;
  const sectionCrumb = { name: sectionName, href: sectionRoute };
  const sectionLinks = [];

  if (total <= MAX_LINKS_PER_HUB) {
    for (const topic of topics.values()) {
      for (const pg of topic.pages) {
        sectionLinks.push({ href: pg.route, text: pg.h1 });
        topicHubByPage.set(pg.rel, { crumbs: [sectionCrumb], siblings: topic.pages });
      }
    }
  } else {
    for (const [topicId, topic] of topics) {
      const chunks = [];
      for (let i = 0; i < topic.pages.length; i += MAX_LINKS_PER_HUB) chunks.push(topic.pages.slice(i, i + MAX_LINKS_PER_HUB));
      chunks.forEach((chunk, idx) => {
        const rel = topicHubRel(section, topicId, idx + 1);
        const route = routeFor(rel);
        const label = chunks.length > 1 ? `${topic.name} (${idx + 1} of ${chunks.length})` : topic.name;
        hubs.push({
          rel, route, host: hostFor(route), kind: 'topic',
          h1: `${label} in ${sectionName.toLowerCase()}`,
          title: `${label} | ${sectionName} | Spry Executive OS`,
          description: `${chunk.length} ${sectionName.toLowerCase()} pages on ${topic.name.toLowerCase()}, listed by what each one answers.`,
          parents: [sectionCrumb],
          intro: `Every ${sectionName.toLowerCase()} page in the library about ${topic.name.toLowerCase()}. Each link is the page's own heading, so you can tell what it answers before you open it.`,
          links: chunk.map((pg) => ({ href: pg.route, text: pg.h1 })),
        });
        sectionLinks.push({ href: route, text: `${label} — ${chunk.length} pages` });
        const crumbs = [sectionCrumb, { name: label, href: route }];
        for (const pg of chunk) topicHubByPage.set(pg.rel, { crumbs, siblings: chunk });
      });
    }
  }

  hubs.push({
    rel: sectionRel, route: sectionRoute, host: sectionHost, kind: 'section',
    h1: `${sectionName}: the full index`,
    title: `${sectionName} index | Spry Executive OS`,
    description: `${SECTION_BLURB.get(section) || ''} ${total} pages, grouped by topic.`.trim(),
    parents: [],
    intro: SECTION_BLURB.get(section) || '',
    links: sectionLinks,
  });
}

// ------------------------------------------------------------ hub rendering
function breadcrumbHtml(host, parents, selfName) {
  const parts = ['<a href="/">Home</a>'];
  for (const p of parents) parts.push(`<span class="sep">→</span><a href="${esc(p.href)}">${esc(p.name)}</a>`);
  parts.push(`<span class="sep">→</span><span>${esc(selfName)}</span>`);
  return `<nav aria-label="Breadcrumb" class="breadcrumb">${parts.join('')}</nav>`;
}
function breadcrumbJsonLd(canonical, host, parents, selfName) {
  const items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: host + '/' }];
  for (const p of parents) items.push({ '@type': 'ListItem', position: items.length + 1, name: p.name, item: host + p.href });
  items.push({ '@type': 'ListItem', position: items.length + 1, name: selfName, item: canonical });
  return { '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb', itemListElement: items };
}

function renderHub(hub) {
  const canonical = hub.host + hub.route;
  const crumbs = breadcrumbHtml(hub.host, hub.parents, hub.h1);
  const graph = [
    { '@type': 'CollectionPage', '@id': canonical + '#webpage', url: canonical, name: hub.h1, description: hub.description,
      isPartOf: { '@type': 'WebSite', '@id': hub.host + '/#website', url: hub.host + '/' },
      publisher: { '@type': 'Organization', name: 'Spry Labs', url: 'https://billionairehighperformancecoach.com/' } },
    breadcrumbJsonLd(canonical, hub.host, hub.parents, hub.h1),
    { '@type': 'ItemList', '@id': canonical + '#itemlist', numberOfItems: hub.links.length,
      itemListElement: hub.links.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.text, url: hub.host + l.href })) },
  ];
  const items = hub.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta content="width=device-width, initial-scale=1" name="viewport"/><title>${esc(hub.title)}</title><meta content="${esc(hub.description)}" name="description"/><link href="${canonical}" rel="canonical"/><meta content="${canonical}" property="og:url"/><meta content="${esc(hub.title)}" property="og:title"/><meta content="${esc(hub.description)}" property="og:description"/><meta content="${OG_IMAGE}" property="og:image"/><meta content="summary_large_image" name="twitter:card"/><meta content="${OG_IMAGE}" name="twitter:image"/><meta content="index,follow" name="robots"/><link href="/assets/styles.css" rel="stylesheet"/><script defer="" src="/assets/domain-context.js"></script><script id="CITATION_PAGE_SCHEMA" type="application/ld+json">${pyJson({ '@context': 'https://schema.org', '@graph': graph })}</script></head><body data-internal-nav-page="hub"><header class="header"><div class="header__inner container"><a class="brand" href="/">Billionaire High Performance Coach</a><nav class="nav"><a class="nav__link" href="/download.html">Download</a><a class="nav__link" href="/start-here">Start here</a></nav></div></header><main class="container main"><article class="content-article">${crumbs}<h1>${esc(hub.h1)}</h1><p class="citation-definition"><strong>${esc(hub.intro || hub.description)}</strong></p><section class="card" data-internal-nav="hub-index"><h2>${esc(hub.links.length)} pages</h2><ul>${items}</ul></section><section class="contract-cta" data-content-contract="cta-block"><p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p><p><a href="/download.html">Review the system manual to see how the full structure works</a>.</p></section></article></main><footer class="footer"><div class="footer__row"><a href="/download.html">Review the system manual</a></div></footer></body></html>
`;
}

const HUB_INDEX_RE = /<section\b[^>]*data-internal-nav="hub-index"[^>]*>[\s\S]*?<\/section>/i;

// Some section hubs are pages that already exist and carry their own editorial
// contract (word floors, citation blocks, a definition). Those are injected
// into, never replaced - the navigation is additive.
function hubIndexSection(hub) {
  const items = hub.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('');
  return `<section class="card" data-internal-nav="hub-index"><h2>${esc(hub.links.length)} pages in this section</h2><ul>${items}</ul></section>`;
}

let hubsWritten = 0;
let hubsInjected = 0;
for (const hub of hubs) {
  fs.mkdirSync(path.dirname(hub.rel), { recursive: true });
  const onDisk = fs.existsSync(hub.rel) ? fs.readFileSync(hub.rel, 'utf8') : null;
  const ownGenerated = onDisk !== null && onDisk.includes('data-internal-nav-page="hub"');
  if (onDisk !== null && !ownGenerated) {
    let html = fs.readFileSync(hub.rel, 'utf8');
    const before = html;
    const block = hubIndexSection(hub);
    if (HUB_INDEX_RE.test(html)) html = html.replace(HUB_INDEX_RE, block);
    else if (/<\/article>/i.test(html)) html = html.replace(/<\/article>/i, `${block}</article>`);
    else html = html.replace(/<\/main>/i, `${block}</main>`);
    if (html !== before) { fs.writeFileSync(hub.rel, html); hubsInjected++; }
    continue;
  }
  const html = renderHub(hub);
  if (onDisk !== html) { fs.writeFileSync(hub.rel, html); hubsWritten++; }
}

// ------------------------------------------------- inject into content pages
// Matches both spellings that exist in the tree: nav[aria-label="Breadcrumb"]
// / nav.breadcrumb (which the schema derivation sees) and the older plural
// nav[aria-label="Breadcrumbs"] / nav.breadcrumbs (which it does not). Both are
// removed so a page ends up with exactly one visible trail.
const BREADCRUMB_RE_G = /<nav\b[^>]*(?:aria-label="Breadcrumbs?"|class="[^"]*\bbreadcrumbs?\b[^"]*")[^>]*>[\s\S]*?<\/nav>/gi;
const RELATED_RE = /<section\b[^>]*data-internal-nav="related"[^>]*>[\s\S]*?<\/section>/i;

function replaceBreadcrumbJsonLd(html, node) {
  const scriptRe = /(<script id="CITATION_PAGE_SCHEMA"[^>]*>)([\s\S]*?)(<\/script>)/i;
  const m = html.match(scriptRe);
  if (!m) return html;
  let body = m[2];
  const serialized = pyJson(node);
  const start = body.search(/\{"@type":\s?"BreadcrumbList"/);
  if (start >= 0) {
    let depth = 0, end = -1, inStr = false, escNext = false;
    for (let i = start; i < body.length; i++) {
      const c = body[i];
      if (escNext) { escNext = false; continue; }
      if (c === '\\') { escNext = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) return html;
    body = body.slice(0, start) + serialized + body.slice(end);
  } else {
    const close = body.lastIndexOf(']');
    if (close < 0) return html;
    body = body.slice(0, close) + ', ' + serialized + body.slice(close);
  }
  return html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length);
}

let pagesTouched = 0;
const siblingCursor = new Map();
for (const pg of pages) {
  const info = topicHubByPage.get(pg.rel);
  if (!info) continue;
  let html = fs.readFileSync(pg.rel, 'utf8');
  const before = html;

  // --- breadcrumb (visible first: the schema is derived from it) ---
  // Any href that lived only inside a removed trail is carried into the
  // related block, so replacing a trail never drops a link off the page.
  const crumbHtml = breadcrumbHtml(pg.host, info.crumbs, pg.h1);
  const removed = html.match(BREADCRUMB_RE_G) || [];
  const carried = [];
  for (const nav of removed) {
    for (const m of nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = m[1];
      const text = norm(m[2].replace(/<[^>]+>/g, ''));
      if (href === '/' || !text) continue;
      if (info.crumbs.some((c) => c.href === href)) continue;
      if (!carried.some((c) => c.href === href)) carried.push({ href, text });
    }
  }
  if (removed.length) html = html.replace(BREADCRUMB_RE_G, '');
  html = html.replace(/(<h1\b)/i, `${crumbHtml}$1`);
  html = replaceBreadcrumbJsonLd(html, breadcrumbJsonLd(pg.canonical, pg.host, info.crumbs, pg.h1));

  // --- siblings: a rotating window so the whole topic gets inbound links,
  //     not just whichever pages happen to sort first ---
  const pool = info.siblings.filter((s) => s.rel !== pg.rel);
  if (pool.length || carried.length) {
    const start = siblingCursor.get(pg.topicId) || 0;
    const picks = [];
    for (let i = 0; i < Math.min(SIBLINGS_PER_PAGE, pool.length); i++) picks.push(pool[(start + i) % pool.length]);
    siblingCursor.set(pg.topicId, (start + Math.max(1, Math.floor(pool.length / Math.max(1, info.siblings.length)) || 1) + 1) % pool.length);
    const parent = info.crumbs[info.crumbs.length - 1];
    const carriedHtml = carried.length
      ? `<p>Also in this area: ${carried.map((c) => `<a href="${esc(c.href)}">${esc(c.text)}</a>`).join(', ')}.</p>`
      : '';
    const block = `<section class="card" data-internal-nav="related"><h2>Related pages</h2><ul>${picks.map((s) => `<li><a href="${esc(s.route)}">${esc(s.h1)}</a></li>`).join('')}</ul>${carriedHtml}<p><a href="${esc(parent.href)}">See all ${esc(parent.name.toLowerCase())} pages</a></p></section>`;
    if (RELATED_RE.test(html)) html = html.replace(RELATED_RE, block);
    else if (/<\/article>/i.test(html)) html = html.replace(/<\/article>/i, `${block}</article>`);
    else html = html.replace(/<\/main>/i, `${block}</main>`);
  }

  if (html !== before) { fs.writeFileSync(pg.rel, html); pagesTouched++; }
}

// ------------------------------------------------------------- homepage nav
const HOME_RE = /<nav\b[^>]*data-internal-nav="library"[^>]*>[\s\S]*?<\/nav>/i;
const sectionHubs = hubs.filter((h) => h.kind === 'section').sort((a, b) => a.rel.localeCompare(b.rel));
const homeBlock = `<nav aria-label="Library" class="library-nav" data-internal-nav="library"><h2>Browse the library</h2><ul>${sectionHubs.map((h) => `<li><a href="${esc(h.route)}">${esc(SECTION_NAMES.get(h.rel.split('/')[0]) || h.h1)}</a> — ${esc(h.links.length)} entries</li>`).join('')}</ul></nav>`;
let home = fs.readFileSync('index.html', 'utf8');
const homeBefore = home;
if (HOME_RE.test(home)) home = home.replace(HOME_RE, homeBlock);
else home = home.replace(/<\/main>/i, `${homeBlock}</main>`);
if (home !== homeBefore) fs.writeFileSync('index.html', home);

const report = {
  status: 'PASS',
  hub_paths: hubs.map((h) => h.rel).sort(),
  hubs_total: hubs.length,
  section_hubs: sectionHubs.length,
  topic_hubs: hubs.length - sectionHubs.length,
  hubs_written: hubsWritten,
  hubs_injected: hubsInjected,
  pages_touched: pagesTouched,
  max_links_per_hub: Math.max(...hubs.map((h) => h.links.length)),
  homepage_updated: home !== homeBefore,
};
fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/internal-navigation-structure.json', JSON.stringify(report, null, 2) + '\n');
console.log(`[build:navigation] hubs=${hubs.length} (section=${report.section_hubs} topic=${report.topic_hubs}) written=${hubsWritten} injected=${hubsInjected} pages_touched=${pagesTouched} max_links_per_hub=${report.max_links_per_hub}`);
