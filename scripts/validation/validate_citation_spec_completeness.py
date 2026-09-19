#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate:citation-spec-completeness

Every page spec that reaches apply_citation_program.patch_priority() carries all
of h1/framework/type/definition/body, and a curated name-only entry is an OVERLAY
and never a spec.

THE FAILURE THIS REFUSES. Spry Content Release runs 35448607349, 35451641559 and
35452120100 (all post-#95) died with

    File "scripts/citation/apply_citation_program.py", line 626, in patch_priority
        h1.string=spec["h1"]
    KeyError: 'h1'

Three entries in data/citation/agent_page_specs.json (added in #79 on 2026-09-12)
carry only `framework` and `type` - the curated file is the NAME authority and is
designed to hold exactly that. apply_citation_program.py merged every source with
dict.update(), so those overlays were inserted as if they were whole specs. It
worked for a week only because agent_page_specs.generated.json carried complete
specs for the same three paths and `{**PRIORITY, **NEW_PAGES}` let the complete
one win. build_bhpc_agent_exact_implementation_plan.mjs emits new_pages for the
NEWEST run only; when the 2026-09-19 drop was absorbed the three left NEW_PAGES,
the overlays became the whole spec, and patch_priority raised from deep inside.

The loader now treats an incomplete curated entry as an overlay only, refuses an
incomplete GENERATED entry by name, proves every bucket spec complete after the
merge, and hard-fails on an empty spec set. This validator exercises THAT loader -
`load_page_specs()` imported from the real module, not a re-implementation - on
the real repo and on fixtures that reproduce the rotated state, the generator
defect, the inert entry and the empty set.

Hard-fails when it examines zero specs or records zero assertions.
"""
from __future__ import annotations
import json, subprocess, sys, tempfile
sys.dont_write_bytecode = True
from pathlib import Path

ROOT = Path.cwd()
CITATION_DIR = ROOT / "scripts/citation"
if str(CITATION_DIR) not in sys.path:
    sys.path.insert(0, str(CITATION_DIR))

TAG = "[validate:citation-spec-completeness]"
errors: list[str] = []
assertions = 0
specs_examined = 0


def check(cond: bool, message: str) -> None:
    global assertions
    assertions += 1
    if not cond:
        errors.append(message)


def expect_exit(fn, *needles: str, label: str) -> None:
    """The loader must refuse with SystemExit whose message names every needle."""
    try:
        fn()
    except SystemExit as exc:
        text = str(exc)
        for needle in needles:
            check(needle in text, f"{label}: refusal did not name {needle!r}; got: {text}")
        return
    except Exception as exc:  # noqa: BLE001 - a bare exception IS the defect
        check(False, f"{label}: raised {type(exc).__name__}: {exc} instead of a named SystemExit")
        return
    check(False, f"{label}: loader accepted the input instead of refusing it")


# ── 1. The real module, the real repo ─────────────────────────────────────────
# Importing runs load_page_specs(ROOT, PRIORITY, NEW_PAGES) against the committed
# data; a SystemExit here is the named failure surfacing exactly where it should.
try:
    import apply_citation_program as m
except SystemExit as exc:
    print(f"{TAG} FAIL: the real loader refused the committed spec set: {exc}", file=sys.stderr)
    sys.exit(1)

for required in ("load_page_specs", "missing_spec_keys", "require_complete_spec", "CURATED_OVERLAYS", "REQUIRED_SPEC_KEYS"):
    check(hasattr(m, required), f"apply_citation_program.py no longer exposes {required}; the loader this validator proves has been removed")
if errors:
    print(f"{TAG} FAIL:", file=sys.stderr)
    for e in errors:
        print(" - " + e, file=sys.stderr)
    sys.exit(1)

REQUIRED = tuple(m.REQUIRED_SPEC_KEYS)
check(set(REQUIRED) == {"h1", "framework", "type", "definition", "body"},
      f"REQUIRED_SPEC_KEYS is {REQUIRED}; patch_priority() reads exactly h1, framework, type, definition, body")

for label, bucket in (("PRIORITY", m.PRIORITY), ("NEW_PAGES", m.NEW_PAGES)):
    for path, spec in bucket.items():
        specs_examined += 1
        missing = m.missing_spec_keys(spec)
        check(not missing, f"{label}[{path}] would reach patch_priority missing {', '.join(missing)}")

curated_payload = json.loads((ROOT / "data/citation/agent_page_specs.json").read_text(encoding="utf-8"))
curated_partial = {}
curated_total = 0
for section in ("priority_pages", "new_pages"):
    for path, spec in (curated_payload.get(section) or {}).items():
        curated_total += 1
        if m.missing_spec_keys(spec):
            curated_partial[path] = spec
check(curated_total > 0, "data/citation/agent_page_specs.json describes no pages; the curation authority is empty")
check(set(m.CURATED_OVERLAYS) == set(curated_partial),
      f"CURATED_OVERLAYS {sorted(m.CURATED_OVERLAYS)} != the curated file's partial entries {sorted(curated_partial)}")
for path, spec in curated_partial.items():
    for label, bucket in (("PRIORITY", m.PRIORITY), ("NEW_PAGES", m.NEW_PAGES)):
        held = bucket.get(path)
        if held is None:
            continue
        # A partial curated entry may only be in a bucket if a COMPLETE spec from
        # another source holds the path - and then the curated name must have won.
        check(held is not spec and not m.missing_spec_keys(held),
              f"{label}[{path}] holds the partial curated entry itself")
        for key in ("h1", "framework", "definition"):
            if str(spec.get(key) or "").strip():
                check(held.get(key) == spec[key],
                      f"{label}[{path}].{key} is {held.get(key)!r}; the curated authority says {spec[key]!r}")
    if path not in m.PRIORITY and path not in m.NEW_PAGES:
        check((ROOT / path).exists(),
              f"curated overlay {path} describes a page no complete spec holds AND no file exists at that path; it governs nothing")

# The named CLI path an operator runs: load, prove, print, write nothing.
cli = subprocess.run([sys.executable, str(CITATION_DIR / "apply_citation_program.py"), "--check-specs"],
                     cwd=ROOT, capture_output=True, text=True)
check(cli.returncode == 0 and "citation specs:" in cli.stdout,
      f"apply_citation_program.py --check-specs exited {cli.returncode}: {cli.stderr.strip()[-400:]}")

# ── 2. Fixtures: the rotated state, the generator defect, the inert entry, the empty set
COMPLETE = {"h1": "Curated Heading", "framework": "Curated Framework Name", "type": "concept",
            "definition": "A complete definition.", "body": "<h2>Body</h2><p>Text.</p>"}
GENERATED_RAW = {"h1": "raw query text", "framework": "raw query text", "type": "howto",
                 "definition": "generated definition", "body": "<h2>Generated</h2>"}
X = "insights/curated-name-only-page.html"
Y = "insights/newest-run-page.html"


def fixture_root(curated=None, generated=None, repair=None, html_report=None) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="citation-spec-fixture-"))
    d = tmp / "data/citation"
    d.mkdir(parents=True)
    for name, payload in (("agent_page_specs.json", curated), ("agent_page_specs.generated.json", generated),
                          ("agent_repair_specs.generated.json", repair), ("agent_html_report_page_specs.generated.json", html_report)):
        if payload is not None:
            (d / name).write_text(json.dumps(payload), encoding="utf-8")
    return tmp


# 2a. THE 2026-09-19 STATE: the curated file names X; the newest run's generated
# spec no longer carries X. Before the fix this was KeyError: 'h1' in patch_priority.
priority, new_pages = {}, {}
overlays = m.load_page_specs(
    fixture_root(curated={"priority_pages": {X: {"framework": "Curated Framework Name", "type": "concept"}}, "new_pages": {}},
                 generated={"new_pages": {Y: dict(GENERATED_RAW)}}),
    priority, new_pages)
check(X not in priority and X not in new_pages, "rotated state: the name-only curated entry entered a bucket as if it were a spec")
check(X in overlays and overlays[X].get("framework") == "Curated Framework Name", "rotated state: the name-only curated entry is not held as an overlay")
check(Y in new_pages and not m.missing_spec_keys(new_pages[Y]), "rotated state: the newest run's complete spec was not loaded")
specs_examined += len(priority) + len(new_pages)

# 2b. OVERLAY ON A COMPLETE GENERATED SPEC: the curated name wins, the generated body stays.
priority, new_pages = {}, {}
m.load_page_specs(
    fixture_root(curated={"priority_pages": {X: {"framework": "Curated Framework Name", "h1": "Curated Heading"}}, "new_pages": {}},
                 generated={"new_pages": {X: dict(GENERATED_RAW)}}),
    priority, new_pages)
check(X in new_pages, "overlay: the complete generated spec for the same path was dropped")
check(new_pages.get(X, {}).get("framework") == "Curated Framework Name" and new_pages.get(X, {}).get("h1") == "Curated Heading",
      f"overlay: curated framework/h1 did not win over the generated query: {new_pages.get(X)}")
check(new_pages.get(X, {}).get("body") == GENERATED_RAW["body"] and new_pages.get(X, {}).get("type") == "howto",
      "overlay: the generated body/type were not kept; the overlay may only contribute h1/framework/definition")
specs_examined += len(priority) + len(new_pages)

# 2c. A COMPLETE curated entry keeps today's behaviour: it is a spec.
priority, new_pages = {}, {}
m.load_page_specs(fixture_root(curated={"priority_pages": {X: dict(COMPLETE)}, "new_pages": {}}), priority, new_pages)
check(priority.get(X) == COMPLETE, "complete curated entry: was not loaded as a spec")
specs_examined += len(priority)

# 2d. A PARTIAL entry in a GENERATED file is a generator defect, refused by name.
partial_generated = {k: v for k, v in GENERATED_RAW.items() if k not in ("body", "definition")}
for label, kwargs in (("generated", {"generated": {"new_pages": {Y: partial_generated}}}),
                      ("repair", {"repair": {"priority_pages": {Y: partial_generated}}}),
                      ("html_report", {"html_report": {"new_pages": {Y: partial_generated}}})):
    expect_exit(lambda kw=kwargs: m.load_page_specs(fixture_root(curated={"priority_pages": {X: dict(COMPLETE)}, "new_pages": {}}, **kw), {}, {}),
                "citation spec incomplete", Y, "definition", "body", m.SPEC_SOURCE_LABELS[label],
                label=f"partial {label} spec")

# 2e. A curated entry that is neither a spec nor an overlay governs nothing: refused.
expect_exit(lambda: m.load_page_specs(fixture_root(curated={"priority_pages": {X: {"type": "concept"}}, "new_pages": {}},
                                                   generated={"new_pages": {Y: dict(GENERATED_RAW)}}), {}, {}),
            "citation spec inert", X, label="inert curated entry")

# 2f. ZERO SPECS IS A FAULT: no literals, no files.
expect_exit(lambda: m.load_page_specs(fixture_root(), {}, {}), "citation spec set is empty", label="empty spec set")
# ...and an overlay-only set is still zero specs.
expect_exit(lambda: m.load_page_specs(fixture_root(curated={"priority_pages": {X: {"framework": "Curated Framework Name"}}, "new_pages": {}}), {}, {}),
            "citation spec set is empty", label="overlay-only spec set")

# 2g. THE DOOR: patch_priority()/shell() refuse an incomplete spec by name before touching disk.
expect_exit(lambda: m.patch_priority("does-not-exist.html", {"h1": "Only a heading"}),
            "citation spec incomplete", "does-not-exist.html", "framework", "body", label="patch_priority door")
expect_exit(lambda: m.shell("does-not-exist.html", {"framework": "Only a name", "type": "concept"}),
            "citation spec incomplete", "does-not-exist.html", "h1", "definition", label="shell door")

# ── Rule 0 ────────────────────────────────────────────────────────────────────
check(specs_examined > 0, "examined zero specs")
if assertions == 0:
    errors.append("recorded zero assertions")

out = ROOT / "artifacts/diagnostics/container-current/validate-citation-spec-completeness"
out.mkdir(parents=True, exist_ok=True)
status = "FAIL" if errors else "PASS"
(out / "summary.json").write_text(json.dumps({
    "status": status, "assertions": assertions, "specs_examined": specs_examined,
    "priority_specs": len(m.PRIORITY), "new_page_specs": len(m.NEW_PAGES),
    "curated_overlays": sorted(m.CURATED_OVERLAYS), "errors": errors}, indent=2) + "\n", encoding="utf-8")

if errors:
    print(f"{TAG} FAIL: {len(errors)} issue(s) across {assertions} assertions, {specs_examined} specs", file=sys.stderr)
    for e in errors:
        print(" - " + e, file=sys.stderr)
    sys.exit(1)
print(f"{TAG} OK: {assertions} assertions, {specs_examined} specs examined "
      f"({len(m.PRIORITY)} priority + {len(m.NEW_PAGES)} new in the repo, {len(m.CURATED_OVERLAYS)} curated overlay(s)); "
      "rotated state, overlay precedence, generator defect, inert entry, empty set and the patch_priority door all proved")
