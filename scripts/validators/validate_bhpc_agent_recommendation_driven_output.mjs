#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {ROOT,readJson,writeJson} from '../agent_intake/bhpc_agent_common.mjs';
import {normalizeBhpcInternalLinkHref, normalizeBhpcExternalCtaHref} from '../lib/bhpc_internal_links.mjs';
function decode(v=''){return String(v).replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function textOnly(h=''){return decode(h).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function normalize(v=''){return textOnly(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function tokenCovered(needle='',hay=''){const tokens=normalize(needle).split(' ').filter(t=>t.length>2);const h=normalize(hay);return !tokens.length||tokens.every(t=>h.includes(t))}
const manifest=readJson('data/report_fixes/agent_acceptance_manifest.generated.json',{entries:[]});
const plan=readJson('artifacts/validation/agent-exact-implementation-plan.json',{specs:[]});
const apply=readJson('artifacts/validation/agent-exact-implementation-apply.json',{applied:[]});
const errors=[],checked=[],skipped=[];
const activeSpecs=(plan.specs||[]).filter(s=>s.status!=='BLOCKED');
const activeAcceptanceIds=new Set(activeSpecs.flatMap(s=>s.acceptance_ids||[]).map(String));
const appliedIds=new Set((apply.applied||[]).flatMap(x=>x.acceptance_ids||[]).map(String));
for(const spec of activeSpecs){
  const rel=spec.implementation_path||'',abs=path.join(ROOT,rel);
  if(!rel||!fs.existsSync(abs)) continue;
  const html=fs.readFileSync(abs,'utf8');
  for(const link of spec.required_external_cta_links||[]){
    const href=normalizeBhpcExternalCtaHref(link.to_url);
    if(!href){errors.push(`${spec.record_id}:plan_unapproved_external_cta:${link.to_url||'missing'}:${rel}`);continue}
    if(!html.includes(`href="${href}"`)&&!html.includes(`href='${href}'`))errors.push(`${spec.record_id}:plan_missing_external_cta:${href}:${rel}`);
  }
}
for(const entry of manifest.entries||[]){
  if(!activeAcceptanceIds.has(String(entry.id))){skipped.push({acceptance_id:entry.id,reason:'outside_active_implementation_plan'});continue}
  if(entry.acceptance_status!=='REQUIRED')continue;
  const rel=entry.implementation_path||'',abs=path.join(ROOT,rel);if(!rel||!fs.existsSync(abs)){errors.push(`${entry.record_id}:missing_output:${rel}`);continue}
  const html=fs.readFileSync(abs,'utf8'),text=textOnly(html);
  if(!html.includes(`data-bhpc-agent-record="${entry.record_id}"`))errors.push(`${entry.record_id}:missing_record_marker:${rel}`);
  if(!tokenCovered(entry.required_heading,text))errors.push(`${entry.record_id}:heading_not_visible:${rel}`);
  // Either marker counts, matching validate_bhpc_rich_new_page_contract.mjs and
  // trace_bhpc_agent_exact_implementation.mjs. recommendation_summary is written
  // by the retrofit pass outside the agent section, carrying data-content-block,
  // because the applier emits nothing for it rather than publish the operator
  // audit critique that is its only other source. Re-tagging the retrofit's
  // output as an agent block is the one fix that must not be used: it makes the
  // applier's section strip delete every real block after it.
  for(const type of entry.required_block_types||[]){if(type==='internal_link_set'&&!(entry.required_internal_links||[]).length)continue;if(!(html.includes(`data-bhpc-agent-block="${type}"`)||html.includes(`data-content-block="${type}"`)))errors.push(`${entry.record_id}:missing_block:${type}:${rel}`)}
  for(const link of entry.required_internal_links||[]){const href=normalizeBhpcInternalLinkHref(link.to_url);if(!href){errors.push(`${entry.record_id}:non_internal_link_in_required_internal_links:${link.to_url||'missing'}:${rel}`);continue}if(!html.includes(`href="${href}"`)&&!html.includes(`href='${href}'`))errors.push(`${entry.record_id}:missing_internal_link:${href}:${rel}`)}
  for(const link of entry.required_external_cta_links||[]){const href=normalizeBhpcExternalCtaHref(link.to_url);if(!href){errors.push(`${entry.record_id}:unapproved_external_cta:${link.to_url||'missing'}:${rel}`);continue}if(!html.includes(`href="${href}"`)&&!html.includes(`href='${href}'`))errors.push(`${entry.record_id}:missing_external_cta:${href}:${rel}`)}
  if(/Agent recommendation implementation|Agent-directed implementation|Agent source instruction|Route decision:/i.test(text))errors.push(`${entry.record_id}:public_operational_scaffolding:${rel}`);
  if(!appliedIds.has(String(entry.id)))errors.push(`${entry.record_id}:acceptance_not_applied:${entry.id}`);
  checked.push({record_id:entry.record_id,acceptance_id:entry.id,implementation_path:rel,blocks:entry.required_block_types||[]});
}
const report={schema_version:'1.1',validator:'bhpc-agent-recommendation-driven-output',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',active_run_date:plan.active_run_date||'',manifest_entry_count:(manifest.entries||[]).length,active_plan_spec_count:activeSpecs.length,checked_count:checked.length,skipped_count:skipped.length,checked,skipped:skipped.slice(0,150),errors};
writeJson('artifacts/validation/bhpc-agent-recommendation-driven-output.json',report);writeJson('reports/bhpc-agent-recommendation-driven-output.json',report);
if(errors.length){console.error(`[bhpc-agent-recommendation-driven-output] FAIL: ${errors.length} issue(s)`);for(const e of errors.slice(0,80))console.error(' -',e);process.exit(1)}
console.log(`[bhpc-agent-recommendation-driven-output] PASS: checked=${checked.length}; skipped=${skipped.length}; active_specs=${activeSpecs.length}`);
