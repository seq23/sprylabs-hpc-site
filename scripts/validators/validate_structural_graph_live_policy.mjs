#!/usr/bin/env node
import fs from 'node:fs';
const errors=[]; const profile=JSON.parse(fs.readFileSync('data/strategy/citation_strategy_profile.json','utf8'));
if(profile.structural_graph_live_policy!=='preserve_all_staged_structural_pages_live_when_graph_critical') errors.push('profile missing graph-live policy');
for(const p of ['data/routes/public_route_manifest.json','data/routes/critical_browser_route_manifest.json','sitemap.xml','llms.txt','llms-full.txt','docs/runbooks/STRUCTURAL_GRAPH_LIVE_POLICY.md']) if(!fs.existsSync(p)||fs.statSync(p).size===0) errors.push(`missing/non-empty required graph artifact ${p}`);
const contract=JSON.parse(fs.readFileSync('config/release/content_release_contract.json','utf8')); if(!contract.forbidden_runtime_mutations?.includes('.github/**')) errors.push('runtime governance mutation ban missing');
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:structural-graph-live-policy] PASS');
