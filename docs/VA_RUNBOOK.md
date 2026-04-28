# VA Runbook

## What This Site Does

This site is a programmatic authority system designed to generate, validate, and maintain SEO/AEO/LLM visibility pages.

## Daily Check

1. Open GitHub Actions.
2. Confirm these workflows are green:
   - Validate
   - Execution Strict
   - Reddit Daily
   - Reddit Evening
3. If a workflow fails, copy the first red error block and send it to the owner.

## Do Not Do

- Do not manually edit generated HTML pages.
- Do not delete data files.
- Do not change validators.
- Do not change workflow files.
- Do not change conversion endpoint.
- Do not edit admin password logic.
- Do not commit .build, coverage, or reports unless specifically instructed.

## Safe Checks

Run:

git status --short

Then:

npm run validate:all

## If Validation Fails

Send:

- command run
- first error block
- git status --short
- file named in error

## If Push Is Rejected

Run only:

git pull --rebase origin main
git push origin main

If conflict appears, stop and ask owner.
