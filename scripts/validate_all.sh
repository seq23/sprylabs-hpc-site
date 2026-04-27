#!/usr/bin/env bash
set -euo pipefail
run() {
  echo "[validate_all] $*"
  timeout 20s "$@"
}
run node scripts/prepare_distribution_artifacts.js
run node scripts/build_coverage_map.js
run node _ops/validators/validate_distribution_contract.js
run node _ops/validators/validate_dual_domain_contract.js
run node _ops/validators/validate_internal_links.js
run node _ops/validators/validate_reddit_publish_contract.js
run node _ops/validators/validate_reddit_uniqueness.js
run node scripts/validate_fanout_warning.js
run node scripts/validate_geo_semantics.js
run node scripts/validate_content_routing.js
run node scripts/validate_audience_framing.js
run node scripts/validate_conversion_targets.js
run node scripts/validators/validate_destination_contracts.js
run node scripts/validators/validate_above_fold.js
run node scripts/validators/validate_cta_presence.js
run node scripts/validators/validate_authority_engine.js
run node scripts/validators/validate_word_count.js
echo "[validate_all] OK"
