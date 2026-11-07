#!/usr/bin/env node
/**
 * Writes the A Player Mode routine pages (Pinterest assessment fix list, 7 Nov 2026) from
 * config/aplayermode_routines.json, the same routines the pins are planned from
 * (scripts/aplayermode/routine_pins.mjs), so every pin's steps are on the page it links.
 *
 *   node scripts/aplayermode/build_routine_pages.mjs           write pages + route list + sitemap
 *   node scripts/aplayermode/build_routine_pages.mjs --check   exit 1 if anything would change
 *
 * Writes aplayermode/pages/routines-<slug>.html, adds each /routines/<slug>/ route to
 * config/aplayermode_content_pages.json (read by the Worker and the dual-domain policy),
 * then re-derives aplayermode/sitemap.xml (scripts/aplayermode_sitemap_lastmod.mjs).
 * Planning routines only: no medical, psychological or financial advice, no price on the
 * page body, no app pitch before the routines. Pages outside /routines/ are never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeFor } from './routine_pins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://aplayermode.com';
const ORG = 'https://billionairehighperformancecoach.com/spry-labs#organization';
const check = process.argv.includes('--check');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config/aplayermode_routines.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fileFor = (page) => `aplayermode/pages/routines-${page.slug}.html`;

const HEAD_TAIL = "<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"theme-color\" content=\"#E9E5DE\" media=\"(prefers-color-scheme: light)\">\n<meta name=\"theme-color\" content=\"#1B1916\" media=\"(prefers-color-scheme: dark)\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&amp;family=Outfit:wght@600;700&amp;display=swap\">\n<link rel=\"stylesheet\" href=\"/aplayermode/aplayermode.css\">\n<script defer src=\"/assets/domain-context.js\"></script>\n<script defer src=\"/aplayermode/config.js\"></script>\n<script defer src=\"/aplayermode/app.js\"></script>\n<script defer src=\"/aplayermode/preview-links.js\"></script>\n<script data-clarity-loader>(function(w,d,m){var h=(w.location.hostname||\"\").toLowerCase().replace(/^www\\./,\"\");var id=m[h];if(!id)return;w.clarity=w.clarity||function(){(w.clarity.q=w.clarity.q||[]).push(arguments)};var s=d.createElement(\"script\");s.async=1;s.src=\"https://www.clarity.ms/tag/\"+id;var f=d.getElementsByTagName(\"script\")[0];f.parentNode.insertBefore(s,f)})(window,document,{\"spryexecutiveos.com\":\"y7kuhznig9\",\"billionairehighperformancecoach.com\":\"y7knv03yfx\",\"aplayermode.com\":\"yvtytxiv27\"})</script>\n";
const HEADER = "<header class=\"topbar\">\n  <div class=\"wrap\">\n    <a class=\"brand\" href=\"/\"><span class=\"apm-mark\" aria-hidden=\"true\"></span><span class=\"brand-word\">A Player Mode</span></a>\n    <a class=\"btn btn-ghost btn-join-top\" href=\"https://app.aplayermode.com/join\" rel=\"noopener\">Join \u00b7 $9.99</a>\n  </div>\n</header>";
const FOOTER = "<footer class=\"footer\">\n  <div class=\"wrap\">\n    <p><b>A Player Mode</b> and <b>Billionaire High Performance Coach</b> are products of Spry Labs. Developed by S.L. Taylor through Spry Labs. <a href=\"/about/\">About Spry Labs and A Player Mode</a>.</p>\n    <p>A Player Mode does not provide medical, psychological, legal, financial or therapeutic advice. Results are examples, not guarantees.</p>\n    <p>&copy; 2026 Spry Labs. All rights reserved.</p>\n  </div>\n</footer>";

export function render(page, all) {
  const route = routeFor(page);
  const url = `${SITE}${route}`;
  const date = cfg.published;
  const [main, ...rest] = page.routines;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Spry Labs', url: 'https://billionairehighperformancecoach.com/spry-labs', logo: { '@type': 'ImageObject', url: 'https://billionairehighperformancecoach.com/assets/spry-logo.png', width: 420, height: 96 }, sameAs: ['https://sprylabs.gumroad.com/'], '@id': ORG },
      { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: `${page.h1} | A Player Mode`, description: page.meta, inLanguage: 'en', isPartOf: { '@id': `${SITE}/#website` }, publisher: { '@id': ORG }, datePublished: date, dateModified: date, breadcrumb: { '@id': `${url}#breadcrumb` }, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.definition', '.quick-answer', '.faq-answer'] } },
      { '@type': 'Article', '@id': `${url}#article`, headline: page.h1, description: page.meta, mainEntityOfPage: { '@id': `${url}#webpage` }, author: { '@type': 'Person', name: 'S.L. Taylor', url: `${SITE}/about/` }, publisher: { '@id': ORG }, datePublished: date, dateModified: date, image: `${SITE}/aplayermode/img/og.png` },
      { '@type': 'HowTo', '@id': `${url}#howto`, name: main.title, step: main.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s, text: s })) },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [{ '@type': 'ListItem', position: 1, name: 'A Player Mode', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: page.h1, item: url }] },
      { '@type': 'FAQPage', '@id': `${url}#faq`, url, mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };
  const ol = (steps) => `<ol class="routine-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  const versions = rest.map((r) => `  <section class="section-q" id="${esc(r.id)}">
    <h2>${esc(r.title)}</h2>
    ${ol(r.steps)}
  </section>`).join('\n\n');
  const related = all.filter((p) => p.slug !== page.slug).map((p) => `<li><a href="${routeFor(p)}">${esc(p.h1.split(':')[0])} ›</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.h1)} | A Player Mode</title>
<meta name="description" content="${esc(page.meta)}">
<!-- Generated by scripts/aplayermode/build_routine_pages.mjs from config/aplayermode_routines.json; edit there, not here.
     Served at ${url} by workers/aplayermode-com (CONTENT_PAGES). -->
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/aplayermode/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/aplayermode/img/favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/aplayermode/img/apple-touch-icon.png">
<link rel="manifest" href="/aplayermode/site.webmanifest">
<meta property="og:type" content="article">
<meta property="og:site_name" content="A Player Mode">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.h1)}">
<meta property="og:description" content="${esc(page.meta)}">
<meta property="og:image" content="${SITE}/aplayermode/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.h1)}">
<meta name="twitter:description" content="${esc(page.meta)}">
<meta name="twitter:image" content="${SITE}/aplayermode/img/og.png">
<script type="application/ld+json">
${JSON.stringify(graph, null, 1)}
</script>
${HEAD_TAIL}</head>
<body>

${HEADER}

<main id="top" class="section content-page">
 <div class="wrap narrow">
  <p class="crumbs"><a href="/">← A Player Mode</a> · ${esc(page.h1.split(':')[0])}</p>
  <h1>${esc(page.h1)}</h1>
  <p class="definition">${esc(page.definition)}</p>

  <section class="section-q">
    <h2>Quick answer</h2>
    <p class="quick-answer">${esc(page.quick)}</p>
  </section>

  <section class="section-q" id="${esc(main.id)}">
    <h2>${esc(main.title)}</h2>
    ${ol(main.steps)}
  </section>

${versions}

  <section class="section-q" id="faq">
    <h2>Frequently asked questions</h2>
${page.faq.map(([q, a]) => `    <details class="faq"><summary>${esc(q)}</summary><p class="faq-answer">${esc(a)}</p></details>`).join('\n')}
  </section>

  <aside class="next-step" aria-label="A Player Mode">
    <h2>Want the day planned for you?</h2>
    <p>A Player Mode is a planning app that turns routines like these into a plan ready every morning, and a minimum day when a day goes wrong.</p>
    <a class="btn btn-ghost" href="/">See how A Player Mode works</a>
  </aside>

  <nav class="related" aria-label="Related routines">
    <h2>More routines</h2>
    <ul class="arrow-list">${related}<li><a href="/">A Player Mode home ›</a></li></ul>
  </nav>

  <p class="byline">By S.L. Taylor · Published by Spry Labs · Published ${day(date)} · Updated ${day(date)} · <a href="/about/">About</a></p>
 </div>
</main>

${FOOTER}

</body>
</html>
`;
}

function main() {
  const changed = [];
  const put = (rel, text) => {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === text) return;
    changed.push(rel);
    if (!check) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); }
  };
  for (const page of cfg.pages) put(fileFor(page), render(page, cfg.pages));
  const listRel = 'config/aplayermode_content_pages.json';
  const list = JSON.parse(fs.readFileSync(path.join(root, listRel), 'utf8'));
  const pages = Object.fromEntries(Object.entries(list.pages).filter(([r]) => !r.startsWith('/routines/')));
  for (const page of cfg.pages) pages[routeFor(page)] = `/${fileFor(page)}`;
  put(listRel, `${JSON.stringify({ ...list, pages }, null, 2)}\n`);
  if (check) {
    if (changed.length) { console.error(`[routine-pages] FAIL: would change ${changed.join(', ')}`); process.exit(1); }
    console.log(`[routine-pages] OK: ${cfg.pages.length} pages current`);
    return;
  }
  execFileSync(process.execPath, [path.join(root, 'scripts/aplayermode_sitemap_lastmod.mjs')], { cwd: root, stdio: 'inherit' });
  console.log(`[routine-pages] ${cfg.pages.length} pages, ${changed.length} file(s) written`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
