#!/usr/bin/env node
import {writeJson, hashFile} from './bhpc_agent_common.mjs';
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
const activeEntries=allEntries.filter(e=>String(e.run_date||'')===activeRunDate);
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
function pageSpecFor(entries){
  const primary=entries.find(e=>e.seo_execution_status==='VALID')||entries[0];
  const blockTypes=unique(entries.flatMap(e=>e.required_block_types||[]));
  const heading=primary.required_heading||primary.query;
  return {
    h1:primary.query,
    framework:heading,
    type:blockTypes.includes('comparison_table')?'comparison':'concept',
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
  const operation=createIntent&&!repairIntent?'CREATE_NEW_TARGET_PAGE':(primary.page_family==='intended_winner_repair'||repairIntent?'REPAIR_INTENDED_WINNER_PAGE':'CREATE_NEW_TARGET_PAGE');
  const spec=pageSpecFor(entries);
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
