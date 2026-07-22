# SpryLabs HPC Tree Architecture

Status: Active transition contract  
Scope: Baseline tree architecture, validator alignment, and future page-generation boundary

## Decision

SpryLabs HPC is a source-first generated static publishing system. The repo root is not the long-term authoring surface.

The existing root-heavy shape is transitional compatibility. Public URLs must continue to work, but future page growth should enter through structured source records, programmatic lane contracts, renderers, and governed build workflows.

## Target Shape

```text
/
  README.md
  REPO_IDENTITY.md
  package.json
  package-lock.json
  .nvmrc
  .gitignore
  _headers
  _redirects

  config/
    contracts/
    manifests/
    tree/
    validation/

  content/
    insights/
    clusters/
    programmatic/

  data/
    admin/
    citation/
    citation_velocity/
    content/
    programmatic/
    signals/
    workflows/

  scripts/
    admin/
    content/
    programmatic/
    release/
    render/
    validation/
    validators/
    workflow/

  docs/
    architecture/
    runbooks/
    strategy/

  assets/
  functions/
  tests/
  fixtures/
```

## What This Phase Enforces

- Existing root HTML files are frozen as a legacy compatibility surface.
- Existing root JSON files are frozen as a legacy compatibility surface.
- Existing root route directories are frozen as a legacy compatibility surface.
- New pages must use source/data/programmatic lanes instead of adding more root files.
- Generated build/report debris stays out of baseline ZIPs.
- `coverage/` is generated reporting output, not a canonical public product route, and stays out of baseline ZIPs.

## What This Phase Does Not Do

- It does not move all existing root HTML pages.
- It does not restructure public URLs.
- It does not convert the full site into generated output.
- It does not remove transitional root authority JSON files that existing validators still read.

## Next Migration Phase

The next phase should migrate legacy root pages in batches. Each batch must prove:

- public URL parity;
- sitemap and canonical URL parity;
- redirect correctness;
- source record ownership;
- generated output determinism;
- no new root authoring files.
