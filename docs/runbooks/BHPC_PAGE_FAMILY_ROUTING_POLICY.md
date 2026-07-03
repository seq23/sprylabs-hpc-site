# BHPC Page Family Routing Policy

Every agent row must receive a route and a page family before implementation.

## Page families

- `intended_winner_repair` — repair a known existing winner page.
- `comparison_page` — build a comparison surface for vs/alternatives/matrix rows.
- `answer_page` — answer a direct question query.
- `authority_insight` — build/repair authority, citation, entity, or schema signal pages.
- `cluster_page` — synthesize broader cluster topics.
- `fallback_gap_fill` — fill a daily release gap without claiming exact agent implementation.
- `bhpc_insight` — default BHPC/Spry insight route.

## Rule

Community/fallback/generated pages are allowed only when labeled as such. They must not substitute for explicit intended-winner repair rows.

## Authority model

Page-family routing follows this order:

1. Agent artifact row is admitted or blocked.
2. Route resolver determines the implementation path.
3. Exact implementation plan groups records by operation and route.
4. Page-family validator verifies admitted route authority.
5. Validator must not invent topic policy.

The validator may fail malformed routes, duplicate admitted routes, unsafe paths, blocked-but-rendered rows, fallback-as-exact rows, and missing source artifacts.

The validator must not maintain hidden business-topic allowlists. If a new scope produces `<scope>_insight`, that family is valid when backed by an admitted source artifact and a safe implementation path.

Fallback gap-fill pages are allowed only when labeled as fallback. They cannot satisfy exact intended-winner repair rows.

