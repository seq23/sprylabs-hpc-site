#!/usr/bin/env python3
"""The one place that knows which workflows consume a green "Validate Repo" run.

Two components need that answer and must never disagree about it:

  * .github/scripts/handoff_validated_main_to_consumers.sh, at the end of a
    Validate Repo run that was started by workflow_dispatch, needs the list to
    dispatch - because a run created by a GITHUB_TOKEN dispatch raises no
    workflow_run event, so `workflow_run: workflows: ["Validate Repo"]` never
    fires for it (found 2026-09-18 and 2026-09-20: run 35544558796 validated
    ad7beb69f and Deploy Distribution never started; the pages were validated
    and never submitted to IndexNow).
  * scripts/validation/validate_workflow_run_handoff.py, the guard, needs the
    same list to assert every consumer is reachable on the dispatch path.

A hand-off that keeps its own list and a guard that keeps another is how a new
consumer gets added to one, not the other, and the guard keeps reporting clean.
So the list is DERIVED here from the workflow files themselves - a workflow is a
consumer because it says `workflow_run: workflows: [<producer>]`, not because
someone remembered to add it - and both callers run this one module.

    validate_repo_consumers.py plan --workflows-dir .github/workflows \
        --producer "Validate Repo" --sha <sha> --run-id <id> --out <file>

writes a JSON plan and exits 0 only when every consumer can be dispatched with
the inputs a Validate Repo run can supply. Any consumer it cannot dispatch is a
non-zero exit with the reason, because a consumer silently left out of the plan
is the exact defect this exists to close.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError as exc:  # pragma: no cover - the managed runtime pins PyYAML
    print(f"[validate-repo-consumers] FAIL: PyYAML is required ({exc})", file=sys.stderr)
    sys.exit(2)

# What a Validate Repo run can hand to a consumer. A consumer may declare any
# subset of these; a consumer that REQUIRES anything else cannot be dispatched
# from here and the plan refuses rather than dispatching it with holes.
SUPPLIED_INPUTS = ("artifact_name", "artifact_run_id", "commit_sha")


def load_workflow(path: Path) -> dict:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        raise ValueError(f"{path}: not a YAML mapping")
    return doc


def triggers_of(doc: dict) -> dict:
    # PyYAML resolves a bare `on` key to boolean True. Both spellings are read.
    raw = doc.get("on", doc.get(True))
    if raw is None:
        return {}
    if isinstance(raw, str):
        return {raw: None}
    if isinstance(raw, list):
        return {name: None for name in raw}
    if isinstance(raw, dict):
        return raw
    raise ValueError("unrecognised `on` shape")


def list_workflows(workflows_dir: Path) -> list[Path]:
    if not workflows_dir.is_dir():
        return []
    return sorted(p for p in workflows_dir.iterdir() if p.is_file() and p.suffix in (".yml", ".yaml"))


def build_plan(workflows_dir: Path, producer_name: str, sha: str, run_id: str) -> tuple[dict, list[str]]:
    errors: list[str] = []
    files = list_workflows(workflows_dir)
    if not files:
        errors.append(
            f"{workflows_dir}: contains no .yml/.yaml workflow files; a consumer plan over zero workflows "
            "proves nothing and dispatches nothing."
        )
        return {"producer": None, "consumers": []}, errors

    docs: dict[str, dict] = {}
    for path in files:
        try:
            docs[path.name] = load_workflow(path)
        except Exception as exc:  # noqa: BLE001 - every parse failure is reported, none swallowed
            errors.append(f"{path}: cannot parse ({exc})")
    if errors:
        return {"producer": None, "consumers": []}, errors

    producers = [name for name, doc in docs.items() if doc.get("name") == producer_name]
    if len(producers) != 1:
        errors.append(
            f"{workflows_dir}: expected exactly one workflow named {producer_name!r}, found {len(producers)} "
            f"({', '.join(producers) or 'none'})."
        )
        return {"producer": None, "consumers": []}, errors
    producer_file = producers[0]
    producer_triggers = triggers_of(docs[producer_file])
    producer = {
        "file": producer_file,
        "name": producer_name,
        "has_workflow_dispatch": "workflow_dispatch" in producer_triggers,
    }

    consumers = []
    for name, doc in docs.items():
        triggers = triggers_of(doc)
        wr = triggers.get("workflow_run")
        if not isinstance(wr, dict):
            continue
        watched = wr.get("workflows") or []
        if isinstance(watched, str):
            watched = [watched]
        if producer_name not in watched:
            continue
        declared = {}
        dispatch = triggers.get("workflow_dispatch")
        has_dispatch = "workflow_dispatch" in triggers
        if isinstance(dispatch, dict):
            for input_name, spec in (dispatch.get("inputs") or {}).items():
                spec = spec or {}
                declared[input_name] = {"required": bool(spec.get("required", False)), "default": spec.get("default")}
        supplied_values = {
            "artifact_name": f"spry-validated-{sha}",
            "artifact_run_id": str(run_id),
            "commit_sha": sha,
        }
        inputs = {k: supplied_values[k] for k in SUPPLIED_INPUTS if k in declared}
        consumer = {
            "file": name,
            "name": doc.get("name"),
            "has_workflow_dispatch": has_dispatch,
            "declared_inputs": declared,
            "inputs": inputs,
        }
        if not has_dispatch:
            errors.append(
                f"{name}: consumes {producer_name!r} via workflow_run but declares no workflow_dispatch trigger, "
                "so it is unreachable when the producer itself ran by dispatch (a GITHUB_TOKEN-dispatched run raises "
                "no workflow_run event). Add `workflow_dispatch:` to it."
            )
        unsupplied = sorted(k for k, spec in declared.items() if spec["required"] and k not in SUPPLIED_INPUTS)
        if unsupplied:
            errors.append(
                f"{name}: requires workflow_dispatch input(s) {', '.join(unsupplied)} that a Validate Repo run cannot "
                f"supply (it supplies only {', '.join(SUPPLIED_INPUTS)}). Make them optional or extend SUPPLIED_INPUTS "
                "in scripts/workflow/validate_repo_consumers.py together with the hand-off script."
            )
        consumers.append(consumer)

    if not consumers:
        errors.append(
            f"{workflows_dir}: no workflow consumes {producer_name!r} via workflow_run. Deploy Distribution and the "
            "Main Validation Sentinel are expected to; a consumer set of zero means nothing would be handed off and "
            "this plan must not report success."
        )
    return {"producer": producer, "consumers": consumers}, errors


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    plan = sub.add_parser("plan", help="derive the consumer dispatch plan")
    plan.add_argument("--workflows-dir", default=".github/workflows")
    plan.add_argument("--producer", default="Validate Repo")
    plan.add_argument("--sha", required=True)
    plan.add_argument("--run-id", required=True)
    plan.add_argument("--out", help="write the plan JSON here as well as to stdout")
    args = parser.parse_args(argv)

    result, errors = build_plan(Path(args.workflows_dir), args.producer, args.sha, args.run_id)
    result["status"] = "FAIL" if errors else "PASS"
    result["errors"] = errors
    text = json.dumps(result, indent=2) + "\n"
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    if errors:
        for err in errors:
            print(f"[validate-repo-consumers] FAIL: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
