#!/usr/bin/env bash
set -euo pipefail
run() {
  echo "[validate_all] $*"
  "$@"
}
run node scripts/prepare_distribution_artifacts.js
run node scripts/validators/validate_backlog_contract.js
run node scripts/validators/validate_prebuild.js
node scripts/validators/validate_signal_floor.js
run node scripts/validators/validate_conversion_contract.js
node scripts/validators/validate_machine_readability_contract.js
run node scripts/validators/validate_social_firehose_contract.js
run node scripts/validators/validate_throttle_contract.js
run node scripts/validators/validate_vertical_keys.js
run node scripts/validators/validate_content_routing.js
run node scripts/validators/validate_extractability.js
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
run node scripts/validators/validate_author_trust.js
run node scripts/validators/validate_entity_coverage.js
run node scripts/validators/validate_query_metadata.js
run node scripts/validators/validate_query_traceability.js
run node scripts/internal/build_link_graph.js
run node scripts/validators/validate_internal_authority_graph.js
run node scripts/validators/validate_aeo_contract.js
run node scripts/validators/validate_fanout_blocks.js
run node scripts/validators/validate_schema_contract.js
run node scripts/validators/validate_crawl_contract.js
run node scripts/validators/validate_conversion_endpoint.js
run node scripts/validators/validate_url_contract.js
run node scripts/validators/validate_sitemap_page_parity.js
run node scripts/validators/validate_canonical_url_contract.js
run node scripts/validators/validate_cta_endpoint_contract.js
echo "[validate_all] OK"
