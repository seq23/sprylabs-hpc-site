# Repository Identity

- **Repository:** `seq23/sprylabs-hpc-site`
- **Expected root name:** `sprylabs-hpc-site`
- **Repository class:** static publishing site with a shared page engine (Search Loop)
- **Primary branch:** `main`
- **Public domains:** `billionairehighperformancecoach.com`, `spryexecutiveos.com`, `aplayermode.com`
- **aplayermode.com:** the A Player Mode landing page, its About page and its own crawl files live in
  `aplayermode/` and are served at the apex by `workers/aplayermode-com` (route `aplayermode.com/*`),
  which fetches them from the Pages origin. The host is NOT served by `seq23/aplayer-mode`, which is the
  Expo app and the API on `app.aplayermode.com` / `api.aplayermode.com`. Declared here 25 Oct 2026 after
  the Search Readiness audit checked this site against the app repo and reported six items as missing.
- **aplayermode.com Worker deploy:** Cloudflare Pages self-deploys on a green `main`, which publishes the
  files; the Worker's own routing is deployed by `.github/workflows/deploy-aplayermode-worker.yml` on
  `main` (paths `workers/aplayermode-com/**`, `aplayermode/**`), which then proves the result on the live
  apex with `npm run check:aplayermode-live`. Deploying by hand
  (`npx wrangler deploy --config workers/aplayermode-com/wrangler.jsonc`) is the break-glass, not the
  route: left to a human it was forgotten, and the About page and real 404 sat on `main` unreachable for a
  day (Search Readiness a5, a9, b1, c2; 26 Oct 2026).
- **Package manager:** npm using `package-lock.json`
- **Node authority:** Node 24
- **Pages build:** Cloudflare Pages Git integration; `npm run build:pages-output` assembles `.pages-output/` (`wrangler.toml`); `functions/` stays at the repository root
- **Page engine:** Search Loop (`search-loop.yml`); the in-repo content engine was retired on 7 Nov 2026 and the published pages are static files

## Runtime model (7 Nov 2026)
- Sales route: `/download` (protected, see `docs/OPERATIONS.md`); checkout: Gumroad
- New pages: Search Loop only, under `/questions/` on billionairehighperformancecoach.com (spryexecutiveos.com is sunset, 8 Nov 2026)
- Measurement: `search-measurements.yml` (Search Console), read by `weekly-outcome-report.yml` and Boss OS
- Merge gate: `validate-repo.yml` (syntax, behaviour tests, safety checks)

## Root organization law
Repository-root aesthetics are not a release criterion. Public-route source is nested under `site/public/`, built output is `dist/`, and release safety is proven through route/source/deploy parity plus the existing content, ownership, and runtime contracts.
