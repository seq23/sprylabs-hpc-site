
const path = require('path');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimDescription(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 3).trimEnd() + '...';
}

function hostLabel(host) {
  return host === 'https://billionairehighperformancecoach.com'
    ? 'Billionaire High Performance Coach'
    : 'Spry Executive OS';
}

function imageFor(host) {
  return `${host}/assets/img/bhpc-hero-square.png`;
}

function buildBreadcrumbs(page) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: page.host + '/' },
      { '@type': 'ListItem', position: 2, name: page.collectionLabel || 'Answers', item: page.host + (page.collectionLink || '/answers/') },
      { '@type': 'ListItem', position: 3, name: page.title, item: page.canonical }
    ]
  };
}

function buildJsonLd(page) {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${page.host}/#organization`,
      name: 'Spry Labs',
      url: page.host + '/',
      logo: `${page.host}/assets/spry-logo.png`
    },
    {
      '@type': 'WebSite',
      '@id': `${page.host}/#website`,
      url: page.host + '/',
      name: hostLabel(page.host),
      publisher: { '@id': `${page.host}/#organization` }
    },
    {
      '@type': 'WebPage',
      '@id': `${page.canonical}#webpage`,
      url: page.canonical,
      name: `${page.title} | ${hostLabel(page.host)}`,
      description: page.description,
      isPartOf: { '@id': `${page.host}/#website` },
      primaryImageOfPage: imageFor(page.host),
      about: page.about || page.clusterLabel || 'AI execution systems'
    },
    buildBreadcrumbs(page)
  ];
  if (page.faqQuestion && page.faqAnswer) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${page.canonical}#faq`,
      mainEntity: [{ '@type': 'Question', name: page.faqQuestion, acceptedAnswer: { '@type': 'Answer', text: page.faqAnswer } }]
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

function sectionHtml(section) {
  const body = Array.isArray(section.paragraphs)
    ? section.paragraphs.map((p) => `<p>${p}</p>`).join('')
    : `<p>${section.body || ''}</p>`;
  return `<section class="card"><h2>${escapeHtml(section.heading)}</h2>${body}</section>`;
}

function listSourceSignals(items) {
  if (!items.length) return '<p>No source signals were available for this publish batch.</p>';
  return `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.subreddit || 'Reddit')}</strong>: <a href="${escapeHtml(item.permalink || '#')}">${escapeHtml(item.title || item.canonical_question || 'Source thread')}</a>${item.created_at ? ` <span class="small">(${escapeHtml(item.created_at.slice(0,10))})</span>` : ''}</li>`).join('')}</ul>`;
}

function renderPage(page) {
  const siteName = hostLabel(page.host);
  const title = `${page.title} | ${siteName}`;
  const desc = trimDescription(page.description);
  const ogImage = imageFor(page.host);
  const sections = page.sections.map(sectionHtml).join('');
  const sourceSignals = listSourceSignals(page.sources || []);
  const jsonLd = JSON.stringify(buildJsonLd(page));
  const relatedLinks = (page.requiredLinks || []).map((link) => `<li><a href="${link}">${link}</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>${escapeHtml(title)}</title>
<meta content="${escapeHtml(desc)}" name="description"/>
<meta content="${escapeHtml(title)}" property="og:title"/>
<meta content="${escapeHtml(desc)}" property="og:description"/>
<meta content="website" property="og:type"/>
<meta content="${page.canonical}" property="og:url"/>
<meta content="${escapeHtml(siteName)}" property="og:site_name"/>
<meta content="${ogImage}" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="${escapeHtml(title)}" name="twitter:title"/>
<meta content="${escapeHtml(desc)}" name="twitter:description"/>
<meta content="${ogImage}" name="twitter:image"/>
<link href="${page.canonical}" rel="canonical"/>
<link href="/assets/styles.css" rel="stylesheet"/>
<script defer="" src="/assets/domain-context.js"></script>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body><main class="container main">
<p class="eyebrow">Reddit-informed knowledge page</p>
<h1>${escapeHtml(page.title)}</h1>
<p class="lede">${escapeHtml(page.lede)}</p>
<section class="card"><h2>Short answer</h2><p>${page.shortAnswer}</p></section>
${sections}
<section class="card"><h2>Source signals</h2>${sourceSignals}<p>This page was compiled from public Reddit threads and normalized into a deterministic publishing contract. It is not a raw transcript dump. It is a structured synthesis of what keeps recurring in the source layer.</p></section>
<section class="card"><h2>Related internal links</h2><ul>${relatedLinks}</ul></section>
<section class="callout"><div class="callout__title">Use the full system</div><div class="callout__body"><p>Review the system manual to see how the full structure works: <a href="/download.html">/download.html</a></p></div></section>
</main></body></html>`;
}

module.exports = { renderPage, escapeHtml, trimDescription };
