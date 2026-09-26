# The Saturday agent drop gate

## What broke, every Saturday

The Twin Agent writes its weekly BHPC artifact into this repository as the
owner (`S.L.T.`), by direct push to `main`, around 08:10-08:55 CT on Saturday.
Nothing checks the artifact before it lands on the branch the site deploys
from, so each weekly run is a bet against an intake contract the writer cannot
see. Six Saturdays in a row the bet lost and `main` went red at once on
Validate Repo, Spry Content Release and the Main Validation Sentinel:

| Saturday | drop commit | Validate Repo | fixed by |
|---|---|---|---|
| 2026-08-08 | `b191fd998` | [31258832447](https://github.com/seq23/sprylabs-hpc-site/actions/runs/31258832447) failure | same-day intake PRs |
| 2026-08-15 | `1c2374b74` | [31886339425](https://github.com/seq23/sprylabs-hpc-site/actions/runs/31886339425) failure | same-day intake PRs |
| 2026-08-22 | `a7949a6b4` | [32575602958](https://github.com/seq23/sprylabs-hpc-site/actions/runs/32575602958) failure | same-day intake PRs |
| 2026-08-29 | `a9e8b0c70` | [33254892310](https://github.com/seq23/sprylabs-hpc-site/actions/runs/33254892310) failure | #22-#30 |
| 2026-09-12 | `d0aa40d48` | [34696447670](https://github.com/seq23/sprylabs-hpc-site/actions/runs/34696447670) failure | #76-#84 |
| 2026-09-19 | `92463ae96` | [35447192757](https://github.com/seq23/sprylabs-hpc-site/actions/runs/35447192757) failure | this gate |

Every fix repaired what that week's artifact tripped in the intake. None
touched the state that produced the week: an unvalidated direct write to the
deploy branch. PR #93 (2026-09-17) fixed a different writer class entirely - the
in-repo `GITHUB_TOKEN` lanes, whose pushes raise no push event - and could not
have stopped a push made with the owner's own credentials, which raises every
event and simply fails them.

## Why it came back on 2026-09-26, and what holds it now

The seventh drop (`71962cd28`, Validate Repo
[36245892704](https://github.com/seq23/sprylabs-hpc-site/actions/runs/36245892704))
failed on `[extraction-surface-guard] FAIL: 5 governed surfaces changed`. That
failure does not depend on the artifact at all: Validate Repo's producer chain
(`release:repair-agent-normalization`) ran the absorber, which claimed the
`READY_FOR_ABSORPTION` run, and `build:all` then applied its repairs to governed
pages the commit did not contain. **A raw drop could never validate green, and
neither could a pull request holding only the drop** - so neither "fix the
intake" nor "open a PR" could stop the next Saturday. The quarantine that #95
added also failed: GitHub refuses pull-request creation to `GITHUB_TOKEN`
(sentinel run 36246107783, HTTP 403).

What holds it now:

1. **A pending drop is inert outside the absorber.**
   `absorb_bhpc_agent_runs.mjs` claims a READY run only where
   `BHPC_ABSORB_READY_RUNS=1`, set once, at the top of
   `spry-content-release.yml`. Validate Repo, the pre-push profile and every
   other lane's convergence leave it untouched and print
   `NAMED STOP pending_absorption`. A drop commit therefore validates the tree it
   actually holds. `validate_agent_artifact_absorption_trigger.mjs` already
   bounds how long a run may stay pending. Guard:
   `validate:absorb-claims-only-in-absorber` (real absorber, real 2026-09-26
   drop, both ways; no other workflow may set the switch).
2. **The drop lands with its pages, in one commit, or not at all.** Spry
   Content Release (push-triggered on the manifest, and daily) absorbs,
   validates, converges and commits drop + pages + snapshot. An artifact the
   intake refuses fails that lane by name; `main` keeps its validated tree.
3. **The branch road** (`agent-drop/<date>-<scope>`, the writer's instructions)
   is absorbed by Agent Drop Intake -> Spry Content Release with `drop_branch`,
   which lays the drop onto `main`'s tip before the release validates it
   (`overlay_agent_drop.mjs`), then closes the PR and deletes the branch once
   `verify-landed` proves the drop is on `main`. Guard:
   `validate:agent-drop-overlay`.
4. **The quarantine** (fallback for a drop-shaped commit that is red for some
   other reason) preserves it on `agent-drop/<date>-<scope>` and dispatches
   Agent Drop Intake instead of opening a pull request. Guard:
   `validate:raw-agent-drop-quarantine`.
5. **What a drop is** lives once, in `.github/scripts/agent_drop_contract.mjs`,
   read by the quarantine, the overlay and `validate:agent-drop-gate`.
6. Distribution deploy stays gated on the commit's own SHA.

## Named stops - owner actions this repository cannot take from inside

### 1. Branch protection on `main` - not available on a user-owned repository

Tried 2026-09-26: a ruleset requiring pull requests with the GitHub Actions app
as bypass actor is refused (HTTP 422, "Actor GitHub Actions integration must be
part of the ruleset source or owner organization"). Without that bypass the
three `GITHUB_TOKEN` release lanes would be refused too. It is no longer needed:
item 1 above makes a direct drop harmless rather than forbidden.

### 2. Cloudflare Pages deploys `main` on push, validated or not

The site is served by the Cloudflare Pages git integration for project
`sprylabs-hpc-site`, which built and published `92463ae96` at 08:56 CT on
2026-09-19 while Validate Repo was failing on it (deployment
`197c1283-3fe3-4808-af0b-1499b145b92e`). Deploy Distribution - the workflow that
IS gated on a green run - only submits IndexNow and Search Console. So
"validated before deploy" is true of distribution and false of the pages
themselves. To close it: turn off automatic production deploys on the Pages
project and deploy from Deploy Distribution with `wrangler pages deploy
.pages-output --project-name sprylabs-hpc-site --branch main` after
`release:verify-attestation`, which needs a `CLOUDFLARE_API_TOKEN` (Pages:Edit)
and `CLOUDFLARE_ACCOUNT_ID` in the repository secrets. Both are owner-held;
this is the one channel the quarantine cannot reach, and it is why a raw drop
that only adds data files was never a broken site - only a red one.
