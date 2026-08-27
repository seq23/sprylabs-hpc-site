#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ensureRuntime, managedPython} from './python_runtime.mjs';
import {readCapturedScope, DEFAULT_SCOPE_FILE} from './page_scope.mjs';

function writeSummary(evidenceFile, summary) {
  fs.mkdirSync(path.dirname(evidenceFile), {recursive: true});
  fs.writeFileSync(evidenceFile, `${JSON.stringify(summary, null, 2)}\n`);
}

export function runPageAudit({mode, label, evidenceFile}) {
  if (!['incremental', 'full'].includes(mode)) throw new Error(`unsupported page-audit mode: ${mode}`);
  const env = {...process.env, VALIDATION_CACHE_MODE: mode, PYTHONDONTWRITEBYTECODE: '1'};
  const started = Date.now();
  const results = [];

  function run(id, cmd, args, extraEnv = {}) {
    const r = spawnSync(cmd, args, {stdio: 'inherit', env: {...env, ...extraEnv}});
    const code = r.status ?? 2;
    results.push({id, exit_code: code});
    return code;
  }

  if (run('profile_routing_self_test', 'node', ['scripts/validation/self_test_page_audit_profile_routing.mjs']) !== 0) {
    const summary = {status: 'FAIL', mode, elapsed_ms: Date.now() - started, steps: results};
    writeSummary(evidenceFile, summary);
    return 1;
  }

  if (mode === 'incremental') {
    // readCapturedScope falls back to DEFAULT_SCOPE_FILE, but page_scope.py
    // requires VALIDATION_PAGE_SCOPE_FILE and hard-fails without it. Resolve one
    // path here and export it so every child - node and python - reads the same
    // scope file instead of the two sides disagreeing about where it lives.
    const scopeFile = path.resolve(env.VALIDATION_PAGE_SCOPE_FILE || DEFAULT_SCOPE_FILE);
    env.VALIDATION_PAGE_SCOPE_FILE = scopeFile;
    let scope;
    try {
      scope = readCapturedScope(scopeFile);
    } catch (error) {
      console.error(`[${label}] INTERNAL_ERROR: ${error.message}`);
      writeSummary(evidenceFile, {
        status: 'INTERNAL_ERROR', mode, elapsed_ms: Date.now() - started,
        error: error.message, steps: results,
      });
      return 2;
    }

    console.log(`[${label}] scope pages=${scope.paths.length}; repairable=${scope.repair_paths.length}; unrepairable=${scope.unrepairable_changed_paths.length}`);
    if (run('scope_self_test', 'node', ['scripts/validation/self_test_changed_page_scope.mjs']) !== 0) {
      const summary = {status: 'FAIL', mode, elapsed_ms: Date.now() - started, steps: results};
      writeSummary(evidenceFile, summary);
      return 1;
    }

    if (scope.repair_paths.length) {
      ensureRuntime();
      if (run(
        'scoped_schema_finalization',
        managedPython(),
        ['scripts/citation/repair_schema_parity.py'],
      ) !== 0) {
        const summary = {status: 'FAIL', mode, elapsed_ms: Date.now() - started, steps: results};
        writeSummary(evidenceFile, summary);
        return 1;
      }
    }
  } else {
    // Full audits are deliberately scope-independent. Remove any inherited
    // incremental scope so nested validators cannot accidentally narrow proof.
    delete env.VALIDATION_PAGE_SCOPE_FILE;
    console.log(`[${label}] corpus-wide page audit; changed-page scope not required`);
  }

  const steps = [
    ['extraction', 'node', ['scripts/validation/run_extraction_contract_final_state_sharded.mjs']],
    ['schema', 'node', ['scripts/validation/run_rendered_schema_parity_sharded.mjs']],
    ['page_seo', 'node', ['scripts/validation/validate_page_seo_contract.mjs', ...(mode === 'full' ? ['--full'] : [])]],
  ];

  for (const [id, cmd, args] of steps) {
    if (run(id, cmd, args) !== 0) break;
  }

  // Compact the cache journal and sweep unreachable objects now that every shard
  // has exited. This is the only thing bounding the store: page-index.json holds
  // just the current fingerprint per (validator, page), so each content change
  // strands its predecessor. With no sweep the cache reached 97,003 objects /
  // 381 MB against 8,481 live results before anyone noticed.
  //
  // Deliberately after the shards rather than inside them - prune treats the
  // index as its root set, so it must never run while a validator is still
  // adding to it. Its exit code is not allowed to change the audit result: a
  // failed sweep is a disk-space problem, not a validation failure.
  run('cache_prune', 'node', ['scripts/validation/cache/validation_cache.mjs', 'prune']);

  const summary = {
    status: results
      .filter(r => r.id !== 'cache_prune')
      .every(r => r.exit_code === 0)
      ? 'PASS'
      : 'FAIL',
    mode,
    elapsed_ms: Date.now() - started,
    steps: results,
  };
  writeSummary(evidenceFile, summary);
  console.log(`[${label}] ${summary.status}: mode=${mode}; elapsed_ms=${summary.elapsed_ms}`);
  return summary.status === 'PASS' ? 0 : 1;
}
