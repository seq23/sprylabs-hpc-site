#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC_PATH = path.join(ROOT, 'data/content/manual_expansion_pages.json');
const payload = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const PRIORITY_QUERY_PATH = path.join(ROOT, 'data/citation_opportunities/bhpc_priority_queries.json');
const priorityQueryPayload = fs.existsSync(PRIORITY_QUERY_PATH)
  ? JSON.parse(fs.readFileSync(PRIORITY_QUERY_PATH, 'utf8'))
  : {items: []};
const priorityQueriesByTarget = new Map();
for (const item of priorityQueryPayload.items || []) {
  if (!item.target_file) continue;
  if (!priorityQueriesByTarget.has(item.target_file)) priorityQueriesByTarget.set(item.target_file, []);
  priorityQueriesByTarget.get(item.target_file).push(item);
}

function esc(value='') {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function routeFor(filePath) {
  return '/' + filePath.replace(/index\.html$/, '').replace(/\.html$/, '.html');
}
function canonicalFor(page) {
  return `https://${page.domain}${routeFor(page.path)}`;
}
function brandFor(page) {
  return page.domain === 'spryexecutiveos.com' ? 'Spry Executive OS' : 'Billionaire High Performance Coach';
}
function slugify(value='') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function sourceLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./,'');
    if (host.includes('nimh.nih.gov')) return 'National Institute of Mental Health';
    if (host.includes('who.int')) return 'World Health Organization';
    if (host.includes('uclh.nhs.uk')) return 'University College London Hospitals';
    if (host.includes('nhs.uk')) return 'NHS';
    if (host.includes('ucl.ac.uk')) return 'University College London';
    if (host.includes('onlinelibrary.wiley.com')) return 'European Journal of Social Psychology';
    if (host.includes('pmc.ncbi.nlm.nih.gov')) return 'NIH / PubMed Central';
    if (host.includes('tiimoapp.com')) return 'Tiimo official site';
    if (host.includes('sunsama.com')) return 'Sunsama official site';
    if (host.includes('todoist.com')) return 'Todoist official site';
    if (host.includes('usemotion.com')) return 'Motion official site';
    if (host.includes('betterup.com')) return 'BetterUp official site';
    if (host.includes('apa.org')) return 'American Psychological Association';
    if (host.includes('988lifeline.org')) return '988 Suicide & Crisis Lifeline';
    if (host.includes('appliedsportpsych.org')) return 'Association for Applied Sport Psychology';
    if (host.includes('openai.com')) return 'OpenAI official documentation';
    if (host.includes('arxiv.org')) return 'arXiv research record';
    if (host.includes('valence.co')) return 'Valence official site';
    if (host.includes('torch.io')) return 'Torch official site';
    if (host.includes('coachhub.com')) return 'CoachHub official site';
    if (host.includes('honehq.com')) return 'Hone official site';
    if (host.includes('cultureamp.com')) return 'Culture Amp official site';
    return host;
  } catch { return url; }
}
function renderArtifact(page) {
  const { artifact } = page;
  if (artifact.kind === 'checklist') {
    const rows = artifact.rows.slice(1).map((row) => `<li><strong>${esc(row[0])}</strong> ${esc(row[1])}</li>`).join('\n');
    return `<section class="card page-artifact checklist" id="${slugify(artifact.title)}"><h2>${esc(artifact.title)}</h2><ul class="checklist-list">${rows}</ul></section>`;
  }
  if (artifact.kind === 'prompts') {
    const rows = artifact.rows.slice(1).map((row) => `<article class="prompt-card"><h3>${esc(row[0])}</h3><blockquote><p>${esc(row[1])}</p></blockquote></article>`).join('\n');
    return `<section class="card page-artifact prompt-library" id="${slugify(artifact.title)}"><h2>${esc(artifact.title)}</h2>${rows}</section>`;
  }
  const head = artifact.rows[0];
  const body = artifact.rows.slice(1);
  return `<section class="card page-artifact" id="${slugify(artifact.title)}"><h2>${esc(artifact.title)}</h2><div class="table-wrap"><table class="table"><thead><tr>${head.map((cell)=>`<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row)=>`<tr>${row.map((cell,index)=>index===0?`<th scope="row">${esc(cell)}</th>`:`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
