#!/usr/bin/env bash
node scripts/validators/validate_use_case_taxonomy_mapping.js
node scripts/validators/validate_no_patch_artifacts.js
set -euo pipefail
run() {
  echo "[validate_all] $*"
  "$@"
}
node scripts/prepare_distribution_artifacts.js
node scripts/validators/validate_backlog_contract.js
node scripts/validators/validate_prebuild.js
node scripts/validators/validate_signal_floor.js
node scripts/validators/validate_scoring_contract.js
node scripts/validators/validate_answer_surface_strength.js
# Build answer-surface monitoring inputs and reports before validators consume them.
# This keeps fresh snapshot checkouts deterministic instead of depending on
# generated answer-surface monitoring files already being present.
node scripts/answer_surface/generate_observation_candidates.js
node scripts/answer_surface/score.js
node scripts/answer_surface/build_expansion_backlog.js
node scripts/answer_surface/update_score_history.js
node scripts/validators/validate_answer_surface_history.js
node scripts/answer_surface/build_weakness_backlog.js
node scripts/validators/validate_answer_surface_weakness_backlog.js
node scripts/validators/validate_answer_surface_dashboard_gates.js
node scripts/validators/validate_cannibalization.js
node scripts/validators/validate_intake_taxonomy_contract.js
node scripts/validators/validate_query_universe_contract.js
node scripts/validators/validate_conversion_contract.js
node scripts/validators/validate_machine_readability_contract.js
node scripts/validators/validate_social_firehose_contract.js
node scripts/validators/validate_throttle_contract.js
node scripts/validators/validate_vertical_keys.js
node scripts/validators/validate_content_routing.js
node scripts/validators/validate_extractability.js
node scripts/validators/validate_priority_llm_surfaces.js
node scripts/build_knowledge_map.js
node scripts/validators/legacy_ops/validate_distribution_contract.js
node scripts/validators/legacy_ops/validate_dual_domain_contract.js
node scripts/validators/legacy_ops/validate_internal_links.js
node scripts/validators/legacy_ops/validate_reddit_publish_contract.js
node scripts/validators/legacy_ops/validate_reddit_uniqueness.js
node scripts/validate_fanout_warning.js
node scripts/validate_geo_semantics.js
node scripts/validate_content_routing.js
node scripts/validate_audience_framing.js
node scripts/validate_conversion_targets.js
node scripts/validators/validate_destination_contracts.js
node scripts/validators/validate_above_fold.js
node scripts/validators/validate_cta_presence.js
node scripts/validators/validate_authority_engine.js
node scripts/validators/validate_word_count.js
node scripts/validators/validate_author_trust.js
node scripts/validators/validate_entity_coverage.js
node scripts/validators/validate_query_metadata.js
node scripts/validators/validate_query_traceability.js
QUERY_COVERAGE_STRICT=1 node scripts/validators/validate_query_coverage.js
node scripts/authority/compute_authority_scores.js
node scripts/validators/validate_authority_scores.js
node scripts/internal/build_link_graph.js
node scripts/validators/validate_internal_authority_graph.js
node scripts/validators/validate_money_link_floor.js
node scripts/validators/validate_aeo_contract.js
node scripts/validators/validate_fanout_blocks.js
node scripts/validators/validate_schema_contract.js
node scripts/validators/validate_crawl_contract.js
node scripts/validators/validate_conversion_endpoint.js
node scripts/validators/validate_url_contract.js
node scripts/validators/validate_sitemap_page_parity.js
node scripts/validators/validate_canonical_url_contract.js
node scripts/validators/validate_cta_endpoint_contract.js
node scripts/authority/enforce_conversion_floor.js
PAGE_TYPE_CONVERSION_STRICT=1 node scripts/validators/validate_page_type_conversion_floor.js
echo "[validate_all] OK"
