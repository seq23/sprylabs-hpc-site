#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { content, HOST, keepers, isRetiredRoute, isRetiredFile, targetFor } = require('../lib/spry_rescue.cjs');
const { routeFor } = require('../lib/dual_domain_policy.cjs');
const { listSitePages } = require('../lib/site_pages.js');
const { brandedTitle, descriptionCandidates } = require('../lib/search_snippet_bounds.cjs');
const { protectedPages } = require('../lib/protected_pages.cjs');
const { organizationNode } = require('../lib/organization_node.cjs');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frameworkFor = g => g.definition.split(/\s(?:is|are)\s/)[0];
const fileFor = r => r.endsWith('/') ? r.slice(1)+'index.html' : r.slice(1)+'.html';
const source = 'https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions';
function render(g) {
  const url = HOST + g.route;
  const related = content.guides.filter(x => x.id !== g.id).slice(0, 3);
  const org = organizationNode();
  const faq = { '@type':'FAQPage', '@id':url+'#faq', mainEntity:g.faq.map(f=>({'@type':'Question', name:f.question, acceptedAnswer:{'@type':'Answer',text:f.answer}})) };
  const graph = { '@context':'https://schema.org', '@graph':[
    org,
    {'@type':'WebPage','@id':url,url,name:g.title,speakable:{'@type':'SpeakableSpecification',cssSelector:['.definition','#faq']}},
    {'@type':'Article','@id':url+'#article',headline:g.title,mainEntityOfPage:{'@id':url},author:{'@id':org['@id']},publisher:{'@id':org['@id']},datePublished:g.published,dateModified:g.updated},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Spry guides',item:HOST+'/knowledge-map/'},{'@type':'ListItem',position:2,name:g.title,item:url}]},faq] };
  const description = descriptionCandidates(g.definition)[0];
  const title = brandedTitle(g.title, HOST);
  const demand = JSON.parse(fs.readFileSync('data/search_intelligence/spryexecutiveos.com/demand_families.json')).families.find(f => f.strengthened && f.primary_page.file === fileFor(g.route));
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
  const demandAttrs = demand ? ` data-demand-family="${demand.id}" data-demand-hash="${require('crypto').createHash('sha256').update(JSON.stringify(sorted(demand.content)).replace(/</g,'\\u003c')).digest('hex').slice(0,16)}"` : '';
  const sections = g.sections.map(s => `<h2>${esc(s.question)}</h2><p>${esc(s.answer)}</p>`).join('\n');
  const nextStep = `<aside class="recommendation-summary" aria-label="Next step"><h2>What is the next step?</h2><p>Review the complete system manual, what it includes and the current terms before deciding whether it fits your needs.</p><a href="https://billionairehighperformancecoach.com/download.html?page_kind=guide&amp;slug=${encodeURIComponent(g.id)}${demand ? '&amp;ref=demand-spry-'+demand.id : ''}">See the Spry system manual</a></aside>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}">
<link rel="stylesheet" href="/assets/styles.css"><meta property="og:type" content="article"><meta property="og:title" content="${esc(g.title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:site_name" content="Spry Executive OS"><meta property="og:image" content="${HOST}/assets/og/default-spryexecutiveos.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Spry Executive OS planning guides"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(g.title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${HOST}/assets/og/default-spryexecutiveos.png">
<script id="CITATION_PAGE_SCHEMA" type="application/ld+json">${JSON.stringify(graph).replace(/</g,'\\u003c')}</script></head>
<body><header class="site-header"><div class="container"><a class="brand" href="/knowledge-map/">Spry Executive OS</a><nav aria-label="Primary"><a href="/knowledge-map/">Practical guides</a> · <a href="/about">About Spry Labs</a></nav></div></header>
<main class="container"><nav aria-label="Breadcrumb"><a href="/knowledge-map/">Spry guides</a> / ${esc(g.title)}</nav><article>
<section${demandAttrs} data-llm-answer="true" data-priority-citation="true" data-extraction-type="answer" data-named-framework="${esc(frameworkFor(g))}"><h1>${esc(g.title)}</h1><p class="definition citation-definition"><strong>${esc(g.definition)}</strong></p>
<h2>Quick answer</h2><p>${esc(g.steps[0])}</p><p><strong>What this guide is best for:</strong> ${esc(g.best_for)}</p>${demand ? sections + nextStep : ''}</section>
<h2>How do you put this into practice?</h2><p>Use the following sequence as a starting plan, then adjust it to the work you are responsible for.</p><ol>${g.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
${g.table ? '<h2>How do the options compare?</h2><table><thead><tr>'+g.table.headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+g.table.rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>' : ''}
${demand ? '' : sections}
<h2>What would this look like in practice?</h2><p>${esc(g.example)}</p>
<h2>Which planning principle supports the method?</h2><p>The <a href="${source}">National Cancer Institute’s archived implementation-intentions resource</a> describes if–then plans that connect a situational cue with an intended action. Spry’s examples here are editorial applications of that planning idea, not evidence that this particular guide or product produces a measured outcome. The source is retained for reference and is no longer maintained.</p><p>Source reviewed 2 November 2026.</p>
<section id="faq"><h2>Frequently asked questions</h2>${g.faq.map(f=>`<h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p>`).join('\n')}</section>
${demand ? '' : nextStep}
<nav aria-label="Related guides"><h2>Which related guides can help?</h2><ul>${related.map(x=>`<li><a href="${x.route}">${esc(x.title)}</a></li>`).join('')}</ul></nav>
</article></main><footer class="footer container"><p>By <a href="/about">Spry Labs</a> · Published <time datetime="${g.published}">${g.published}</time> · Updated <time datetime="${g.updated}">${g.updated}</time></p><p>Educational planning guidance. Examples are illustrative; results vary.</p></footer></body></html>\n`;
}
function write(rel, text) { fs.mkdirSync(path.dirname(rel),{recursive:true}); if (!fs.existsSync(rel)||fs.readFileSync(rel,'utf8')!==text) fs.writeFileSync(rel,text); }
function build() {
  // Capture every previously published or generated Spry route before replacing
  // crawl surfaces. The ledger is cumulative, so a later source deletion cannot
  // lose an old URL's 301.
  const ledgerPath = 'data/seo/spry_rescue_redirects.json';
  const previous = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath)) : { redirects:[] };
  const routes = new Set(previous.redirects.map(r=>r.from));
  for (const rel of listSitePages()) if (isRetiredFile(rel)) routes.add(routeFor(rel));
  for (const name of ['sitemap-spry.xml', 'sitemaps/sitemap-legacy.xml']) {
    if (!fs.existsSync(name)) continue;
    for (const [,url] of fs.readFileSync(name,'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = new URL(url); if (u.origin === HOST && isRetiredRoute(u.pathname)) routes.add(u.pathname);
    }
  }
  const { CONSOLIDATED_ROUTES } = require('../../functions/_lib/host_consolidation.js');
  const redirects = [...routes].filter(isRetiredRoute).sort().map(from=>({from,to:CONSOLIDATED_ROUTES.get(from)||targetFor(from)}));
  if (!redirects.length) throw new Error('Search rescue discovered zero retired routes');
  for (const g of content.guides) write(fileFor(g.route), render(g));
  // The topic directory and publisher page are functional index/trust surfaces,
  // not additional query variants. They use the same factual publisher identity.
  const directory = {...content.guides[0],id:'guides',route:'/knowledge-map/',title:'Spry Executive OS practical planning guides',definition:'Spry Executive OS is a collection of practical planning guides published by Spry Labs. The guides explain how to choose work, maintain a routine, review progress and use AI for structured reflection. Each topic has one primary guide, with examples, boundaries and a route to the publisher’s system manual.',best_for:'readers choosing the guide that matches the work or planning problem in front of them.',steps:content.guides.map(g=>g.title),sections:[],example:'Choose the topic that describes your current question. Use its worked example and steps to make a small plan, then review what happened before adding another tool or routine.',faq:content.guides[0].faq};
  let index = render(directory).replace('<ol>'+directory.steps.map(s=>`<li>${esc(s)}</li>`).join('')+'</ol>','<ul>'+content.guides.map(g=>`<li><a href="${g.route}">${esc(g.title)}</a> — ${esc(g.best_for)}</li>`).join('')+'</ul>');
  write(fileFor(directory.route),index);
  const about = {...directory,id:'about',route:'/about',title:'About Spry Labs and these planning guides',definition:'Spry Labs is the publisher of Spry Executive OS, a collection of educational guides about planning, execution and structured reflection. These pages offer practical methods and illustrative examples. They distinguish editorial recommendations from sourced research and direct readers to the publisher’s main product page for current contents and purchase terms.',steps:['We use the business name Spry Labs as the editorial byline. These guides do not claim an invented individual author or professional credential.','Research references identify their source and the scope of the supporting idea. Our worked examples are illustrative, not customer testimonials.','Publication and update dates change when this editorial source changes. A rebuild alone does not refresh the stated review date.','AI-supported planning remains subject to human review. These guides do not provide medical, legal or investment advice.'],example:'A planning example describes a possible way to use a routine. It is not a report about a customer, a clinical study or a promise that a product will deliver a financial result.',faq:content.guides[0].faq};
  write(fileFor(about.route),render(about));
  write(ledgerPath,JSON.stringify({schema_version:1,reviewed_on:content.reviewed_on,kept:[...keepers].sort(),redirects},null,2)+'\n');
  // Exact aliases at the edge avoid Pages' static _redirects limit. Do not
  // capture a different existing BHPC route through an overbroad slash alias.
  const { hostFor } = require('../lib/dual_domain_policy.cjs');
  const pairs = new Map();
  for (const r of redirects) {
    const forms = r.from.endsWith('/') ? [r.from,r.from+'index.html',r.from.slice(0,-1)] : [r.from,r.from+'.html'];
    for (const f of forms) if (hostFor(f.replace(/\.html$/,'')) === HOST && !keepers.has(f)) pairs.set(f,r.to);
  }
  write('functions/_lib/spry_rescue_table.js',`// Generated by scripts/content/build_spry_rescue.cjs. Exact URL aliases only.\nexport const SPRY_RESCUE_REDIRECTS = new Map(${JSON.stringify([...pairs].sort(),null,2)});\n`);
  // Rewrite discovery at the same boundary as the page generator; no redirect
  // URL is advertised as an indexable article after this stage.
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...keepers].sort().map(r=>`  <url><loc>${HOST+r}</loc><lastmod>${content.reviewed_on}</lastmod></url>`).join('\n')+'\n</urlset>\n';
  write('sitemap-spry.xml',sitemap);
  for (const name of ['sitemaps/sitemap-legacy.xml', ...fs.readdirSync('sitemaps').filter(n=>n.endsWith('.xml')).map(n=>'sitemaps/'+n)]) {
    if (!fs.existsSync(name)) continue;
    write(name,fs.readFileSync(name,'utf8').replace(/\s*<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g,(all,u)=>{try{const p=new URL(u);return p.origin===HOST&&isRetiredRoute(p.pathname)?'':all;}catch{return all;}}));
  }
  // Update the existing active-page ledger rather than leaving sitemaps and
  // discovery contracts to disagree about which pages are live.
  const registryPath = 'data/citation/citable_pages.json';
  const registry = JSON.parse(fs.readFileSync(registryPath));
  const queries = JSON.parse(fs.readFileSync('data/citation/query_registry.json')).queries;
  for (const p of registry.pages) {
    if (p.canonical_url && new URL(p.canonical_url).origin===HOST && isRetiredRoute(new URL(p.canonical_url).pathname)) { p.status='REDIRECTED'; p.redirect_target=redirects.find(r=>r.from===new URL(p.canonical_url).pathname)?.to||targetFor(new URL(p.canonical_url).pathname); }
  }
  for (const g of [...content.guides,directory,about]) {
    let p = registry.pages.find(p=>p.canonical_url===HOST+g.route);
    if (!p) { p={path:fileFor(g.route),canonical_url:HOST+g.route,canonical_domain:'spryexecutiveos.com'};registry.pages.push(p); }
    Object.assign(p,{status:'ACTIVE',editorial_title:g.title,schema_type:'Article',definition:g.definition,query:queries.find(q=>q.primary_page===fileFor(g.route))?.query||p.query||g.title,extraction_type:'answer',framework:frameworkFor(g)});
    delete p.redirect_target;
  }
  write(registryPath,JSON.stringify(registry,null,2)+'\n');
  // Replace retired internal links everywhere in the remaining deploy surface;
  // source archives stay intact and keep their exact edge redirects.
  const alias = pairs;
  for (const rel of listSitePages().filter(p=>!isRetiredFile(p))) {
    const html = fs.readFileSync(rel,'utf8');
    const updated = html.replace(/href=(['"])([^'"<>]+)\1/g,(all,q,href)=>{
      try { const u = new URL(href,HOST); if (![HOST,'https://billionairehighperformancecoach.com'].includes(u.origin)) return all;
        const to = alias.get(u.pathname); return to ? `href=${q}${to}${u.search}${u.hash}${q}` : all;
      } catch { return all; }
    });
    // Protected revenue surface stays byte-for-byte intact.
    if (rel !== 'index.html' && !protectedPages().has(rel)) write(rel,updated);
  }
  // Keep the BHPC portions of AI discovery, replacing retired Spry references
  // with kept guide destinations rather than multiplying stale variants.
  for (const name of ['llms.txt','llms-full.txt']) {
    if (!fs.existsSync(name)) continue;
    let text = fs.readFileSync(name,'utf8').replace(/\n\n## Spry Executive OS guides[\s\S]*$/, '').split('\n').filter(line=>![...routes].some(r=>line.includes(HOST+r))).join('\n');
    text += '\n\n## Spry Executive OS guides\n'+content.guides.map(g=>`- [${g.title}](${HOST+g.route})`).join('\n')+'\n';
    // Stable on repeat builds.
    text=text.replace(/\n\n## Spry Executive OS guides[\s\S]*?(?=\n\n## Spry Executive OS guides)/g,'');
    write(name,text);
  }
  console.log(`spry-rescue: kept=${keepers.size} retired=${redirects.length} exact_aliases=${pairs.size}`);
  return {kept:keepers.size,redirected:redirects.length};
}
if (require.main === module) build();
module.exports={build,render,fileFor};
