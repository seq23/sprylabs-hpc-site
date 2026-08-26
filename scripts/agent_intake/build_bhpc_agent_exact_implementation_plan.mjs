#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, writeJson, hashFile} from './bhpc_agent_common.mjs';
import {compileAndWriteBhpcAcceptanceManifest} from './compile_bhpc_agent_acceptance_manifest.mjs';
import {mergeBhpcExternalCtaLinks} from '../lib/bhpc_conversion_contract.mjs';
import {bhpcGeneratedCitationDefinition} from '../lib/bhpc_public_page_contract.mjs';

const manifest=compileAndWriteBhpcAcceptanceManifest();
function stableGeneratedAt(entries=[]){
  const latest=entries.map(e=>String(e?.run_date||'').trim()).filter(Boolean).sort().at(-1);
  if(!latest) return '1970-01-01T00:00:00.000Z';
  const parsed=new Date(`${latest}T00:00:00.000Z`);if(Number.isNaN(parsed.getTime())) throw new Error(`[bhpc-agent-exact-plan] invalid manifest run_date: ${latest}`);return parsed.toISOString();
}
function unique(values=[]){return [...new Set(values.filter(Boolean).map(String))]}
const allEntries=manifest.entries||[];
const activeRunDate=allEntries.map(e=>String(e.run_date||'')).filter(Boolean).sort().at(-1)||'';

// The plan used to contain only the newest run date. Everything older was
// reported as historical and traced as SKIPPED:outside_active_implementation_plan
// - 843 of 913 entries across 10 run dates. Because a new run lands weekly, last
// week's unapplied recommendations were orphaned the moment the next one
// arrived, permanently. That is why the review agent kept re-reporting the same
// defects: the work was never carried forward, so it had to be re-found.
//
// Outstanding work from earlier runs is now carried into the plan. An entry is
// outstanding when it is still REQUIRED and its acceptance is not already
// satisfied on the rendered page - the marker is missing, or the required
// strings it declares are not present. Anything already satisfied stays out, so
// the backlog drains rather than being reprocessed.
//
// BACKLOG_CARRY_LIMIT bounds a single run; the remainder stays queued for the
// next one instead of being discarded. Set it to 0 to restore the old
// newest-run-only behaviour.
const BACKLOG_CARRY_LIMIT=Number(process.env.BHPC_BACKLOG_CARRY_LIMIT||120);

function acceptanceSatisfied(entry){
  const rel=String(entry.implementation_path||'').replace(/^\/+/,'');
  if(!rel) return false;
  for(const base of ['']){
    const abs=path.join(ROOT,base,rel);
    if(!fs.existsSync(abs)) continue;
    const html=fs.readFileSync(abs,'utf8');
    const marker=String(entry.record_id||entry.id||'');
    if(marker && !html.includes(marker)) return false;
    const required=Array.isArray(entry.required_strings)?entry.required_strings:[];
    return required.every(needle=>html.includes(String(needle)));
  }
  return false; // no rendered target means the work is certainly not done
}

const newestEntries=allEntries.filter(e=>String(e.run_date||'')===activeRunDate);
const carriedBacklog=allEntries
  .filter(e=>String(e.run_date||'')!==activeRunDate)
  .filter(e=>e.acceptance_status==='REQUIRED')
  .filter(e=>!acceptanceSatisfied(e))
  .sort((a,b)=>String(a.run_date||'').localeCompare(String(b.run_date||'')))
  .slice(0,BACKLOG_CARRY_LIMIT);
// A page's fixes must be applied atomically. The apply strips and rebuilds the
// semantic section from whatever slice this run carries, so any required string
// contributed by an entry NOT in the current slice disappears. With a global
// entry limit, consecutive runs carried different slices of the same page and
// undid each other: satisfied entries oscillated between 66% and 84% forever,
// which is why the review agent kept re-reporting work that had been done.
//
// So the limit now bounds PAGES, not entries: once a page is selected, every
// outstanding entry for it comes along. A page is either fully repaired or not
// touched, and it can never regress.
const backlogByPath=new Map();
for(const e of carriedBacklog){
  const key=String(e.implementation_path||'');
  if(!backlogByPath.has(key)) backlogByPath.set(key,[]);
  backlogByPath.get(key).push(e);
}
const outstandingByPath=new Map();
for(const e of allEntries){
  if(String(e.run_date||'')===activeRunDate) continue;
  if(e.acceptance_status!=='REQUIRED') continue;
  if(acceptanceSatisfied(e)) continue;
  const key=String(e.implementation_path||'');
  if(!backlogByPath.has(key)) continue;
  if(!outstandingByPath.has(key)) outstandingByPath.set(key,[]);
  outstandingByPath.get(key).push(e);
}
// Any page touched this run - whether by the newest run or by the carried
// backlog - takes ALL of its outstanding entries. Slicing by entry meant the
// newest run could touch a page and rebuild its section without the older
// entries' required strings, undoing them.
const touchedPaths=new Set([
  ...newestEntries.map(e=>String(e.implementation_path||'')),
  ...outstandingByPath.keys(),
]);
const wholePageEntries=allEntries.filter(e=>
  e.acceptance_status==='REQUIRED'
  && touchedPaths.has(String(e.implementation_path||''))
  && String(e.run_date||'')!==activeRunDate);
