#!/usr/bin/env node
import fs from 'node:fs';import {readJson,writeJson,now} from '../lib/safe_harbor_utils.mjs';
// The dashboard used to render latest_applied as a bare "0" that looked identical
// to a healthy day. A zero that cannot be told apart from "healthy" is what let
// the zero-dollar lane apply nothing for 8+ weeks without anyone noticing.
// Every zero now carries a named state and the reason the lane stopped.
function zeroDollarStatus(){
  const own=readJson('data/content_ownership_registry.json',{summary:{}});
  const proof=readJson('artifacts/validation/daily-proof-packet.json',{});
  const app=readJson('artifacts/validation/release-plan-application.json',{});
  const plan=readJson('artifacts/validation/daily-citation-release-plan.json',{});
  const applied=Number(proof.release_units_applied||0);
  const planned=Number(plan?.summary?.release_units_planned||0);
  const stop=app.stop_reason||plan.stop_reason||null;
  const state=applied>0?'APPLYING':stop?'STALLED':planned===0?'NO_CANDIDATES':'STALLED';
  return {
    owned_pages:own.summary?.zero_dollar||0,
    latest_applied:applied,
    latest_skipped:Number(proof.release_units_skipped||0),
    latest_planned:planned,
    state,
    alarm:state!=='APPLYING',
    stop_code:stop?.code||(state==='APPLYING'?null:'UNKNOWN_ZERO'),
    stop_reason:stop?.message||(state==='APPLYING'?null:'The lane applied zero units and did not record a named stop reason.')
  };
}
const own=readJson('data/content_ownership_registry.json',{routes:[],summary:{}});const score=readJson('data/metrics/citation_scoreboard.json',{});const audit=readJson('data/governance/safe_harbor_audit_ledger.json',{entries:[]});const acceptance=readJson('data/report_fixes/agent_acceptance_manifest.generated.json',{entries:[],run_manifests:[]});const runs=fs.existsSync('data/report_fixes/agent_runs')?fs.readdirSync('data/report_fixes/agent_runs').sort():[];const latest=runs.at(-1)||null;const latestDir=latest?`data/report_fixes/agent_runs/${latest}/bhpc`:null;const artifacts=latestDir&&fs.existsSync(latestDir)?fs.readdirSync(latestDir).sort():[];const proof=readJson('artifacts/validation/daily-proof-packet.json',{});const growth={schema_version:'1.0',generated_at:now(),status:'PASS',goal:{target:100000,time_horizon_days:90,owned_surfaces:score.owned_surfaces||0,progress_ratio:score.progress_ratio||0},paid_agent:{latest_run:latest,artifacts,artifact_count:artifacts.length,run_manifest_count:(acceptance.run_manifests||[]).length,accepted_entries:(acceptance.entries||[]).length,owned_pages:own.summary?.paid_agent||0},zero_dollar:zeroDollarStatus(),authority:{route_count:own.route_count||own.routes.length,legacy_pages:own.summary?.legacy_eligible||0,system_core:own.summary?.system_core||0},exceptions:{total:(audit.entries||[]).filter(x=>String(x.decision).startsWith('SKIPPED')).length},outcomes:{observed_llm_mentions:score.observed_llm_mentions,indexed_urls:score.indexed_urls,download_referrals:score.download_referrals,gumroad_sales:score.gumroad_sales}};// Surface the alarm at the top level too, so a stalled lane is visible without
// drilling into the zero_dollar block.
if(growth.zero_dollar?.alarm){growth.status='ATTENTION';growth.attention=[`zero_dollar:${growth.zero_dollar.stop_code}`];}
writeJson('data/health/growth_health_snapshot.json',growth);writeJson('data/admin/growth_health.json',growth);writeJson('data/admin/paid_agent_status.json',growth.paid_agent);writeJson('data/admin/zero_dollar_status.json',growth.zero_dollar);writeJson('data/admin/content_health.json',growth.authority);writeJson('data/admin/workflow_health.json',{schema_version:'1.0',generated_at:now(),status:'STRUCTURAL_ONLY',note:'Live GitHub run data requires runtime token.'});writeJson('data/admin/distribution_health.json',{schema_version:'1.0',generated_at:now(),status:'STRUCTURAL_ONLY',observed_external_outcomes:false});writeJson('data/admin/query_health.json',{schema_version:'1.0',generated_at:now(),status:'STRUCTURAL_ONLY'});console.log(`[admin:status] PASS paid=${growth.paid_agent.owned_pages} zero=${growth.zero_dollar.owned_pages}`);