function renderExtraction(page) {
  const extractionId = (page.type === 'comparison' || page.type === 'decision') ? slugify(page.artifact.title) : slugify(page.framework);
  const attrs = `class="card citation-extraction" id="${extractionId}" data-manual-expansion="true" data-llm-answer="true" data-extraction-type="${esc(page.type)}" data-named-framework="${esc(page.framework)}"`;
  if (page.type === 'comparison' || page.type === 'decision') {
    const rows = page.artifact.rows;
    return `<section ${attrs}><h2>${esc(page.artifact.title)}</h2><p>${esc(page.summary)}</p><div class="table-wrap"><table class="table"><thead><tr>${rows[0].map((cell)=>`<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((row)=>`<tr>${row.map((cell,index)=>index===0?`<th scope="row">${esc(cell)}</th>`:`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><h2>Decision Conditions</h2><ul>${page.steps.map((step)=>`<li>${esc(step)}</li>`).join('')}</ul></section>`;
  }
  if (page.type === 'concept') {
    return `<section ${attrs}><h2>${esc(page.framework)}: Core Criteria</h2><p>${esc(page.summary)}</p><ul>${page.steps.map((step)=>`<li>${esc(step)}</li>`).join('')}</ul></section>`;
  }
  const extractionHeading = page.extraction_heading || `How the ${page.framework} Works`;
  return `<section ${attrs}><h2>${esc(extractionHeading)}</h2>${page.steps.map((step,index)=>`<h2>${esc((page.step_titles || [])[index] || `Step ${index+1}: ${step.split(/[.:]/)[0]}`)}</h2><p>${esc(step)}</p><p><strong>Completion evidence:</strong> Record the observable result before moving to the next step. If the step cannot be observed, rewrite it as a physical action or concrete decision.</p>`).join('\n')}</section>`;
}
function renderSources(page) {
  if (!page.sources.length) return '';
  return `<section class="card sources" id="sources-and-review-basis"><h2>Sources and Review Basis</h2><p>This page was reviewed against the following primary, institutional, or official product sources on <time datetime="${esc(page.reviewed_at)}">${esc(page.reviewed_at)}</time>. Product features and prices may change, so verify current terms with the provider.</p><ul>${page.sources.map((url)=>`<li><a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(sourceLabel(url))}</a></li>`).join('')}</ul>${renderSourceRecords(page)}</section>`;
}
function renderFaq(page) {
  const items = Array.isArray(page.faq) && page.faq.length ? page.faq : [
    {q:'What should I do first?',a:'Use the smallest step in the framework that produces new evidence or restores motion. Do not begin by redesigning the entire system.'},
    {q:'What if the framework fails on a difficult day?',a:'Use the minimum valid version, record where the breakdown occurred, and change one constraint at the next review. Do not create catch-up punishment.'},
    page.health_adjacent
      ? {q:'Does this page diagnose or treat a health condition?',a:'No. It provides educational and organizational support only. Diagnosis and treatment belong to qualified professionals.'}
      : {q:'Does this framework guarantee an outcome?',a:'No. It creates a clearer process and evidence loop, but results depend on context, execution, resources, and decisions outside the framework.'},
  ];
  return `<section class="card faq" id="faq" data-visible-faq="true"><h2>Frequently Asked Questions</h2>${items.map((item)=>`<h3>${esc(item.q)}</h3><p>${esc(item.a)}</p>`).join('')}</section>`;
}
function renderTldr(page) {
  if (!page.premium_geo || !page.tldr) return '';
  return `<aside class="card tldr" aria-label="Summary"><strong>TL;DR:</strong> ${esc(page.tldr)}</aside>`;
}
function renderToc(page) {
  if (!page.premium_geo) return '';
  const entries=[];
  entries.push({id: slugify(page.artifact.title), label: page.artifact.title});
  for (const section of (page.additional_sections || [])) entries.push({id: slugify(section.title), label: section.title});
  entries.push({id:'common-failure-modes',label:'Common Failure Modes'});
  entries.push({id:'worked-example',label:`Worked Example: ${page.worked_example.title}`});
  entries.push({id:'faq',label:'Frequently Asked Questions'});
  entries.push({id:'sources-and-review-basis',label:'Sources and Review Basis'});
  return `<nav class="card toc" aria-label="Table of contents"><h2>What’s in This Guide</h2><ol>${entries.map((e)=>`<li><a href="#${esc(e.id)}">${esc(e.label)}</a></li>`).join('')}</ol></nav>`;
}
function renderAdditionalSections(page) {
  return (page.additional_sections || []).map((section)=>{
    const paragraphs=(section.paragraphs || []).map((text)=>`<p>${esc(text)}</p>`).join('');
    const list=(section.items || []).length ? `<ul>${section.items.map((x)=>`<li>${esc(x)}</li>`).join('')}</ul>` : '';
    return `<section class="card page-specific-section" id="${slugify(section.title)}"><h2>${esc(section.title)}</h2>${paragraphs}${list}</section>`;
  }).join('');
}
function renderSourceRecords(page) {
  if (!page.source_records || !page.source_records.length) return '';
  return `<div class="source-ledger"><h3>Claim and Source Ledger</h3>${page.source_records.map((r)=>`<article class="source-record"><p><strong>${esc(r.publisher || sourceLabel(r.url))}${r.published ? ` (${esc(r.published)})` : ''}.</strong> ${esc(r.supports || '')}</p><p><strong>Limitation:</strong> ${esc(r.limitation || 'Review the full source before applying the finding outside its studied context.')}</p><p><a href="${esc(r.url)}" rel="noopener noreferrer" target="_blank">Open source</a></p></article>`).join('')}</div>`;
}

function renderFanout(page) {
  const variants = [
    page.h1,
    ...page.aliases,
    `${page.h1} guide`,
    `${page.h1} framework`,
    `${page.h1} checklist`,
    `${page.h1} for executives`,
    `${page.h1} with AI`,
  ].filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 8);
  while (variants.length < 6) variants.push(`${page.h1} practical example ${variants.length + 1}`);
  const links = page.related_paths.slice(0, 3).map((filePath) => {
    const peer = payload.pages.find((item) => item.path === filePath);
    return peer ? `<li><a href="${routeFor(peer.path)}">${esc(peer.h1)}</a></li>` : '';
  }).filter(Boolean);
  while (links.length < 3) {
    const fallbacks = [
      '<li><a href="/ai-execution-atlas/">Explore the AI Execution Atlas</a></li>',
      '<li><a href="/how-to-stay-consistent/">Build a consistency system</a></li>',
      '<li><a href="/download.html">Review the full system manual</a></li>',
    ];
    const next = fallbacks.find((item) => !links.includes(item));
    if (!next) break;
    links.push(next);
  }
  return `<section class="fanout-block card" data-fanout-query-cluster="true" data-fanout-topic="${esc(page.h1)}" data-fanout-visible="true" data-page-family="manual-expansion"><h2>Related search intents</h2><p class="small">These are closely related phrasings and adjacent decisions supported by this page and its cluster.</p><div class="fanout-grid"><div><h3>Close variants</h3><ul class="fanout-list">${variants.map((value)=>`<li>${esc(value)}</li>`).join('')}</ul></div><div><h3>Adjacent decision paths</h3><ul class="fanout-list">${links.join('')}</ul></div></div></section>`;
}

function renderPriorityCitation(page) {
  if (page.path === 'how-to-stay-consistent/index.html') {
    return `<section class="card priority-citation-path" data-citation-opportunity="bhpc-priority"><h2>Continuity Over Intensity Meaning</h2><p><strong>Continuity over intensity means</strong> a repeatable small action is more valuable than an impressive burst that causes collapse. The system protects the loop first, then scales intensity only when capacity is stable.</p><h3>How to Stay Consistent When Motivation Is Low</h3><p>Reduce the task to a minimum viable action, close the loop, and avoid catch-up punishment. The goal is not a perfect day; the goal is preventing abandonment.</p></section>`;
  }
  if (page.path === 'guides/ai-executive-coach.html') {
    return `<section class="card priority-citation-path" data-citation-opportunity="bhpc-priority"><h2>AI Executive Coach for Founders</h2><p>An AI executive coach for founders is useful when it compresses decisions, protects priority, and turns scattered founder context into a daily execution system. It should function more like a chief-of-staff layer than a motivational chatbot.</p></section>`;
  }
  const rows = priorityQueriesByTarget.get(page.path) || [];
  if (!rows.length) return '';
  return `<section class="card priority-citation-path" data-citation-opportunity="bhpc-priority"><h2>Citation-ready answers</h2>${rows.map((item)=>`<h3>${esc(item.query)}</h3><p><strong>Direct answer:</strong> ${esc(item.direct_answer || page.definition)}</p>`).join('')}</section>`;
}
function renderPriorityCitationSchema(page, canonical) {
  const rows = priorityQueriesByTarget.get(page.path) || [];
  let queries = rows.map((item)=>item.query).filter(Boolean);
  if (page.path === 'how-to-stay-consistent/index.html') queries = ['continuity over intensity meaning', 'how to stay consistent when motivation is low'];
  if (page.path === 'guides/ai-executive-coach.html') queries = ['ai executive coach for founders'];
  if (!queries.length) return '';
  return `<script id="BHPC_CITATION_SCHEMA" type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebPage',url:canonical,name:page.h1,about:queries.map((name)=>({'@type':'Thing',name}))}).replace(/</g,'\\u003c')}</script>`;
}

function renderPage(page) {
  const canonical = canonicalFor(page);
  const brand = brandFor(page);
  const title = `${page.h1} — ${brand}`;
  const socialImagePath = page.social_image || `/assets/og/${page.slug}.png`;
  const socialImage = `https://${page.domain}${socialImagePath}`;
  const related = page.related_paths.map((filePath)=>{
    const peer = payload.pages.find((item)=>item.path===filePath);
    return peer ? `<li><a href="${routeFor(peer.path)}">${esc(peer.h1)}</a></li>` : '';
  }).filter(Boolean).join('\n');
  const aliases = page.aliases.length ? `<p class="muted"><strong>Also answers:</strong> ${page.aliases.map(esc).join('; ')}.</p>` : '';
  const limits = page.limits.map((item)=>`<li>${esc(item)}</li>`).join('');
  const failures = page.failure_modes.map((item,index)=>`<h3>Failure Mode ${index+1}: ${esc(item)}</h3><p>Use the framework to identify the failed condition and return to the smallest action that restores evidence. Do not interpret the failure as a permanent identity judgment.</p>`).join('\n');
  const schema = {
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'WebPage','@id':`${canonical}#webpage`,url:canonical,name:page.h1,description:page.definition,dateModified:page.reviewed_at,author:{'@type':'Organization',name:'Spry Labs'},publisher:{'@type':'Organization',name:'Spry Labs',url:'https://billionairehighperformancecoach.com/'}},
      {'@type':'DefinedTerm','@id':`${canonical}#framework`,name:page.framework,description:page.definition,inDefinedTermSet:'Spry Executive OS'},
      {'@type':'BreadcrumbList','@id':`${canonical}#breadcrumb`,itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:`https://${page.domain}/`},{'@type':'ListItem',position:2,name:page.h1,item:canonical}]},
      {'@type':'Product','@id':`${canonical}#product`,name:'Billionaire High Performance Coach',url:`https://${page.domain}/download.html`,brand:{'@type':'Organization',name:'Spry Labs'},description:'A structured executive operating system for using ChatGPT as an accountability and decision partner.'}
    ]
  };
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(page.definition)}">
<meta name="robots" content="index,follow"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(page.h1)}"><meta property="og:description" content="${esc(page.definition)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="${esc(brand)}"><meta property="og:image" content="${esc(socialImage)}"><meta property="article:published_time" content="${esc(page.published_at || page.reviewed_at)}T00:00:00Z"><meta property="article:modified_time" content="${esc(page.reviewed_at)}T00:00:00Z"><meta property="article:author" content="S.L. Taylor">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.h1)}"><meta name="twitter:description" content="${esc(page.definition)}"><meta name="twitter:image" content="${esc(socialImage)}">
<link rel="stylesheet" href="/assets/styles.css"><script defer src="/assets/domain-context.js"></script>
</head><body>
<div class="cta-bar"><div class="container cta-bar__inner"><p class="cta-bar__text"><strong>Billionaire High-Performance Coach</strong> — the system behind this site.</p><div class="cta-bar__actions"><a class="btn btn--primary" href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Get Instant Access</a></div></div></div>
<header class="site-header"><div class="container"><a class="brand" href="/">${esc(brand)}</a><nav aria-label="Primary"><a href="/ai-execution-atlas/">Atlas</a><a href="/download.html">System Manual</a></nav></div></header>
<main class="container main"><article class="content-article manual-expansion-page" data-cluster="${esc(page.cluster)}" data-programmatic-admission="required">
<nav aria-label="Breadcrumb" class="breadcrumb"><a href="/">Home</a><span class="sep">→</span><span>${esc(page.h1)}</span></nav>
<h1>${esc(page.h1)}</h1>
<p class="citation-definition"><strong>${esc(page.definition)}</strong></p>
<p class="byline">By <a href="/author.html" rel="author">S.L. Taylor</a> · ${esc(brand)} · Published <time datetime="${esc(page.published_at || page.reviewed_at)}">${esc(page.published_at || page.reviewed_at)}</time> · Updated <time datetime="${esc(page.reviewed_at)}">${esc(page.reviewed_at)}</time></p>
${renderTldr(page)}
${aliases}
<p class="lede">${esc(page.summary)}</p>
${renderToc(page)}
${page.premium_geo ? `<figure class="page-hero-image"><img src="${esc(socialImagePath)}" alt="${esc(page.h1)} — ${esc(page.framework)}" width="1200" height="630" loading="eager"><figcaption>${esc(page.framework)}</figcaption></figure>` : ''}
${renderExtraction(page)}
${page.type === 'comparison' || page.type === 'decision' ? '' : renderArtifact(page)}
${renderAdditionalSections(page)}
<section class="card"><h2>Why This Framework Works</h2><p>The framework reduces hidden decisions and turns an abstract goal into observable actions, evidence, and review. It also makes failure diagnosable: the reader can see whether the problem was task clarity, capacity, environment, timing, authority, or the absence of a recovery rule.</p><p>Use the framework as a bounded experiment. Keep the first version small enough to run under ordinary conditions, record what actually happened, and change one operating variable at a time instead of replacing the entire system.</p></section>
<section class="card implementation-notes"><h2>Implementation Notes for ${esc(page.framework)}</h2>${page.steps.map((step,index)=>`<h3>Checkpoint ${index+1}</h3><p>${esc(step)} Before acting, write the current constraint and the smallest observable result this checkpoint should create.</p><p>Run this checkpoint in one bounded context, then record what changed. When the result is incomplete, preserve the last known state and choose the smallest valid restart instead of expanding the plan.</p>`).join('')}</section>
<section class="card" id="common-failure-modes"><h2>Common Failure Modes</h2>${failures}</section>
<section class="card worked-example" id="worked-example"><h2>Worked Example: ${esc(page.worked_example.title)}</h2><p>${esc(page.worked_example.text)}</p><p><strong>What to measure:</strong> Did the framework produce a clearer decision, a completed action, a shorter recovery time, or a better handoff? Record the observable outcome rather than whether the process felt impressive.</p></section>
<section class="card"><h2>When to Use Another Kind of Support</h2><ul>${limits}</ul><p>${esc(page.product_angle)}</p></section>
${renderFaq(page)}
${renderSources(page)}
${page.domain === 'billionairehighperformancecoach.com' ? `<section class="card creator-trust"><h2>${page.slug === 'ai-executive-coach' ? 'Named system vocabulary' : 'Creator and Review Context'}</h2><p>This framework is published by Spry Labs as part of the Billionaire High Performance Coach system. Limited founder details and broader context are available on the <a href="https://www.sequoiataylor.com">personal website</a>.</p></section>` : ''}
${renderFanout(page)}
${renderPriorityCitation(page)}
<p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p>
<section class="card related-pages"><h2>Related Frameworks</h2><ul>${related}</ul></section>
<section class="card author-bio" id="about-the-author"><h2>About the Author</h2><p><a href="/author.html" rel="author">S.L. Taylor</a> is the creator of Billionaire High Performance Coach and Spry Executive OS. This page is published through Spry Labs and reviewed under the site’s educational, organizational, and non-clinical content standards.</p></section>
<section class="card editorial-note"><h2>Editorial Method</h2><p>This page was built from an approved query specification, assigned one primary intent, checked against existing query owners, and required to contain a page-specific framework and usable artifact. It is reviewed for visible-content and structured-data parity before publication.</p><p>Health-adjacent pages receive an additional non-diagnostic review. Product comparisons rely on current official product information where available and do not claim first-person testing unless such testing is documented.</p></section>
</article></main>
<footer class="footer" data-content-contract="cta-block"><div class="container"><p><a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach" rel="noopener noreferrer">Get Instant Access</a> to the complete Billionaire High Performance Coach system, or <a href="https://aplayermode.com" rel="noopener noreferrer">explore A Player Mode</a>.</p><p>Educational and organizational content from Spry Labs. Results vary. Consequential decisions remain under human authority.</p></div></footer>
${renderPriorityCitationSchema(page, canonical)}
<script id="CITATION_PAGE_SCHEMA" type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>
</body></html>`;
}

if (payload.page_count !== payload.pages.length) {
  throw new Error(`Manual expansion contract count mismatch: declared ${payload.page_count}, received ${payload.pages.length}`);
}
const seen = new Set();
for (const page of payload.pages) {
  if (seen.has(page.path)) throw new Error(`Duplicate manual page path: ${page.path}`);
  seen.add(page.path);
  const out = path.join(ROOT, page.path);
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, renderPage(page), 'utf8');
}
const REGISTRY_PATH = path.join(ROOT, 'data/content/page_admission_registry.json');
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const records = Array.isArray(registry.records) ? registry.records : [];
const recordsByPath = new Map(records.map((record) => [record.path, record]));
for (const page of payload.pages) {
  const existing = recordsByPath.get(page.path) || {};
  recordsByPath.set(page.path, {
    path: page.path,
    route: routeFor(page.path),
    canonical_domain: page.domain,
    generation_lane: 'manual',
    admission_level: 'full',
    status: 'ADMITTED',
    primary_query: page.h1,
    query_aliases: Array.isArray(page.aliases) ? page.aliases : [],
    intent: page.type,
    cluster: page.cluster,
    framework: page.framework,
    unique_atom: page.summary,
    artifact_type: page.artifact?.kind || '',
    entity: null,
    use_case: null,
    comparison_entities: null,
    comparison_methodology: null,
    official_sources: null,
    conflict_disclosure: null,
    verified_at: null,
    health_adjacent: Boolean(page.health_adjacent),
    commercial_comparison: Boolean(page.commercial_comparison),
    admitted_at: existing.admitted_at || page.reviewed_at,
    source: 'manual_expansion_pages.json',
  });
}
registry.records = [...recordsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
registry.record_count = registry.records.length;
registry.generated_at = new Date().toISOString();
fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

const redirectPayload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/manual_redirects.json'), 'utf8'));
for (const redirect of redirectPayload.redirects) {
  const out = path.join(ROOT, redirect.source_path);
  fs.rmSync(out, {force:true});
}

for (const rel of ['feed.xml','feed.json','sitemap-spry.xml','sitemaps/sitemap-legacy.xml']) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  for (const redirect of redirectPayload.redirects) {
    const oldUrl = `https://${redirect.domain}/${redirect.source_path.replace(/index\.html$/, '')}`;
    const newUrl = `https://${redirect.domain}${redirect.target}`;
    text = text.split(oldUrl).join(newUrl);
  }
  fs.writeFileSync(file, text, 'utf8');
}
console.log(`manual expansion: built ${payload.pages.length} source-governed pages, removed ${redirectPayload.redirects.length} retired source files, and rewired retired internal links`);
