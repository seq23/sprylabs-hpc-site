#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const steps = [
  ['node', ['scripts/prepare_distribution_artifacts.js']],
  ['node', ['scripts/build_coverage_map.js']],
  ['node', ['_ops/validators/validate_distribution_contract.js']],
  ['node', ['_ops/validators/validate_dual_domain_contract.js']],
  ['node', ['_ops/validators/validate_internal_links.js']],
  ['node', ['_ops/validators/validate_reddit_publish_contract.js']],
  ['node', ['_ops/validators/validate_reddit_uniqueness.js']],
  ['node', ['scripts/validate_fanout_warning.js']],
  ['node', ['scripts/validate_geo_semantics.js']],
  ['node', ['scripts/validate_content_routing.js']],
  ['node', ['scripts/validate_audience_framing.js']],
  ['node', ['scripts/validate_conversion_targets.js']],
  ['node', ['scripts/validators/validate_destination_contracts.js']],
  ['node', ['scripts/validators/validate_above_fold.js']],
  ['node', ['scripts/validators/validate_cta_presence.js']],
  ['node', ['scripts/validators/validate_authority_engine.js']],
  ['node', ['scripts/validators/validate_word_count.js']],
];
for (const [cmd, args] of steps) {
  console.log(`[run_validate_all] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: process.cwd(), timeout: 30000 });
  if (result.error) {
    console.error(`[run_validate_all] FAIL: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[run_validate_all] FAIL: ${cmd} ${args.join(' ')} exited ${result.status}`);
    process.exit(result.status || 1);
  }
}
console.log('[run_validate_all] OK');
process.exit(0);
