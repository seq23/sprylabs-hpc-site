'use strict';
const fs=require('fs');
const path=require('path');
const { contractShell, esc } = require('./content_contract');
const ROOT=process.cwd();
function readJson(p,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
function humanTitle(value){return String(value||'execution systems').replace(/^synthesis-/,'').split('-').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')}
function profileFor(item){const d=readJson('data/synthesis/differentiation_profiles.json',{profiles:{}});return d.profiles?.[item.cluster_id]||null}
function ul(items){return `<ul>${(items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}
function linkList(items){return `<ul>${(items||[]).map(x=>`<li><a href="${esc(x)}">${esc(humanTitle(x.replace(/^\//,'').replace(/\/$/,'')))}</a></li>`).join('')}</ul>`}
function citationDefinition(p){return `${p.framework_name} is a named operating framework for ${String(p.topic||'this topic').toLowerCase()} through observable signals, decision criteria, and practical next actions.`}
function isCitable(item){const d=readJson('data/citation/citable_pages.json',{pages:[]});const target=`${item.slug||'synthesis'}.html`;return (d.pages||[]).some(x=>x.status==='ACTIVE'&&x.path===target)}
function citationSchema(item,p,title,canonicalUrl){
 const definition=citationDefinition(p);
 const graph=[
  {'@type':'WebPage','@id':`${canonicalUrl}#webpage`,url:canonicalUrl,name:title,headline:title,description:definition,mainEntityOfPage:canonicalUrl,author:{'@type':'Organization',name:'Spry Labs',url:'https://billionairehighperformancecoach.com/'},publisher:{'@type':'Organization',name:'Spry Labs',url:'https://billionairehighperformancecoach.com/'}},
  {'@type':'DefinedTerm','@id':`${canonicalUrl}#framework`,name:p.framework_name,description:definition,inDefinedTermSet:'Spry Executive OS'}
 ];
 return `<script id="CITATION_PAGE_SCHEMA" type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script>`;
}
function renderSynthesisBody(item={}){
 const p=profileFor(item); const topic=p?.topic||humanTitle(item.cluster_id||item.slug); const persona=p?.persona||'operator';
 if(!p) throw new Error(`Missing differentiation profile for synthesis cluster: ${item.cluster_id}`);
 return `
<h1>${esc(item.title||`What people keep asking about ${topic}`)}</h1>
${isCitable(item)?`<p class="citation-definition"><strong>${esc(citationDefinition(p))}</strong></p>`:''}
<p class="answer-first"><strong>Direct answer:</strong> ${esc(p.thesis)}</p>
<section class="card citation-extraction" data-extraction-type="concept" data-llm-answer="true" data-named-framework="${esc(p.framework_name)}" data-priority-citation="true"><h2>${esc(p.framework_name)}</h2><p class="citation-definition"><strong>${esc(citationDefinition(p))}</strong></p>${ul((p.topic_checks||[]).slice(0,3))}</section>
<section data-synthesis-section="question"><h2>${esc(p.core_question)}</h2><p>${esc(p.persona_context)}</p><p>${esc(p.principle)}</p></section>
<section data-synthesis-section="distinctive"><h2>What is distinctive about this query cluster</h2><p>${esc(p.distinctive_focus)}</p><p>The page is intentionally scoped around this specific operating problem rather than treating the audience label as the only difference.</p>${ul(p.topic_checks)}<p><strong>Useful success evidence:</strong> ${esc(p.success_evidence)}</p></section>
<section data-synthesis-section="constraints"><h2>The constraints that change the answer</h2><p>The useful answer changes when the operating environment changes. For this topic, the following constraints are part of the decision rather than edge cases.</p>${ul(p.constraints)}</section>
<section data-synthesis-section="failure-modes"><h2>Failure modes to diagnose before adding another tactic</h2>${ul(p.failure_modes)}<p>${esc(p.tradeoffs)}</p></section>
<section data-synthesis-section="deep-dive"><h2>A deeper look at this specific problem</h2>${(p.deep_dive||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</section>
<section data-synthesis-section="scenario"><h2>A realistic ${esc(persona)} scenario</h2><p>${esc(p.scenario)}</p><p>The point of the example is not to copy the exact schedule. It is to show how the rule survives contact with a real constraint instead of requiring a perfect day.</p></section>
<section data-synthesis-section="framework"><h2>${esc(p.framework_name)}</h2><p>${esc(p.decision_method)}</p><ol>${p.action_steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>
<section data-synthesis-section="decision-check"><h2>Decision check</h2><p>Use this approach when the same execution problem has repeated often enough that another piece of advice is unlikely to solve it. The framework should reduce recurring decisions, make completion observable, and provide a clean recovery path when conditions are imperfect.</p><p>Do not use an execution framework as a substitute for licensed medical, mental-health, legal, or financial guidance. It is an organizational and behavioral operating layer.</p></section>
<section data-synthesis-section="faq"><h2>Questions people ask next</h2>${p.faqs.map(x=>`<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join('')}</section>
${isCitable(item)?`<section data-synthesis-section="product-context"><h2>Where this framework fits</h2><p>This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.</p><p><a href="/download.html">Review the full operating system and implementation guide.</a></p></section>`:''}
<section data-synthesis-section="related"><h2>Related operating-system resources</h2>${linkList(p.related_links)}</section>`;
}
function renderSynthesis(item={}){
 const p=profileFor(item); const title=item.title||`What people keep asking about ${humanTitle(item.cluster_id||'execution')}`;
 const description=p?`${p.thesis} This ${p.persona} guide focuses on ${p.distinctive_focus}.`:(item.description||'A synthesis article about AI-assisted discipline, coaching, and execution systems.');
 const canonicalUrl=`${item.canonical_domain||'https://billionairehighperformancecoach.com'}/${item.slug||'synthesis'}.html`;
 const bodyHtml=renderSynthesisBody({...item,title,description});
 const structuredData=citationSchema(item,p,title,canonicalUrl);
 return contractShell({title,description,canonicalUrl,pageType:'synthesis',answer:p?.thesis||description,ctaReason:`Use the full operating system when ${String(p?.topic||'this problem').toLowerCase()} becomes a repeated execution pattern.`,bodyHtml,structuredData});
}
module.exports={renderSynthesis};
