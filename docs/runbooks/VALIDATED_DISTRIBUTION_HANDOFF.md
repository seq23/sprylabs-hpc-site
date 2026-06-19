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
