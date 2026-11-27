#!/usr/bin/env node
/**
 * aplayermode.com/questions/: the index of every question page on the apex (27 Nov 2026, her yes:
 * "yes turn those searches into pages").
 *
 * The Search Loop engine (seq23/search-loop, config search-loop.aplayermode.config.json) writes one
 * page per search into aplayermode/questions/<slug>/index.html; the engine writes no index of its
 * own, and every engine page's breadcrumb names /questions/. This script lists, from the committed
 * files (never from a ledger that could disagree with them):
 *   - every engine page whose slug the Worker routes (QUESTION_SLUG_RE), by its H1, and
 *   - every hand-built page under /questions/ in CONTENT_PAGES (config/aplayermode_content_pages.json).
 * It is re-run by the engine's post-build (.github/scripts/search_loop_aplayermode_post_build.sh),
 * so a page the engine adds or removes joins or leaves the index in the same commit.
 *
 *   node scripts/aplayermode/build_questions_index.mjs          write aplayermode/questions/index.html
 *   node scripts/aplayermode/build_questions_index.mjs --check  exit 1 if the committed index is stale
 *
 * Guard: tests/aplayermode/questions_route.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_PAGES, QUESTION_SLUG_RE } from '../../workers/aplayermode-com/src/index.js';
import { stripTags } from '../lib/html_text.mjs';

export const OUT = 'aplayermode/questions/index.html';
const ORIGIN = 'https://aplayermode.com';
const TITLE = 'Questions about AI coaching and day planning | A Player Mode';
const DESCRIPTION = 'Plain answers to what people ask before they pick an AI coach, planner or chief of staff app, and what A Player Mode does and does not do for each one.';
const H1 = 'Questions people ask before they choose';
const LEAD = 'Each page answers one question people ask about AI coaching, planning and follow-through apps, in plain words.';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ENTITIES = { '&#x27;': "'", '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const decode = (s) => s.replace(/&#x27;|&#39;|&quot;|&lt;|&gt;|&amp;/g, (e) => ENTITIES[e]);
// Tags stripped until none is left (scripts/lib/html_text.mjs), then decoded once; render() escapes it again.
const text = (html) => decode(stripTags(html, '')).replace(/\s+/g, ' ').trim();
const h1Of = (html) => text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
const noindex = (html) => /<meta[^>]+(?:name="robots"[^>]+content="[^"]*noindex|content="[^"]*noindex[^"]*"[^>]+name="robots")/i.test(html);

/** Every question page on the apex: [{ route, file, h1 }], hand-built first, then engine pages by slug. */
export function questionEntries(root = process.cwd()) {
  const out = [];
  for (const [route, file] of Object.entries(CONTENT_PAGES)) {
    if (!route.startsWith('/questions/')) continue;
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    if (!noindex(html)) out.push({ route, file: file.replace(/^\//, ''), h1: h1Of(html) });
  }
  const dir = path.join(root, 'aplayermode/questions');
  const slugs = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && QUESTION_SLUG_RE.test(d.name)).map((d) => d.name).sort() : [];
  for (const slug of slugs) {
    const file = `aplayermode/questions/${slug}/index.html`;
    const route = `/questions/${slug}/`;
    if (!fs.existsSync(path.join(root, file)) || out.some((e) => e.route === route)) continue;
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    if (!noindex(html)) out.push({ route, file, h1: h1Of(html) });
  }
  // A page with no H1 would be an empty link: refuse rather than publish one.
  for (const e of out) if (!e.h1) throw new Error(`[questions-index] ${e.file} has no <h1>; refusing to list an empty link`);
  return out;
}

export function render(entries) {
  const url = `${ORIGIN}/questions/`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: TITLE, description: DESCRIPTION, inLanguage: 'en', isPartOf: { '@id': `${ORIGIN}/#website` },
        mainEntity: { '@type': 'ItemList', numberOfItems: entries.length, itemListElement: entries.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}${e.route}`, name: e.h1 })) } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'A Player Mode', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Questions', item: url },
      ] },
    ],
  };
  const list = entries.length
    ? `<ul class="question-list">\n${entries.map((e) => `    <li><a href="${esc(e.route)}">${esc(e.h1)}</a></li>`).join('\n')}\n  </ul>`
    : '<p>No questions are answered here yet. The first pages are on their way.</p>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<!-- GENERATED by scripts/aplayermode/build_questions_index.mjs from the committed question pages; do not edit. Served at ${url} by workers/aplayermode-com. -->
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/aplayermode/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/aplayermode/img/apple-touch-icon.png">
<link rel="manifest" href="/aplayermode/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="A Player Mode">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(H1)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:image" content="${ORIGIN}/aplayermode/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(graph)}</script>
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#E9E5DE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1B1916" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&amp;family=Outfit:wght@600;700&amp;display=swap">
<link rel="stylesheet" href="/aplayermode/aplayermode.css">
<link rel="stylesheet" href="/aplayermode/questions.css">
</head>
<body>
${HEADER_HTML}
<main class="section content-page">
 <div class="wrap narrow">
  <p class="crumbs"><a href="/">← A Player Mode</a> · Questions</p>
  <h1>${esc(H1)}</h1>
  <p class="definition">${esc(LEAD)}</p>
  ${list}
 </div>
</main>
${FOOTER_HTML}
</body>
</html>
`;
}

// The one header and footer for every question page; search-loop.aplayermode.config.json
// template.header_html / footer_html carry the same strings (the test checks they match).
export const HEADER_HTML = `<header class="topbar">
  <div class="wrap">
    <a class="brand" href="/"><span class="apm-mark" aria-hidden="true"></span><span class="brand-word">A Player Mode</span></a>
    <a class="btn btn-ghost btn-join-top" href="/#plans">See the plans</a>
  </div>
</header>`;
export const FOOTER_HTML = `<footer class="footer">
  <div class="wrap">
    <p><b>A Player Mode</b> and <b>Billionaire High Performance Coach</b> are products of Spry Labs. Developed by S.L. Taylor through Spry Labs. <a href="/about/">About Spry Labs and A Player Mode</a>. <a href="/questions/">More questions</a>.</p>
    <p>A Player Mode does not provide medical, psychological, legal, financial or therapeutic advice. Results are examples, not guarantees.</p>
    <nav aria-label="Legal" class="legal-links"><a href="https://app.aplayermode.com/terms">Terms of Service</a><a href="https://app.aplayermode.com/privacy">Privacy Policy</a><a href="/disclaimer/">Disclaimer</a></nav>
    <p>&copy; 2026 Spry Labs. All rights reserved.</p>
  </div>
</footer>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = render(questionEntries());
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (before !== html) { console.error(`[questions-index] FAIL ${OUT} is stale; run node scripts/aplayermode/build_questions_index.mjs`); process.exit(1); }
    console.log(`[questions-index] OK ${OUT}`);
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    if (before !== html) fs.writeFileSync(OUT, html);
    console.log(`[questions-index] ${before === html ? 'unchanged' : 'wrote'} ${OUT}`);
  }
}
