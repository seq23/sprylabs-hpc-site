#!/usr/bin/env node
import fs from 'node:fs';
import {readJson, fail, pass, writeSummary} from './common.mjs';

const errors = [];
const warnings = [];
const topology = readJson('data/workflows/workflow_topology.json');
const pkg = readJson('package.json');
const contracts = readJson('data/workflows/workflow_contracts.json').governed_workflows || [];
const scripts = pkg.scripts || {};
const lanes = topology.canonical_lanes || {};
const canonicalLaneIds = new Set(Object.keys(lanes));
function scriptBody(name) { return scripts[name] || ''; }
function hasScript(name) { return Boolean(scripts[name]); }
function commandToScript(command = '') {
  const m = String(command).match(/^npm run ([\w:.-]+)/);
  return m ? m[1] : '';
}
function stageCommandToScript(command = []) {
  if (!Array.isArray(command) || command.length < 3) return '';
  return command[0] === 'npm' && command[1] === 'run' ? command[2] : '';
}
for (const [laneId, lane] of Object.entries(lanes)) {
  if (!lane.command) errors.push(`${laneId}: missing command`);
  const script = commandToScript(lane.command);
  if (!script || !hasScript(script)) errors.push(`${laneId}: missing package script for ${lane.command}`);
  if (!Array.isArray(lane.modes) || !lane.modes.length) errors.push(`${laneId}: missing modes`);
  if (!lane.modes?.includes(lane.default_mode)) errors.push(`${laneId}: default mode not listed in modes`);
  if (!lane.stages_by_mode || typeof lane.stages_by_mode !== 'object') errors.push(`${laneId}: missing stages_by_mode`);
  for (const mode of lane.modes || []) {
    const stages = lane.stages_by_mode?.[mode];
    if (!Array.isArray(stages) || !stages.length) {
      errors.push(`${laneId}/${mode}: missing stage list`);
      continue;
    }
    const labels = new Set();
    for (const [index, stage] of stages.entries()) {
      if (!stage || typeof stage.label !== 'string' || !stage.label.trim()) errors.push(`${laneId}/${mode}[${index}]: missing stage label`);
      if (labels.has(stage.label)) errors.push(`${laneId}/${mode}: duplicate stage label ${stage.label}`);
      labels.add(stage.label);
      if (!Array.isArray(stage.command) || !stage.command.length) errors.push(`${laneId}/${mode}/${stage.label}: missing command array`);
      const stageScript = stageCommandToScript(stage.command);
      if (stageScript && !hasScript(stageScript)) errors.push(`${laneId}/${mode}/${stage.label}: missing package script ${stageScript}`);
      if (stage.command?.[0] === 'node' && stage.command[1] && !fs.existsSync(stage.command[1])) errors.push(`${laneId}/${mode}/${stage.label}: missing node script ${stage.command[1]}`);
      if (stageScript && stageScript.startsWith('workflow:')) errors.push(`${laneId}/${mode}/${stage.label}: stage points to workflow script ${stageScript}; use component command to avoid topology recursion`);
    }
  }
}
const commandOwners = new Map();
for (const [laneId, lane] of Object.entries(lanes)) {
  for (const replaced of lane.replaces || []) {
    if (commandOwners.has(replaced)) errors.push(`replacement command appears in multiple lanes: ${replaced}`);
    commandOwners.set(replaced, laneId);
  }
}
const aliases = contracts.filter(c => c.topology_status === 'alias');
for (const contract of contracts) {
  if (!contract.canonical_lane) errors.push(`${contract.id}: missing canonical_lane`);
  else if (!canonicalLaneIds.has(contract.canonical_lane)) errors.push(`${contract.id}: unknown canonical_lane ${contract.canonical_lane}`);
  if (!contract.canonical_mode) errors.push(`${contract.id}: missing canonical_mode`);
  else if (contract.canonical_lane && lanes[contract.canonical_lane] && !lanes[contract.canonical_lane].modes.includes(contract.canonical_mode)) errors.push(`${contract.id}: canonical_mode ${contract.canonical_mode} not allowed for ${contract.canonical_lane}`);
  if (!contract.topology_status) errors.push(`${contract.id}: missing topology_status`);
  if (!['canonical', 'alias'].includes(contract.topology_status)) errors.push(`${contract.id}: invalid topology_status ${contract.topology_status}`);
  if (!contract.workflow_command || !Array.isArray(contract.workflow_argv) || contract.workflow_argv.join(' ') !== contract.workflow_command) errors.push(`${contract.id}: workflow_argv must exactly encode workflow_command`);
  const script = commandToScript(contract.workflow_command);
  if (!script || !hasScript(script)) errors.push(`${contract.id}: workflow command script missing ${contract.workflow_command}`);
}
for (const [script, body] of Object.entries(scripts)) {
  if (!script.startsWith('workflow:')) continue;
  if (['workflow:run', 'workflow:hostile-review', 'workflow:monitor'].includes(script)) continue;
  const isCanonical = Object.values(lanes).some(lane => lane.command === `npm run ${script}`);
  const contract = contracts.find(item => commandToScript(item.workflow_command) === script);
  const isAlias = contract?.topology_status === 'alias';
  if (!isCanonical && !isAlias) warnings.push(`${script}: workflow script is neither canonical nor governed alias`);
  if (isAlias && !/workflow:(signal-intake|content-expansion|citation-expansion|content-authority|release-verify)/.test(body)) errors.push(`${script}: alias does not route through a canonical topology lane`);
}
for (const [deprecated, target] of Object.entries(topology.deprecated_public_entrypoints || {})) {
  if (!target) errors.push(`${deprecated}: missing retirement target`);
  if (hasScript(deprecated) && !scriptBody(deprecated).includes('legacy') && !scriptBody(deprecated).includes('workflow:')) warnings.push(`${deprecated}: still present as a direct component command; target=${target}`);
}
for (const wf of fs.readdirSync('.github/workflows').filter(name => /\.ya?ml$/.test(name))) {
  const rel = `.github/workflows/${wf}`;
  const contract = contracts.find(item => item.workflow_file === rel);
  const text = fs.readFileSync(rel, 'utf8');
  if (contract) {
    const script = commandToScript(contract.workflow_command);
    if (script && !text.includes(`npm run ${script}`) && !text.includes('npm run workflow:run')) warnings.push(`${wf}: workflow file does not directly mention contract script ${script}; governed wrapper may still supply it`);
  }
  for (const deprecated of Object.keys(topology.deprecated_public_entrypoints || {})) {
    if (text.includes(`npm run ${deprecated}`)) errors.push(`${wf}: calls deprecated public entrypoint ${deprecated}`);
  }
}
const report = {
  schema_version: '1.1',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  canonical_lane_count: canonicalLaneIds.size,
  governed_workflow_count: contracts.length,
  alias_workflow_count: aliases.length,
  stage_count: Object.values(lanes).reduce((sum, lane) => sum + Object.values(lane.stages_by_mode || {}).reduce((s, list) => s + list.length, 0), 0),
  canonical_lanes: Object.fromEntries(Object.entries(lanes).map(([id, lane]) => [id, {command: lane.command, modes: lane.modes, replaces: lane.replaces || [], stage_modes: Object.fromEntries(Object.entries(lane.stages_by_mode || {}).map(([mode, list]) => [mode, list.length]))}])),
  aliases: aliases.map(item => ({id: item.id, canonical_lane: item.canonical_lane, canonical_mode: item.canonical_mode, workflow_command: item.workflow_command})),
  warnings,
  errors
};
fs.mkdirSync('artifacts/validation', {recursive: true});
fs.mkdirSync('reports', {recursive: true});
fs.writeFileSync('artifacts/validation/workflow-topology.json', `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync('reports/workflow-topology.json', `${JSON.stringify(report, null, 2)}\n`);
writeSummary('validate-workflow-topology', report);
if (errors.length) fail(`[validate:workflow-topology] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:workflow-topology] OK: ${canonicalLaneIds.size} canonical lane(s), ${aliases.length} alias workflow(s), ${report.stage_count} stage(s)`);
