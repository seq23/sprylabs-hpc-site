#!/usr/bin/env node
import fs from 'node:fs';
const profile = JSON.parse(fs.readFileSync('data/strategy/citation_strategy_profile.json','utf8'));
const report = {schema_version:'1.4', repo:profile.repo, generated_at:new Date().toISOString(), status:'PASS', checks:{primary_kpi:profile.primary_kpi?.name==='monthly_visitors', target_truth_boundary:profile.primary_kpi?.validator_claim_allowed===false, aeo_defined:!!profile.aeo_strategy, geo_defined:!!profile.geo_strategy, seo_defined:!!profile.seo_strategy, structural_graph_live_policy:profile.structural_graph_live_policy==='preserve_all_staged_structural_pages_live_when_graph_critical'}};
report.errors = Object.entries(report.checks).filter(([,v])=>!v).map(([k])=>k);
report.status = report.errors.length ? 'FAIL' : 'PASS';
fs.mkdirSync('artifacts/validation',{recursive:true}); fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('artifacts/validation/strategy-gate.json', JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('reports/strategy-gate.json', JSON.stringify(report,null,2)+'\n');
console.log(`[strategy:gate] ${report.status}`);
if (report.errors.length) process.exit(1);
