# Repository Identity

- **Repository:** `seq23/sprylabs-hpc-site`
- **Expected root name:** `sprylabs-hpc-site`
- **Repository class:** Level 2 generated static publishing and authority system
- **Primary branch:** `main`
- **Public domains:** `billionairehighperformancecoach.com`, `spryexecutiveos.com`
- **Package manager:** npm using `package-lock.json`
- **Node authority:** Node 24
- **Browser surface:** public static pages plus passwordless noindex operator surfaces `/admin/` and `/agency/`
- **Canonical public source:** `site/public/`
- **Generated deploy output:** `dist/`
- **Cloudflare Pages Functions:** `functions/` remains at repository root
- **Current Pages deployment compatibility:** existing repository-root output remains supported by root `_redirects`/`_headers` shims that serve canonical routes from `site/public/`; `dist/` is the generated deployment-ready mirror
- **Canonical source handoff:** full baseline ZIP packaged from the true repository root

## Runtime authority model
- Purpose: LLM ingestion and citation authority
- Sales route: `/download`
- Checkout: Gumroad
- Paid AI-agent artifact lane: external agent artifacts generally arrive on a weekly cadence; the intake/acceptance/absorb/apply/trace subsystem is preserved independently.
- In-repo release lane: scheduled Spry content/release automation may run daily and consumes the newest accepted state without redefining the external agent artifact cadence.
- Free lane: daily autonomous gap-filling citation engine.
- Search-intelligence lane: independent SEO/AEO/GEO query observation and bounded self-heal; it never routes through AI-agent intake and never changes publishing cadence.
- Admin: passwordless noindex `/admin/` operations command center with Normal / Aggressive / Maximum velocity-envelope controls.
- Agency: noindex `/agency/` closed-loop SEO/AEO/GEO evidence dashboard.
- Runtime mode: `FULL_SAFE_AUTONOMY`
- Routine approval: none

## Root organization law
Repository-root aesthetics are not a release criterion. Public-route source is nested under `site/public/`, built output is `dist/`, and release safety is proven through route/source/deploy parity plus the existing content, ownership, and runtime contracts.
