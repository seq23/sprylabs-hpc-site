#!/usr/bin/env bash
# CONVERGE THE TREE BEFORE IT IS COMMITTED — the single authority.
#
# WHY THIS FILE EXISTS.
#
# #46 ("The content release stops publishing a tree its own generators disagree
# with") diagnosed the defect exactly right: a lane that commits page HTML
# without running build:all and the four ordered repair stages publishes a tree
# the downstream generators have never seen. It then fixed it in ONE place —
# inline in spry-content-release.yml.
#
# That left the other main-writing lanes untouched, and on 2026-09-01 the exact
# same defect came back through one of them. Commit ae39ee266
# ("zero-dollar citation intelligence: autonomous gap fill", from
# daily-citation-intelligence.yml) rewrote 2,018 page HTML files and pushed them
# with no convergence and no ledger re-derivation. The result on main:
#
#   validate:extraction-surface-guard   1,628 governed surfaces drifted  -> Validate Repo RED
#   validate:lastmod-ledger-final       1,873 of 2,231 pages stale       -> Spry Content Release RED
#   Main Validation Sentinel            alarms because main is red       -> RED
#
# Three red workflows, one cause, and the cause was a fix applied at a lane
# instead of at the authority.
#
# commit_and_push_if_changed.sh already made this argument for validation
# dispatch, in its own words: "Every main-writing workflow already routes its
# push through this one script, so requesting validation here covers all present
# writers and any future one for free - there is no per-workflow step an author
# can forget to add." Convergence belongs at exactly the same place and for
# exactly the same reason. This script is that authority; the commit helper
# calls it, and spry-content-release.yml calls it rather than keeping a second
# copy that can drift from this one.
#
# WHAT IT DOES.
#
# The loop is bounded and self-proving rather than a fixed number of passes:
# each iteration baselines the tree, runs the ordered stages, and asks the guard
# whether they changed anything. A pass that changes nothing IS the fixed point,
# and the snapshot left behind is the one that matches the tree about to be
# committed. Falling out of the loop without converging is a hard failure:
# publishing a tree the generators still disagree with is the defect this exists
# to stop, so it must never be the quiet outcome.
#
# The lastmod ledger is then re-derived LAST, after the final stage that can
# mutate a page. It writes the ledger and the sitemaps, neither of which is a
# governed extraction surface, so it cannot disturb the fixed point just
# established.
#
# RULE 0: this script never exits 0 having quietly done nothing. It either
# converges, or prints a NAMED stop saying which pending changes it inspected
# and why they cannot have moved a governed surface.

set -Eeuo pipefail

caller="${1:-unknown}"
passes="${CONVERGE_MAX_PASSES:-4}"

# Governed surfaces are the page HTML the extraction guard hashes, plus the
# three registries it projects, plus the sitemaps the ledger describes. A
# pending change confined to anything else (reports, metrics, signals, social
# runs) cannot move a hash the guard or the ledger reads, so converging would be
# a long no-op. That skip is NAMED, never silent.
pending="$(git status --porcelain --untracked-files=all | sed 's/^...//' | sed 's/.* -> //')"

if [ -z "$pending" ]; then
  echo "[converge] STOP no_pending_changes (${caller}): the working tree is clean, so there is no tree to converge and nothing will be committed."
  exit 0
fi

governed="$(printf '%s\n' "$pending" | grep -E '(\.html$|^data/citation/citable_pages\.json$|^data/citation/query_registry\.json$|^data/content/page_admission_registry\.json$|sitemap[^/]*\.xml$)' || true)"

pending_count="$(printf '%s\n' "$pending" | grep -c . || true)"

if [ -z "$governed" ]; then
  echo "[converge] STOP no_governed_surface_pending (${caller}): ${pending_count} pending path(s), none of which is page HTML, a citation/admission registry, or a sitemap."
  echo "[converge] Nothing the extraction-surface guard hashes or the lastmod ledger describes can have changed, so the committed tree stays at the fixed point it already had."
  echo "[converge] Pending paths:"
  # THE NAMED STOP MUST SURVIVE ITS OWN LOG LINE.
  #
  # This was `printf ... | sed ... | head -40`, under `set -Eeuo pipefail`. When
  # there are more than 40 pending paths, head closes the pipe on line 41, sed
  # takes SIGPIPE, pipefail makes the whole pipeline exit 141, and `set -e` kills
  # the script BEFORE the `exit 0` two lines below. A stop that had already
  # printed its reason and decided to succeed exited 141 instead.
  #
  # commit_and_push_if_changed.sh reads that as a convergence failure and prints
  # "Refusing to commit ... the tree did not converge", which is the opposite of
  # what happened - the tree converged so completely that nothing but reports was
  # left pending. Observed on run 33754789536: 152 pending paths, none of them
  # HTML, `sed: couldn't flush stdout: Broken pipe`, and the release died on a
  # legitimate no-op.
  #
  # Truncating in a guarded command substitution keeps the listing bounded
  # without putting a short-circuiting reader at the end of a live pipeline.
  listing="$(printf '%s\n' "$pending" | head -40 || true)"
  printf '%s\n' "$listing" | sed 's/^/  - /'
  if [ "$pending_count" -gt 40 ]; then
    echo "  ... and $((pending_count - 40)) more"
  fi
  exit 0
