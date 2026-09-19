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

## What now holds the gate

1. **The writer's instructions** (`TWIN_AGENT_BHPC_REPO_DROP_INSTRUCTIONS.md`)
   say branch `agent-drop/<date>-<scope>` + pull request, and carry the sentence
   "Never push to `main`". `validate:agent-drop-gate` reads the document and
   fails if the sentence, the branch, or the pull request goes missing.
2. **The sentinel acts.** When the Main Validation Sentinel finds `main` red and
   HEAD is a raw direct drop (single parent, only files under
   `data/report_fixes/agent_runs/`, a manifest among them, not a bot author, no
   merged pull request behind it), `.github/scripts/quarantine_raw_agent_drop.mjs`
   preserves the drop on `agent-drop/<date>-<scope>`, opens the pull request,
   and removes the drop from `main` through `commit_and_push_if_changed.sh`,
   which converges, pushes, and confirms a Validate Repo run on the new HEAD.
   Every refusal is named and writes nothing;
   `validate:raw-agent-drop-quarantine` proves each one against a scripted API.
3. **The intake absorbs what the artifact actually says.** Extensionless URLs
   resolve to the file Cloudflare Pages serves (`/download` -> `download.html`);
   an unlisted `recommended_page_type` on `repair_existing` is advisory, not a
   refusal; agent blocks render the union of every run on a page; absorb runs
   the cluster signal writers and re-compiles acceptance so one pass of the
   producers leaves the tree the validators describe.
4. **Distribution deploy is gated on the commit's own SHA** and the gate
   validator pins that shape.

## Named stops - owner actions this repository cannot take from inside

### 1. Branch protection on `main`

`main` has no protection and no ruleset (`gh api repos/seq23/sprylabs-hpc-site/rules/branches/main`
returns `[]`, checked 2026-09-19). A ruleset requiring the Validate Repo `gate`
check and a pull request would refuse the direct push at the door. It is not
enabled here because the three in-repo writer lanes (Spry Content Release,
Daily Citation Intelligence, Search Intelligence Cycle) push to `main` with
`GITHUB_TOKEN` and would be refused too unless the GitHub Actions app is a
bypass actor - and whether that bypass is available on this plan has to be
confirmed in the ruleset UI, not guessed. To enable it:

```bash
gh api -X POST repos/seq23/sprylabs-hpc-site/rulesets --input - <<'JSON'
{"name":"main: validated pull requests only","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},
 "rules":[{"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
          {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"gate"}]}}],
 "bypass_actors":[]}
JSON
```

then add the GitHub Actions app as a bypass actor in the ruleset UI (Settings ->
Rules -> Rulesets -> this ruleset -> Bypass list) and confirm the next scheduled
Spry Content Release still lands. Until then the sentinel's quarantine is the
gate, and it closes the window to roughly one Validate Repo run (~10 minutes)
rather than a day.

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
