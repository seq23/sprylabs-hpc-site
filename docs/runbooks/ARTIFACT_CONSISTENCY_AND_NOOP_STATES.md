# Artifact Consistency and No-Op States

Canonical rule: no output is not automatically failure. Valid terminal states include COMPLETED_NO_INPUT, COMPLETED_NO_CHANGES, and COMPLETED_ALL_SKIPPED. Canonical machine-readable artifacts outrank optional reports. Every count must reconcile, protected-lane skips must continue unrelated work, and packaged ZIP validation must use the artifact class registry.

Run: `npm run validate:artifact-hardening-suite`.
