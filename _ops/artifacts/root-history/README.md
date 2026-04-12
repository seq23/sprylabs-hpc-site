# Root History Archive

This directory stores historical repo artifacts that were previously loose at the repository root.

Purpose:
- reduce root clutter
- preserve historical audit/change artifacts
- keep snapshot updater compatibility by leaving the public site tree unchanged

Current archive batch:
- `2026-04-12/legacy-root-files/`

Operator rule:
- new audit and phase-summary artifacts should land under `_ops/artifacts/` rather than the repo root unless a script contract explicitly requires a root path.
