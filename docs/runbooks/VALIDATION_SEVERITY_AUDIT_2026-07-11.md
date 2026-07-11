# Validation Severity Audit — 2026-07-11

## Scope

Audited the admitted validation and release command system for conditions that were incorrectly blocking releases despite representing governance drift, quality debt, stale receipts, or coverage gaps rather than broken runtime behavior.

## Severity law

### Hard fail

Reserved for:

- malformed or unreadable required artifacts;
- missing active public files;
- unsafe claims or secret exposure;
- unresolved templates or broken page structure;
- invalid canonical, schema, routing, or deployment contracts;
- duplicate paths or malformed ownership records;
- unauthorized writes outside an allowed mutation scope;
- live agent records missing from deployed HTML.

### Strong warning

Used for:

- protected baseline hash drift when files still exist and ownership structure remains valid;
- missing or stale page-admission registration;
- duplicate descriptive query labels;
- multiple query records mapped to an existing page;
- normalized query/framework collisions;
- warning counts, blocked-but-accounted records, and quality-only semantic gaps;
- citation coverage gaps in llms.txt or answers.json when the public page remains valid.

## Changes made

1. `validate:ownership`
   - Protected hash drift now emits `PASS_WITH_STRONG_WARNING` and exit code 0.
   - Missing protected files, duplicate owners, and unprotected paid-agent routes remain hard failures.

2. `validate:programmatic-registry`
   - Missing admission registration, stale records, duplicate query labels, and multi-owner query labels now warn.
   - Missing active files, malformed records, duplicate paths, unknown lanes, and invalid admission states remain hard failures.

3. `validate:citation-contract`
   - Normalized query collisions, registry collisions, multi-mapping, missing registry coverage, and distribution coverage gaps now warn.
   - Missing files, malformed schema, broken extraction structures, invalid definitions, and unsafe content remain hard failures.

4. `release:attest`
   - Warnings and accounted blocked records now produce `PASS_WITH_STRONG_WARNING` and exit code 0.
   - Actual report errors and invalid JSON remain hard failures.

5. `validate:browser-structural`
   - Missing semantic direct-answer blocks now warn.
   - Missing HTML/main structure and unresolved templates remain hard failures.

6. `release:prepush:container`
   - Final status wording now states that no blocking errors remain while strong warnings stay visible.

## Verified warning cases

- Protected hash mismatch: warning, exit 0.
- Two active pages missing admission registration: warning, exit 0.
- Duplicate normalized query ownership: warning, exit 0.
- Multi-mapped query page: warning, exit 0.
- Release attestation warnings: warning status, exit 0.

## Preserved blocking behavior

No safety, runtime integrity, live deployment, canonical, schema, missing-file, secret, or write-scope hard gate was removed.
