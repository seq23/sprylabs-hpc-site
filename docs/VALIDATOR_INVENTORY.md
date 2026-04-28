# Validator Inventory

## Core Validators

- scripts/validators/validate_backlog_contract.js
- scripts/validators/validate_prebuild.js
- scripts/validators/validate_cannibalization.js
- scripts/validators/validate_query_coverage.js
- scripts/validators/validate_conversion_contract.js
- scripts/validators/validate_extractability.js
- scripts/validators/validate_page_type_conversion_floor.js
- scripts/validators/validate_answer_surface_history.js
- scripts/validators/validate_answer_surface_weakness_backlog.js
- scripts/validators/validate_answer_surface_dashboard_gates.js
- scripts/validators/validate_internal_authority_graph.js
- scripts/validators/validate_aeo_contract.js
- scripts/validators/validate_fanout_blocks.js
- scripts/validators/validate_schema_contract.js
- scripts/validators/validate_crawl_contract.js
- scripts/validators/validate_conversion_endpoint.js
- scripts/validators/validate_url_contract.js
- scripts/validators/validate_sitemap_page_parity.js
- scripts/validators/validate_canonical_url_contract.js
- scripts/validators/validate_cta_endpoint_contract.js

## Hard Standards

- Cannibalization: 0 collisions
- Query coverage: 100% canonical use-case coverage
- Fanout: no warnings
- Page-type conversion: warnings=0
- Validation: [validate_all] OK

## Advisory vs Hard Fail

In production strict mode, warnings are not acceptable unless a validator is explicitly documented as advisory.
