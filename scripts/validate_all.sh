#!/usr/bin/env bash
node node scripts/validators/validate_use_case_taxonomy_mapping.js
node node scripts/validators/validate_no_patch_artifacts.js
set -euo pipefail
run() {
  echo "[validate_all] $*"
  "$@"
}
node node scripts/prepare_distribution_artifacts.js
node node scripts/validators/validate_backlog_contract.js
node node scripts/validators/validate_prebuild.js
node scripts/validators/validate_signal_floor.js
node scripts/validators/validate_scoring_contract.js
node scripts/validators/validate_answer_surface_strength.js
node scripts/answer_surface/update_score_history.js
node scripts/validators/validate_answer_surface_history.js
node scripts/answer_surface/build_weakness_backlog.js
node scripts/validators/validate_answer_surface_weakness_backlog.js
node scripts/validators/validate_answer_surface_dashboard_gates.js
node scripts/validators/validate_cannibalization.js
node scripts/validators/validate_intake_taxonomy_contract.js
node scripts/validators/validate_query_universe_contract.js
node node scripts/validators/validate_conversion_contract.js
node scripts/validators/validate_machine_readability_contract.js
node node scripts/validators/validate_social_firehose_contract.js
node node scripts/validators/validate_throttle_contract.js
node node scripts/validators/validate_vertical_keys.js
node node scripts/validators/validate_content_routing.js
node node scripts/validators/validate_extractability.js
node node scripts/build_coverage_map.js
node node _ops/validators/validate_distribution_contract.js
node node _ops/validators/validate_dual_domain_contract.js
node node _ops/validators/validate_internal_links.js
node node _ops/validators/validate_reddit_publish_contract.js
node node _ops/validators/validate_reddit_uniqueness.js
node node scripts/validate_fanout_warning.js
node node scripts/validate_geo_semantics.js
node node scripts/validate_content_routing.js
node node scripts/validate_audience_framing.js
node node scripts/validate_conversion_targets.js
node node scripts/validators/validate_destination_contracts.js
node node scripts/validators/validate_above_fold.js
node node scripts/validators/validate_cta_presence.js
node node scripts/validators/validate_authority_engine.js
node node scripts/validators/validate_word_count.js
node node scripts/validators/validate_author_trust.js
node node scripts/validators/validate_entity_coverage.js
node node scripts/validators/validate_query_metadata.js
node node scripts/validators/validate_query_traceability.js
QUERY_COVERAGE_STRICT=1 node scripts/validators/validate_query_coverage.js
node node scripts/authority/compute_authority_scores.js
node scripts/validators/validate_authority_scores.js
node scripts/internal/build_link_graph.js
node node scripts/validators/validate_internal_authority_graph.js
node scripts/validators/validate_money_link_floor.js
node node scripts/validators/validate_aeo_contract.js
node node scripts/validators/validate_fanout_blocks.js
node node scripts/validators/validate_schema_contract.js
node node scripts/validators/validate_crawl_contract.js
node node scripts/validators/validate_conversion_endpoint.js
node node scripts/validators/validate_url_contract.js
node node scripts/validators/validate_sitemap_page_parity.js
node node scripts/validators/validate_canonical_url_contract.js
node node scripts/validators/validate_cta_endpoint_contract.js
node scripts/authority/enforce_conversion_floor.js
PAGE_TYPE_CONVERSION_STRICT=1 node scripts/validators/validate_page_type_conversion_floor.js
echo "[validate_all] OK"
