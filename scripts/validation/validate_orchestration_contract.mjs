#!/usr/bin/env node
import fs from 'node:fs';
import {buildExecutionGraph, readJsonFile, assertReachable} from './orchestration_graph.mjs';
import {fail, pass, writeSummary} from './common.mjs';

const pkg=readJsonFile('package.json');
const matrix=readJsonFile('_repo_validation_matrix.json');
const registry=readJsonFile('_validation_registry.json').records || [];
const graph=buildExecutionGraph({pkg,matrix});
const errors=[...graph.errors];
for (const cycle of graph.cycles) errors.push(`orchestration cycle: ${cycle.join(' -> ')}`);

const publicAliases=['validate:all','validate:changed','validate:release','validate:full','validate:full-audit'];
for (const alias of publicAliases) {
  if (!pkg.scripts?.[alias]) errors.push(`missing public validation alias: ${alias}`);
  const reach=graph.reachable(`script:${alias}`);
  if (reach.size < 2) errors.push(`${alias}: does not resolve to an execution graph`);
}

const mandatoryByAlias={
  'validate:all':['validate:orchestration-contract','validate:citation-velocity-automation','validate:validation-registry'],
  'validate:release':['validate:orchestration-contract','validate:citation-velocity-automation'],
  'validate:full':['validate:orchestration-contract','validate:citation-velocity-automation'],
  'validate:full-audit':['validate:orchestration-contract','validate:citation-velocity-automation'],
};
for (const [alias,targets] of Object.entries(mandatoryByAlias)) {
  for (const target of targets) if (!assertReachable(graph,alias,target)) errors.push(`${alias}: mandatory validator unreachable: ${target}`);
}

const governedCommands=new Set();
for (const edge of graph.edges) {
  if (edge.kind==='profile-step' && edge.to.startsWith('script:')) governedCommands.add(`npm run ${edge.to.slice(7)}`);
}
for (const alias of publicAliases) governedCommands.add(`npm run ${alias}`);
for (const command of governedCommands) {
  if (!registry.some(r=>r.command===command && ['ADMITTED','NOT_APPLICABLE'].includes(r.status))) errors.push(`${command}: governed orchestration command lacks active registry admission`);
}

const legacy=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','.pages-output', 'node_modules','.validation-runtime','.validation-cache'].includes(ent.name)) continue; const p=`${dir}/${ent.name}`; if(ent.isDirectory()) walk(p); else if(/\.(?:mjs|cjs|js|py|sh)$/.test(ent.name)){const t=fs.readFileSync(p,'utf8'); if(/validate:all[^\n]{0,160}(?:must include|\.includes\()|(?:must include|\.includes\()[^\n]{0,160}validate:all/.test(t) && !p.endsWith('validate_orchestration_contract.mjs') && !p.endsWith('self_test_orchestration_contract.mjs')) legacy.push(p)}}}
walk('scripts');
if (legacy.length) errors.push(`legacy literal validate:all assertions remain: ${legacy.join(', ')}`);

const receipt={
  status:errors.length?'FAIL':'PASS',
  node_count:graph.nodes.size,
  edge_count:graph.edges.length,
  profiles:Object.keys(matrix.profiles||{}),
  public_aliases:publicAliases,
  mandatory_reachability:Object.fromEntries(Object.entries(mandatoryByAlias).map(([a,ts])=>[a,Object.fromEntries(ts.map(t=>[t,assertReachable(graph,a,t)]))])),
  cycles:graph.cycles,
  legacy_literal_assertions:legacy,
  errors,
};
writeSummary('validate-orchestration-contract',receipt);
if(errors.length) fail(`[validate:orchestration-contract] FAIL: ${errors.length} issue(s)`,errors);
pass(`[validate:orchestration-contract] PASS: ${receipt.node_count} nodes, ${receipt.edge_count} edges, ${publicAliases.length} public aliases, 0 cycles, 0 legacy literal assertions`);
