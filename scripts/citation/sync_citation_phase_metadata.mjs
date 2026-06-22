#!/usr/bin/env node
import fs from 'node:fs';

const TODAY = new Date().toISOString().slice(0, 10);
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(file.split('/').slice(0, -1).join('/'), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

const citable = readJson('data/citation/citable_pages.json', { pages: [] }).pages || [];
const activePages = citable.filter(page => page.status === 'ACTIVE');
const activeCount = activePages.length;
const registry = readJson('data/content/page_admission_registry.json', { records: [] }).records || [];
const activePaths = new Set(activePages.map(page => page.path));
const admittedByPath = new Map(registry.filter(record => record.status === 'ADMITTED').map(record => [record.path, record]));
const generatedCounts = {};
for (const page of activePages) {
  const record = admittedByPath.get(page.path) || {};
  const key = record.page_type || record.generation_lane || page.page_type || page.type || 'reference_page';
  generatedCounts[key] = (generatedCounts[key] || 0) + 1;
}

const phase = readJson('data/citation/citation_phase_manifest.json', {});
phase.schema_version = phase.schema_version || '2.0';
phase.generated_at = TODAY;
phase.scope = phase.scope || 'aplayermode.com + billionairehighperformancecoach.com only';
phase.current_active_reference_surfaces = activeCount;
phase.generated_baseline_expansion = phase.generated_baseline_expansion || {};
phase.generated_baseline_expansion.counts = generatedCounts;
phase.phases = phase.phases || {};
phase.phases.phase_2_coverage = {
  ...(phase.phases.phase_2_coverage || {}),
  status: activeCount >= 2000 ? 'IMPLEMENTED_AT_2000_PLUS_SCALE' : 'PARTIAL_SCALE_TARGET',
  target_reference_surfaces: 2000,
  current_active_reference_surfaces: activeCount,
  generated_counts: generatedCounts,
};
phase.phases.phase_4_dominance = {
  ...(phase.phases.phase_4_dominance || {}),
  status: 'RUNWAY_ACTIVE_NOT_COMPLETE',
  target_reference_surfaces_minimum: 2000,
  next_target_reference_surfaces: 5000,
  release_system: 'existing_content_automation_spine',
  monitoring_required: true,
  external_distribution_required: true,
};
writeJson('data/citation/citation_phase_manifest.json', phase);

const strategy = readJson('data/citation/citation_strategy_contract.json', {});
strategy.reviewed_at = TODAY;
strategy.current_active_reference_surfaces = activeCount;
strategy.target_reference_surface_count = strategy.target_reference_surface_count || 2000;
strategy.phases = strategy.phases || {};
strategy.phases.phase_2_coverage = {
  ...(strategy.phases.phase_2_coverage || {}),
  status: activeCount >= 2000 ? 'IMPLEMENTED_AT_2000_PLUS_SCALE' : 'PARTIAL_SCALE_TARGET',
  minimums: strategy.phases.phase_2_coverage?.minimums || { active_reference_surfaces: 2000 },
  generated_counts: generatedCounts,
};
strategy.phases.phase_4_dominance = {
  ...(strategy.phases.phase_4_dominance || {}),
  status: 'RUNWAY_ACTIVE_NOT_COMPLETE',
  release_mix_policy: 'data/content/release_mix_policy.json',
  external_distribution: 'pending_real_world_execution',
};
writeJson('data/citation/citation_strategy_contract.json', strategy);

const inventory = readJson('data/citation/reference_page_inventory.json', {});
inventory.schema_version = inventory.schema_version || '2.0';
inventory.generated_at = TODAY;
inventory.scope = inventory.scope || 'BHPC / APlayerMode property cluster';
inventory.counts = {
  ...(inventory.counts || {}),
  active_reference_surfaces: activeCount,
  ...generatedCounts,
};
inventory.files = (inventory.files || []).filter(path => activePaths.has(path) && fs.existsSync(path));
writeJson('data/citation/reference_page_inventory.json', inventory);

console.log(`[citation:sync-phase] active_reference_surfaces=${activeCount}; inventory_files=${inventory.files.length}`);
