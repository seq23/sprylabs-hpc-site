#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const contractPath=path.join(ROOT,'data/authority_scale/kpi_truth_contract.json');
const ledgerPath=path.join(ROOT,'data/authority_scale/observed_surfacing_ledger.json');
const errors=[];
if(!fs.existsSync(contractPath)) errors.push('missing_kpi_truth_contract');
let c={}; if(fs.existsSync(contractPath)) c=JSON.parse(fs.readFileSync(contractPath,'utf8'));
if(c.standard!=='PORTFOLIO_100K_SURFACING_TRUTH_CONTRACT') errors.push('wrong_kpi_truth_standard');
for(const key of ['fanout_opportunities','admitted_pages','published_pages','indexed_pages','search_visibility','llm_surfacing','external_reference','verified_citation']) if(!c.metrics?.[key]) errors.push(`missing_metric_definition:${key}`);
if(!Array.isArray(c.truth_rules)||!c.truth_rules.some(x=>/100K is a target/i.test(x))) errors.push('missing_100k_target_not_guarantee_rule');
let ledger={events:[]};if(fs.existsSync(ledgerPath)) ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));else errors.push('missing_observed_surfacing_ledger');
if(!Array.isArray(ledger.events)) errors.push('surfacing_ledger_events_not_array');
const allowed=new Set(['indexed_page','search_visibility','llm_surfacing','external_reference','verified_citation']);
for(const [i,e] of (ledger.events||[]).entries()){
 if(!allowed.has(e.metric)) errors.push(`event_${i}_invalid_metric`);
 for(const k of ['observed_at','surface_provider','url','evidence']) if(!e[k]) errors.push(`event_${i}_missing_${k}`);
 if(e.metric==='verified_citation'&&!e.evidence) errors.push(`event_${i}_verified_citation_without_evidence`);
}
const result={ok:errors.length===0,standard:c.standard||null,observed_events:(ledger.events||[]).length,verified_citations:(ledger.events||[]).filter(e=>e.metric==='verified_citation').length,errors};
console.log(JSON.stringify(result,null,2));if(errors.length)process.exit(1);
