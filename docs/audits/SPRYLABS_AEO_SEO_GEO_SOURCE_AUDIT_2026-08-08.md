# Spry Labs AEO / SEO / GEO Source Audit — 2026-08-08

**Repository:** `seq23/sprylabs-hpc-site`  
**Artifact baseline:** latest uploaded `sprylabs-hpc-site-main(2).zip`  
**Correlated GitHub main SHA observed during diagnosis:** `b191fd99885593432f8115a4212add6798faef92`  
**Audit mode:** artifact-mode source inspection  
**Claude specialist skill execution:** **NOT AVAILABLE IN THIS ARTIFACT RUNTIME**. No claim is made that the user's local Claude skill estate ran here. This audit instead inspects the repository's actual AEO/SEO/GEO contracts, active-page estate, authority-scale data, manifests, and generated evidence.

## Executive finding

The repository has a strong technical authority spine but mixed evidence quality. It has a real 100,000-opportunity materialized runway, deterministic query ownership, 2,615 admitted active query owners, structured-data coverage, accepted-output freeze, dynamic velocity governance, and distribution preparation. The major weaknesses are not lack of fanout machinery. They are evidence labeling, stale 5K/75-page strategy semantics, systemic metadata length inflation, and an AEO/GEO/SEO opportunity artifact that was only a five-candidate fixture/smoke map while sounding broader than it was.

This repair snapshot fixes the governance/evidence-labeling defects that can be corrected safely without mass-mutating frozen content. It does not convert metadata style preferences into release blockers and does not mass-rewrite thousands of accepted pages.

## Evidence snapshot

| Surface | Observed state | Audit interpretation |
|---|---:|---|
| Materialized authority runway | 100,000 opportunities | Real planning/fanout capacity, not a page quota or citation count |
| Theoretical combination capacity | 2,100,000 | Capacity only; not published/indexed/surfaced proof |
| Admitted page records | 2,615 | Real repository admission records |
| Active query owners | 2,615 | Strong canonical ownership discipline |
| Active citable files inspected | 2,615 | Production authority estate inspected structurally |
| Missing `<title>` | 0 | Strong baseline |
| Missing meta description | 0 | Strong baseline |
| Missing canonical | 0 | Strong baseline |
| Missing H1 | 0 | Strong baseline |
| Missing JSON-LD | 0 | Strong baseline |
| Duplicate title groups | 0 | Strong intent/title uniqueness signal |
| Duplicate canonical groups | 0 | Strong canonical uniqueness signal |
| Duplicate H1 groups | 0 | Strong page-heading uniqueness signal |
| Titles > 70 chars | 2,229 | Systemic optimization backlog; warning class, not release hard fail |
| Meta descriptions > 165 chars | 2,290 | Systemic optimization backlog; warning class, not release hard fail |
| Active pages < 300 words | 2 | Low incidence; not evidence of broad thin-page failure |
| Active pages < 600 words | 1,592 | Requires family/context interpretation; word count alone must not be a hard fail |
| Pages without `data-llm-answer="true"` | 10 | Small classification backlog; not every public utility page necessarily needs an answer block |
| Central AI-coaching source registry entries | 3 | Central registry is thin as proof of external-source breadth; page-level/source-specific evidence must remain the truth boundary |
| Current AEO/GEO/SEO opportunity map | 5 fixture-named candidates | Pipeline smoke/candidate evidence only, not a production audit |

## What is working well

1. **Canonical ownership is strong.** Active queries have deterministic owners and the inspected estate shows no duplicate canonical URLs, titles, or H1 groups.
2. **Machine-readable coverage is broad.** All 2,615 inspected active citable files contain JSON-LD, and the repo has explicit visible-content/schema parity tooling.
3. **Authority scale is correctly separated from outcome claims.** `data/authority_scale/surfacing_strategy_contract.json` explicitly says 100K is an acceleration target rather than a guaranteed outcome or page quota.
4. **Velocity governance is directionally correct.** `data/authority_scale/velocity_governor.json` defines a default 25 new-page ceiling and a separate 75-unit explicit citation-expansion ceiling, with `targets_are_quotas=false` and evidence-driven scale-up/down conditions.
5. **Accepted-output freeze is a real correctness boundary.** The current workflow failure proves the freeze guard catches out-of-scope mutation rather than silently accepting it.
6. **Distribution plumbing exists.** IndexNow/GSC/Bing submission manifests and budget controls are present, while the repo's truth contracts avoid treating preparation as external visibility proof.

## Material findings and disposition in this snapshot

### 1. Routine schema repair violated accepted-output scope — FIXED

The routine `agent-intake` release created an exact mutation scope, then `repair_schema_parity.py` ignored it and repaired the full active citation estate. The freeze layer correctly rejected 21 changed accepted routes outside scope.