const activeEntries=[...newestEntries,...wholePageEntries]
  .filter((e,i,arr)=>arr.findIndex(x=>x.id===e.id)===i);
console.log(`[bhpc-agent-exact-plan] newest_run=${newestEntries.length} carried_backlog=${carriedBacklog.length} (limit ${BACKLOG_CARRY_LIMIT})`);
const deterministicGeneratedAt=stableGeneratedAt(activeEntries);
const blockedRouteReasons=new Map(activeEntries
  .filter(e=>e.acceptance_status==='BLOCKED'&&e.implementation_path)
  .map(e=>[String(e.implementation_path),e.blocked_reason||'blocked_by_acceptance_compiler']));
const groups=new Map(),blocked=[],noAction=[];
for(const entry of activeEntries){
  if(entry.acceptance_status==='NO_ACTION'){noAction.push(entry);continue}
  if(entry.acceptance_status==='BLOCKED'){blocked.push(entry);continue}
  if(!entry.implementation_path){blocked.push({...entry,acceptance_status:'BLOCKED',blocked_reason:'missing_implementation_path'});continue}
  if(blockedRouteReasons.has(String(entry.implementation_path))){blocked.push({...entry,acceptance_status:'BLOCKED',operation:'BLOCKED_ROUTE_CONFLICT',route_status:'BLOCKED_SOURCE_ROW',blocked_reason:blockedRouteReasons.get(String(entry.implementation_path))});continue}
  const key=`${entry.implementation_path}`;
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(entry);
}
const VALID_EXTRACTION_TYPES=new Set(['concept','howto','comparison','decision']);
function existingExtractionType(rel){
  if(!rel) return '';
  try{
    const m=fs.readFileSync(path.join(ROOT,rel),'utf8').match(/data-extraction-type="([^"]+)"/i);
    const found=((m&&m[1])||'').toLowerCase();
    return VALID_EXTRACTION_TYPES.has(found)?found:'';
  }catch{return ''}
}
// A page that already exists and carries no agent ownership marker was not created
// by this pipeline, so planning it as CREATE_NEW_TARGET_PAGE is a contradiction:
// the create-only contract then demands an ownership marker the page cannot
// honestly carry, and fails the release for it on every run.
function preexistingForeignPage(rel){
  try{
    return !fs.readFileSync(path.join(ROOT,rel),'utf8').includes('data-bhpc-agent-generated-page="true"');
  }catch{return false}
}

