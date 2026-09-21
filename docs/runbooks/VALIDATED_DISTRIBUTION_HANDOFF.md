# Validated Distribution Handoff

## Authority

The Validate workflow is the sole producer of a deployable distribution artifact. Deploy Distribution consumes the artifact tied to the exact successful Validate run and does not independently rebuild the site.

## Validate workflow

1. Check out the exact commit.
2. Install dependencies with Node 24.
3. Run `npm run release:ci-validate`.
4. The CI profile runs canonical prepush, warnings, a second-build idempotence check, and attestation creation.
5. Upload `.build/` and `reports/validation-attestation.json` as `sprylabs-hpc-validated-<commit-sha>`.

## Deploy Distribution workflow

For a successful Validate run on `main`:

1. Check out the validated SHA.
2. Download the exact artifact from the triggering workflow run.
3. Verify the attestation commit SHA and every `.build` file hash.
4. Submit IndexNow priority and batch lists.
5. Upload the submission report.

Manual dispatch runs the complete CI validation profile before deployment. An unvalidated SHA cannot be distributed.

## Attestation fields

- commit SHA;
- source fingerprint;
- distribution build fingerprint;
- per-file distribution hashes;
- governed page count;
- admission record count;
- accepted/rejected candidate counts;
- actionable warning count;
- validation status.

## Hand-off when Validate Repo was dispatched, not pushed

Deploy Distribution and Main Validation Sentinel are `workflow_run` consumers of Validate Repo. The platform raises `workflow_run` for a push-started run and for a person's `workflow_dispatch`, and does not raise it for a run created by a `GITHUB_TOKEN` dispatch, which is how every automated writer reaches Validate Repo (`.github/scripts/commit_and_push_if_changed.sh`). Found 2026-09-18 and 2026-09-20: Validate Repo 35544558796 validated ad7beb69f and started nothing; every automated release was validated and never submitted.

The last step of the `gate` job runs `.github/scripts/handoff_validated_main_to_consumers.sh`, which on a `GITHUB_TOKEN`-dispatched run on `main` dispatches each consumer with `artifact_name`, `artifact_run_id` and `commit_sha` and confirms a run exists by exact `head_sha`. The consumer set is derived from the workflow files by `scripts/workflow/validate_repo_consumers.py`; nothing keeps a list. `npm run validate:workflow-run-handoff` reads the workflow tree and fails when the step, its permissions, or any consumer's `workflow_dispatch` reachability is missing; `npm run validate:validated-main-handoff-gate` exercises the script against a stubbed API.

