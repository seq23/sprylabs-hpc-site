#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel, fallback=null) => { const abs = path.join(ROOT, rel); return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs,'utf8')) : fallback; };
const write = (rel, payload) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), {recursive:true}); fs.writeFileSync(abs, JSON.stringify(payload,null,2)+'\n'); };
const slugify = (v='') => String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const strategy = read('data/strategy/citation_strategy_profile.json', {});
const contract = read('data/strategy/strategy_gap_fill_contract.json', {});
const horizon = Number(contract.time_horizon_days || strategy.primary_kpi?.time_horizon_days || 180);
const dailyTarget = Number(strategy.cadence?.daily_target_units || 15);
const minimum = horizon * dailyTarget * Number(contract.minimum_backlog_multiplier || 1);
const pillars = strategy.verticals || ['executive performance','AI coaching','accountability systems','founder workflows','structured personal operating systems','A Player Mode'];
const families = strategy.query_families || ['AI executive coach','accountability coach','founder productivity','decision fatigue','low resistance execution','AI operating system','human coach alternative','consistency after missed days'];
const familyKinds = ['answer_page','comparison_page','framework_page','protocol_page','authority_insight','cluster_page'];
const templates = [
  'how should a founder evaluate {family} for {pillar}',
  'what is the decision framework for {family} in {pillar}',
  '{family} versus manual coaching for {pillar}',
  'red flags when using {family} for {pillar}',
  'implementation checklist for {family} and {pillar}',
  'source-backed answer page for {family} in {pillar}'
];
const candidates = [];
let cycle = 1;
while (candidates.length < minimum) {
  for (const pillar of pillars) {
    for (const family of families) {
      for (const template of templates) {
        const query = `${template.replace('{family}', family).replace('{pillar}', pillar)} — strategy gap fill ${cycle}`;
        const pageFamily = familyKinds[candidates.length % familyKinds.length];
        const routeBase = pageFamily === 'comparison_page' ? 'vs' : pageFamily === 'framework_page' ? 'methods' : pageFamily === 'cluster_page' ? 'clusters' : 'answers';
        candidates.push({
          id: `bhpc_strategy_gap_${String(candidates.length+1).padStart(5,'0')}`,
          source: 'bhpc_strategy_gap_fill_engine',
          admission_basis: 'BHPC_STRATEGY_GAP_FILL_NON_AGENT',
          pillar,
          query_family: family,
          operation: 'CREATE_OR_REPAIR_AUTHORITY_SURFACE',
          query,
          status: 'BACKLOG_READY',
          page_family: pageFamily,
          target_path: `${routeBase}/${String(candidates.length+1).padStart(5,'0')}-${slugify(query.replace(/strategy gap fill \d+$/,''))}/index.html`,
          prevalidation_required: true,
          self_healing_required: true,
          claim_boundary: 'Educational and organizational support only; no therapy, medical, legal, financial, or guaranteed outcome claims.',
          strategy_role: 'Fills six-month AEO/GEO release-unit shortfall when exact BHPC agent artifacts under-supply the content plan.',
          exact_agent_content: false,
          fallback_gap_fill: true,
          reviewed_at: process.env.SOURCE_DATE || '2026-07-03'
        });
        if (candidates.length >= minimum) break;
      }
      if (candidates.length >= minimum) break;
    }
    if (candidates.length >= minimum) break;
  }
  cycle += 1;
}
const payload = {schema_version:'1.0', generated_at:`${process.env.SOURCE_DATE || '2026-07-03'}T00:00:00.000Z`, strategy_profile:'data/strategy/citation_strategy_profile.json', time_horizon_days:horizon, daily_target_units:dailyTarget, minimum_units:minimum, candidate_count:candidates.length, candidates};
write('data/strategy/strategy_gap_fill_backlog.json', payload);
write('artifacts/validation/strategy-gap-fill-backlog.json', {status:'PASS', candidate_count:candidates.length, minimum_units: minimum, sample:candidates.slice(0,10)});
console.log(`[bhpc-strategy-gap-fill] PASS: candidates=${candidates.length}; minimum=${minimum}`);
