# Hallmark Audit Runbook

Hallmark applies because this repository has hundreds of public browser routes. The current citation release changes content structure across the route system, so the first local application requires a full route-complete audit rather than a homepage screenshot.

## External authority

- Skill: `~/.agents/skills/hallmark/SKILL.md`
- Runner: `~/repo-tools/active/run_hallmark_audit.sh`
- References: `~/.agents/skills/hallmark/references/`
- Visual archive: `~/AI_REFERENCE_LIBRARIES/hallmark-reference.zip`

Read the skill, references, runner interface, and verify the archive before invocation.

## Required evidence

Use `data/routes/public_route_manifest.json`. Cover desktop and mobile, definitions, extraction blocks, tables, numbered steps, long-content pages, navigation, product anchors, overflow, focus states, and error surfaces. Store temporary evidence under `artifacts/diagnostics/` and durable evidence under `~/repo-validation-evidence/sprylabs-hpc-site/<run-id>/`.

## Release gate

Hallmark findings must be repaired in source and reflected in a replacement full baseline ZIP. A local-only CSS or HTML patch is invalid.