function pageSpecFor(entries,primaryPath=''){
  const primary=entries.find(e=>e.seo_execution_status==='VALID')||entries[0];
  const blockTypes=unique(entries.flatMap(e=>e.required_block_types||[]));
  const heading=primary.required_heading||primary.query;
  return {
    h1:primary.query,
    framework:heading,
    // The site publishes four extraction types (concept, howto, comparison,
    // decision). Choosing only between comparison and concept made the plan
    // demand that an existing how-to page be reshaped into a concept page.
    type:existingExtractionType(primaryPath)||(blockTypes.includes('comparison_table')?'comparison':'concept'),
    definition:bhpcGeneratedCitationDefinition(primary.query),
    body:`<section data-bhpc-agent-record="${primary.record_id}" data-bhpc-agent-semantic="true"><h2>${heading}</h2></section>`,
    agent_acceptance:{
      record_ids:unique(entries.map(e=>e.record_id)),acceptance_ids:unique(entries.map(e=>e.id)),page_family:primary.page_family,route_status:primary.route_status,
      seo_execution_hashes:unique(entries.map(e=>e.seo_execution_hash)),generated_from:'data/report_fixes/agent_acceptance_manifest.generated.json'
    }
  };
}
const priority_pages={},new_pages={},specs=[];
for(const [pathValue,entries] of groups){
  const primary=entries.find(e=>e.seo_execution_status==='VALID')||entries[0];
  const createIntent=entries.some(e=>e.source_intent_operation==='CREATE_NEW_TARGET_PAGE'&&!e.intended_winner_page&&!e.intended_winner_path);
  const repairIntent=entries.some(e=>e.source_intent_operation==='REPAIR_INTENDED_WINNER_PAGE'||e.operation==='REPAIR_INTENDED_WINNER_PAGE');
  const wantsCreate=createIntent&&!repairIntent;
  // Repairing an intended winner that already exists is a repair, even when the
  // source intent said create. Planning it as a create makes the create-only
  // contract demand an agent ownership marker the page cannot honestly carry.
  const isRepair=(!wantsCreate&&(primary.page_family==='intended_winner_repair'||repairIntent))
    ||(primary.page_family==='intended_winner_repair'&&preexistingForeignPage(pathValue));
  const operation=isRepair?'REPAIR_INTENDED_WINNER_PAGE':'CREATE_NEW_TARGET_PAGE';
  const spec=pageSpecFor(entries,pathValue);
  if(operation==='REPAIR_INTENDED_WINNER_PAGE') priority_pages[pathValue]=spec; else new_pages[pathValue]=spec;
  specs.push({
    record_id:primary.record_id,record_ids:unique(entries.map(e=>e.record_id)),acceptance_ids:unique(entries.map(e=>e.id)),query:primary.query,run_date:primary.run_date,
    operation,page_family:primary.page_family,route_status:primary.route_status,intended_winner_page:primary.intended_winner_page||'',intended_winner_path:primary.intended_winner_path||'',
    implementation_path:pathValue,before_hash:hashFile(pathValue),status:'PLANNED',blocked_reason:'',extraction_type:spec.type,
    required_block_types:unique(entries.flatMap(e=>e.required_block_types||[])),required_internal_links:entries.flatMap(e=>e.required_internal_links||[]),required_external_cta_links:mergeBhpcExternalCtaLinks(entries.flatMap(e=>e.required_external_cta_links||[]), pathValue),
    schema_actions:unique(entries.map(e=>e.schema_action)),seo_execution_hashes:unique(entries.map(e=>e.seo_execution_hash)),
    required_strings_count:entries.reduce((sum,e)=>sum+(e.required_strings||[]).length,0),
    source_intent_operations:unique(entries.map(e=>e.source_intent_operation)),
    evidence_urls:unique(entries.flatMap(e=>e.evidence_urls||[])),evidence_required_domains:unique(entries.flatMap(e=>e.evidence_required_domains||[]))
  });
}
for(const entry of blocked){specs.push({record_id:entry.record_id,acceptance_ids:[entry.id].filter(Boolean),query:entry.query,run_date:entry.run_date,operation:entry.operation,page_family:entry.page_family,route_status:entry.route_status,intended_winner_page:entry.intended_winner_page||'',intended_winner_path:entry.intended_winner_path||'',implementation_path:entry.implementation_path||'',before_hash:null,status:'BLOCKED',blocked_reason:entry.blocked_reason||'blocked_by_acceptance_compiler'})}
writeJson('data/citation/agent_page_specs.generated.json',{schema_version:'1.1',generated_at:deterministicGeneratedAt,source:'bhpc_agent_acceptance_manifest',active_run_date:activeRunDate,new_pages});
writeJson('data/citation/agent_repair_specs.generated.json',{schema_version:'1.1',generated_at:deterministicGeneratedAt,source:'bhpc_agent_acceptance_manifest',active_run_date:activeRunDate,priority_pages});
const report={schema_version:'1.1',status:'PASS',generated_at:new Date().toISOString(),active_run_date:activeRunDate,acceptance_manifest_path:'data/report_fixes/agent_acceptance_manifest.generated.json',policy_path:'data/report_fixes/agent_exact_implementation_policy.json',repair_count:Object.keys(priority_pages).length,new_page_count:Object.keys(new_pages).length,blocked_count:blocked.length,no_action_count:noAction.length,acceptance_entry_count:manifest.entry_count,active_acceptance_entry_count:activeEntries.length,required_acceptance_entry_count:activeEntries.filter(e=>e.acceptance_status==='REQUIRED').length,historical_entry_count:allEntries.length-activeEntries.length,specs,no_action:noAction.map(e=>({record_id:e.record_id,query:e.query,reason:'maintain_or_no_action'}))};
writeJson('artifacts/validation/agent-exact-implementation-plan.json',report);writeJson('reports/bhpc-agent-exact-implementation-plan.json',report);
console.log(`[bhpc-agent-exact-plan] PASS: active_run=${activeRunDate}; repairs=${report.repair_count}; new_pages=${report.new_page_count}; blocked=${report.blocked_count}; no_action=${report.no_action_count}; historical_skipped=${report.historical_entry_count}`);