fi

governed_count="$(printf '%s\n' "$governed" | grep -c . || true)"
echo "[converge] ${governed_count} governed surface path(s) pending out of ${pending_count} (${caller}); converging before commit."

# ALREADY AT THE FIXED POINT? PROVE IT, DO NOT ASSUME IT.
#
# This script is called twice on the release lane: once explicitly, so the
# cadence gate and the accept step see the converged tree, and once again from
# commit_and_push_if_changed.sh, which is the choke point that covers every
# other writer. A second full convergence would cost another build:all for
# nothing, so re-entry may skip the loop - but only on a proof that holds.
#
# THE GUARD CHECK ALONE IS NOT THAT PROOF. It compares the tree against the
# snapshot rebaselined at the start of the last pass, so it answers "has the tree
# moved since then", not "would the generators move it now". Those are the same
# question only while the generators' INPUTS are also unchanged, and steps
# between the two calls change inputs without touching a governed surface:
# authority:scale:freeze rewrites the frozen output registry, clear-scope empties
# the active mutation scope, ownership:build and admin:build rewrite the
# registries under data/.
#
# Reproduced on 326908929. The release lane converged, froze, rebuilt ownership
# and admin, and this fast path then reported already_converged on a verified
# guard pass. The tree it let through was committed - and Validate Repo, running
# the identical producer sequence on a fresh checkout, moved 50 governed
# surfaces and went red. The skip was wrong and the guard could not see it.
#
# So the skip now additionally requires that NOTHING in the repository has been
# written since the convergence that claimed the fixed point. That marker is the
# only thing that makes "the inputs have not moved either" a fact rather than an
# assumption. It can only cause more convergence than before, never less.
MARKER='.validation-runtime/converged.marker'
unchanged_since_convergence() {
  [ -f "$MARKER" ] || return 1
  [ -z "$(find . \
      -path ./node_modules -prune -o \
      -path ./.git -prune -o \
      -path ./.validation-runtime -prune -o \
      -newer "$MARKER" -type f -print -quit)" ]
}

if unchanged_since_convergence \
   && npm run validate:extraction-surface-guard:check >/dev/null 2>&1 \
   && LASTMOD_LEDGER_SCOPE=pending npm run validate:lastmod-ledger-final >/dev/null 2>&1; then
  echo "[converge] STOP already_converged (${caller}): nothing has been written to the repository since the convergence that established the fixed point, and the surface guard and the pending-scope lastmod ledger both pass against this tree. Re-running build:all would change nothing."
  exit 0
fi

if [ -f "$MARKER" ]; then
  echo "[converge] re-entry is NOT a skip (${caller}): the repository has been written to since the last convergence, so the generators' inputs have moved and the fixed point has to be re-established."
fi

converged=
for pass in $(seq 1 "$passes"); do
  echo "::group::convergence pass ${pass}"
  EXTRACTION_SURFACE_REBASELINE=1 npm run validate:extraction-surface-guard:snapshot
  npm run build:all
  npm run repair:dual-domain-metadata
  npm run agent:bhpc:apply-report-contract
  npm run release:repair-agent-normalization
  npm run repair:citation-contract-surfaces
  # A page-mutating repair that is not in this list is, by definition, not
  # converged. search:repair:apply writes a search-intelligence repair block
  # into a page and ledgers it APPLIED, but it ran in neither build:all nor any
  # stage above - so the very next rebuild stripped the block while the ledger
  # went on claiming it was applied.
  #
  # That is not a theory. repair_568ac268735378bd was re-applied by hand at
  # 17:48 on 2026-09-01 and committed in 081abdf5a; the spry-content-release run
  # 40 minutes later rebuilt the tree, erased it again, and VAL-SEARCH-
  # INTELLIGENCE failed on ea323c742 with the identical message. Re-applying it
  # by hand fixes exactly one release cycle, which is why it belongs here.
  npm run search:repair:apply
  echo "::endgroup::"
  if npm run validate:extraction-surface-guard:check; then
    echo "[converge] fixed point reached after pass ${pass}"
    converged=1
    break
  fi
  echo "[converge] pass ${pass} still changed governed surfaces; running another pass"
done

if [ -z "$converged" ]; then
  echo "[converge] FAIL (${caller}): build:all and the ordered repairs still changed governed extraction surfaces after ${passes} passes." >&2
  echo "[converge] The generators are not reaching a fixed point on this tree, so nothing here can be published as final." >&2
  exit 1
fi

# Re-derived here, last, after the final stage that can mutate a page. Deriving
# it any earlier is the exact defect validate:lastmod-ledger-final exists to
# catch: a ledger committed alongside pages it no longer describes.
echo "::group::re-derive the lastmod ledger against the converged tree"
npm run sitemap:lastmod:content
echo "::endgroup::"
LASTMOD_LEDGER_SCOPE=pending npm run validate:lastmod-ledger-final

# Stamped LAST, after every write this script makes. A later call may skip the
# loop only while nothing in the repository is newer than this file; see the
# re-entry test above for why the guard check alone could not carry that claim.
mkdir -p "$(dirname "$MARKER")"
: > "$MARKER"
