#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const payload=JSON.parse(fs.readFileSync('data/programmatic/programmatic_page_candidates.json','utf8'));
const lanePayload=JSON.parse(fs.readFileSync('data/content/programmatic_lane_contracts.json','utf8'));
const lanes=lanePayload.lanes||{};
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uniq(xs){return [...new Set((xs||[]).filter(Boolean))];}
function sourceRows(p){
  const official=(p.official_sources||[]).map(x=>typeof x==='string'?x:x&&x.url).filter(Boolean);
  return uniq([...(p.sources||[]),...official]);
}
for(const p of payload.candidates||[]){
  for(const field of ['path','domain','primary_query','framework','definition','summary','generation_lane','unique_atom','artifact_type']) if(!p[field]) throw new Error(`${p.path||'candidate'} missing ${field}`);
  const lane=lanes[p.generation_lane];
  if(!lane) throw new Error(`${p.path}: unknown generation_lane ${p.generation_lane}`);
  for(const field of lane.required_fields||[]) if(p[field]===undefined||p[field]===null||p[field]===''||(Array.isArray(p[field])&&!p[field].length)) throw new Error(`${p.path}: lane ${p.generation_lane} requires ${field}`);
  const route='/'+p.path.replace(/index\.html$/,''); const canonical=`https://${p.domain}${route}`;
  const reviewed=p.verified_at||p.reviewed_at||payload.generated_at||new Date().toISOString().slice(0,10);
  const steps=(p.steps||[]).map((x,i)=>`<h2 id="step-${i+1}">Step ${i+1}: ${esc(x.title||x)}</h2><p>${esc(x.text||x)}</p>`).join('');
  const rows=p.table_rows||[];
  const table=rows.length?`<section class="page-artifact"><h2>${esc(p.artifact_title||'Decision Table')}</h2><table><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`:'';
  const sections=(p.additional_sections||[]).map(s=>`<section class="page-specific-section"><h2>${esc(s.title)}</h2>${(s.paragraphs||[]).map(x=>`<p>${esc(x)}</p>`).join('')}${(s.items||[]).length?`<ul>${s.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section>`).join('');
  const sources=sourceRows(p);
  const sourceHtml=sources.map(u=>`<li><a href="${esc(u)}" rel="noopener noreferrer">${esc(u)}</a></li>`).join('');
  const disclosure=p.generation_lane==='comparison_graph'?`<section class="comparison-disclosure"><h2>Comparison Disclosure</h2><p>${esc(p.conflict_disclosure)}</p><p><strong>Methodology:</strong> ${esc(p.comparison_methodology)}</p><p><strong>Verified:</strong> <time datetime="${esc(reviewed)}">${esc(reviewed)}</time></p></section>`:'';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.primary_query)}</title><meta name="description" content="${esc(p.definition)}"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/assets/styles.css"></head><body><div class="cta-bar"><a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Get Instant Access</a></div><header><a href="/">Spry Labs</a><a href="/download.html">System Manual</a></header><main><article data-cluster="${esc(p.cluster||p.generation_lane)}" data-programmatic-admission="required" data-programmatic-axis="${esc(p.generation_lane)}"><h1>${esc(p.primary_query)}</h1><p class="citation-definition"><strong>${esc(p.definition)}</strong></p><p class="byline">Reviewed <time datetime="${esc(reviewed)}">${esc(reviewed)}</time></p><aside class="tldr"><strong>TL;DR:</strong> ${esc(p.direct_answer||p.summary)}</aside><section data-llm-answer="true" data-extraction-type="${esc(p.intent||'concept')}" data-named-framework="${esc(p.framework)}"><h2>${esc(p.framework)}</h2><p>${esc(p.summary)}</p>${steps}</section>${table}${sections}<section class="worked-example"><h2>Worked Example</h2><p>${esc(p.worked_example)}</p></section>${disclosure}<section class="sources"><h2>Sources</h2><ul>${sourceHtml}</ul></section><p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p></article></main><footer><a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Get Instant Access</a></footer></body></html>`;
  const out=path.resolve(p.path);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html,'utf8');
}
console.log(`programmatic candidates generated: ${(payload.candidates||[]).length}`);