**Snapshot repair:** schema repair now honors `data/release/active_mutation_scope.json` when present. The routine agent-intake lane requires a non-empty exact scope. Explicit maintenance/global repair remains possible only through an explicit scope mode rather than by silently ignoring the release transaction.

### 2. Root-tree validation was brittle — FIXED

The previous validator rejected `AGENTS.md` while blanket-allowing any underscore-prefixed JSON root file.

**Snapshot repair:** root policy now explicitly admits repo/operator authority and updater/bootstrap interfaces, warns on ordinary root cleanup debt without blocking release, and hard-fails secret-like/credential material. The blanket underscore-JSON escape hatch is removed.

### 3. Internal control-plane root clutter — PARTIALLY CLEANED, SAFELY

Seven domain/internal contracts and route manifests were moved out of web root into semantic locations under `config/` and `data/routes/`, with live consumers rewired.

Retained at root intentionally because they form generic updater/packaging/validation bootstrap interfaces:

- `_artifact_validation_manifest.json`
- `_baseline_packaging_contract.json`
- `_repo_lifecycle_profile.json`
- `_repo_update_contract.json`
- `_repo_validation_matrix.json`
- `_validation_bootstrap.json`
- `_validation_registry.json`

These retained files are not treated as arbitrary clutter; they are stable repository-interface contracts.

### 4. AEO/GEO/SEO opportunity artifact overstated its evidence class — FIXED

The existing file contained five `candidate_spry_fixture_*` records. It was useful as a pipeline smoke test, but its filename could be misread as a production-wide audit.

**Snapshot repair:** the builder now emits an explicit evidence class, source scope, `production_audit:false`, count, and truth boundary. Fixture/candidate maps may no longer masquerade as production visibility evidence.

### 5. Legacy 5K / 75-unit strategy semantics conflicted with current authority law — FIXED AT GOVERNANCE LAYER

The 5K plan said `Status: Active` and described 75 pages/day as the operating pace. Current Authority Scale law says publication numbers are safety ceilings, not quotas, and the live governor separates default 25/day from the explicit 75-unit citation-expansion lane.

**Snapshot repair:** the 5K plan is labeled a legacy compatibility lane subordinate to Authority Scale. Its 75-unit number remains an executable ceiling for the explicit citation-expansion lane, not the default daily target or governing authority objective. Validation now checks against the governor rather than treating hard-coded 75 as universal law.

### 6. Systemic metadata length inflation — RECORDED, NOT MASS-MUTATED

2,229 active pages have titles longer than 70 characters and 2,290 have descriptions longer than 165 characters. This is a large generator/editorial optimization opportunity, but length is not by itself proof of search harm and should not become a hard release blocker.

**Snapshot disposition:** no mass rewrite. Any future normalization must be generator/family-aware and must pass exact thaw/mutate/validate/refreeze scope because changing thousands of accepted pages casually would violate the repository's freeze law.

### 7. Central source registry breadth is thin — RECORDED, NOT FABRICATED

The central AI coaching source registry lists three sources. That does not prove the full page estate is poorly sourced because comparison/product pages may carry page-level official sources and much of the site explains internal methodology. It does mean the central registry alone is insufficient evidence for broad third-party authority.

**Snapshot disposition:** no fabricated sources and no fake citation claims. Existing provenance/source-specific contracts remain authoritative.

## AEO assessment

The site is technically well prepared for answer extraction: named frameworks, direct-answer blocks on almost all authority pages, FAQ/HowTo/DefinedTerm schemas, canonical ownership, and no duplicate title/H1/canonical groups in the active estate. The primary AEO weakness found in this audit is evidence interpretation: candidate-role maps and internal opportunity counts must not be treated as actual answer-engine surfacing.

## GEO assessment

Entity/coherence infrastructure exists through author/publisher identity, methodology pages, framework naming, `llms.txt`/`llms-full.txt`, source boundaries, and internal authority graphs. The strongest GEO governance choice is the repo's refusal to claim external LLM citations or AI visibility without telemetry. The central source registry is not deep enough by itself to substantiate broad external authority; page-level truthful sources remain essential.

## SEO assessment

Core technical hygiene is strong across the active citable estate: titles, descriptions, canonicals, H1s, and structured data are present, with no observed duplicate title/canonical/H1 groups. The clear systemic optimization backlog is title/meta length inflation. This should be addressed as a scoped generator/editorial quality project, not as a brittle validation gate and not inside the current CI repair transaction.

## Truth boundary

This audit proves repository structure and source-state observations only. It does **not** prove live rankings, crawl/index status, Search Console performance, Bing performance, backlinks, traffic, AI Overview appearances, ChatGPT/Claude/Gemini citations, conversions, or production deployment behavior. Those require external telemetry or live-provider evidence.
