#!/usr/bin/env python3
"""Every workflow_run consumer of "Validate Repo" must also be reachable when
Validate Repo itself ran by workflow_dispatch.

THE DEFECT THIS REFUSES. Deploy Distribution and Main Validation Sentinel are
triggered by `workflow_run: workflows: ["Validate Repo"]`. Every automated
writer pushes with GITHUB_TOKEN, which raises no push event, so
commit_and_push_if_changed.sh dispatches Validate Repo by workflow_dispatch -
and a run created that way raises no workflow_run event either. Reproduced
twice in the record: Validate Repo 35544558796 (dispatch, green, ad7beb69f,
2026-09-20 23:24Z) and 35446280764 (dispatch, green, a9b206f84, 2026-09-19)
chained nothing; every push-started run chained both consumers within nine
minutes. Every page the automation published was validated and never
submitted to IndexNow or Search Console. Nothing was red, because nothing ran.

The fix is a hand-off step at the end of Validate Repo's attesting job that
dispatches each consumer with the inputs it declares
(.github/scripts/handoff_validated_main_to_consumers.sh). This guard asserts
that the hand-off exists and can reach every consumer, by reading the workflow
files - not a document about them:

  1. the workflows directory is non-empty, exactly one workflow is named
     "Validate Repo", and it declares workflow_dispatch (the helper's only way
     to reach it);
  2. at least one workflow consumes "Validate Repo" via workflow_run, and each
     one declares workflow_dispatch and requires no input a Validate Repo run
     cannot supply (shared derivation: scripts/workflow/validate_repo_consumers.py,
     the same module the hand-off runs, so the two cannot keep different lists);
  3. the Validate Repo job that publishes spry-validated-${{ github.sha }} has a
     step invoking the hand-off script AFTER that upload, with no `if:` (the
     script names its own stops), no continue-on-error, GITHUB_TOKEN in its env,
     and `actions: write` in the job's permissions;
  4. the hand-off script exists, is executable, sources workflow_dispatch_lib.sh,
     calls request_workflow_run_for_sha, and runs the shared consumer module.

Rule 0: an empty workflows directory, a missing producer, or a consumer set of
zero is a hard failure, never a vacuous pass. The negative fixtures below are
exercised on every run before the real tree is judged, so the guard's failure
cases are proved rather than trusted.

    validate_workflow_run_handoff.py [--workflows-dir DIR] [--repo-root DIR] [--no-self-test]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(os.getcwd())
sys.path.insert(0, str(REPO_ROOT / "scripts" / "workflow"))

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    print(f"[validate:workflow-run-handoff] FAIL: PyYAML is required ({exc})", file=sys.stderr)
    sys.exit(2)

from validate_repo_consumers import SUPPLIED_INPUTS, build_plan, load_workflow  # noqa: E402

TAG = "[validate:workflow-run-handoff]"
PRODUCER = "Validate Repo"
HANDOFF_SCRIPT = ".github/scripts/handoff_validated_main_to_consumers.sh"
DISPATCH_LIB = ".github/scripts/workflow_dispatch_lib.sh"
CONSUMER_MODULE = "scripts/workflow/validate_repo_consumers.py"
ARTIFACT_NAME = "spry-validated-${{ github.sha }}"


def check(workflows_dir: Path, repo_root: Path) -> tuple[list[str], dict]:
    errors: list[str] = []
    plan, plan_errors = build_plan(workflows_dir, PRODUCER, "0" * 40, "0")
    errors.extend(plan_errors)
    producer = plan.get("producer")
    consumers = plan.get("consumers") or []
    report = {
        "workflows_dir": str(workflows_dir),
        "producer": producer,
        "consumers": [c["file"] for c in consumers],
        "supplied_inputs": list(SUPPLIED_INPUTS),
    }
    if producer is None:
        return errors, report
    if not producer["has_workflow_dispatch"]:
        errors.append(
            f"{producer['file']}: {PRODUCER!r} declares no workflow_dispatch trigger, which is the only way the "
            "push helper can reach it for a GITHUB_TOKEN push."
        )

    # 3. The attesting job hands off, after the artifact exists, with the scope to do it.
    producer_path = workflows_dir / producer["file"]
    doc = load_workflow(producer_path)
    jobs = doc.get("jobs") or {}
    attesting = [
        (job_id, job)
        for job_id, job in jobs.items()
        if any(str((step or {}).get("with", {}).get("name", "")) == ARTIFACT_NAME for step in (job.get("steps") or []))
    ]
    if len(attesting) != 1:
        errors.append(
            f"{producer['file']}: expected exactly one job to upload {ARTIFACT_NAME}, found {len(attesting)}; "
            "the hand-off must live in the job that publishes the validated artifact."
        )
        return errors, report
    job_id, job = attesting[0]
    report["attesting_job"] = job_id
    steps = job.get("steps") or []
    upload_index = next(
        i for i, step in enumerate(steps) if str((step or {}).get("with", {}).get("name", "")) == ARTIFACT_NAME
    )
    handoff_steps = [
        (i, step) for i, step in enumerate(steps) if HANDOFF_SCRIPT in str((step or {}).get("run", ""))
    ]
    if len(handoff_steps) != 1:
        errors.append(
            f"{producer['file']}: job {job_id!r} must have exactly one step whose run invokes {HANDOFF_SCRIPT}; "
            f"found {len(handoff_steps)}. Without it a dispatch-started Validate Repo run ends green and starts "
            "nothing downstream."
        )
        return errors, report
    handoff_index, handoff_step = handoff_steps[0]
    report["handoff_step"] = handoff_step.get("name")
    if handoff_index < upload_index:
        errors.append(
            f"{producer['file']}: job {job_id!r} invokes {HANDOFF_SCRIPT} at step {handoff_index} but uploads "
            f"{ARTIFACT_NAME} at step {upload_index}; consumers dispatched before the artifact exists download nothing."
        )
    if "if" in handoff_step:
        errors.append(
            f"{producer['file']}: the hand-off step carries `if: {handoff_step['if']}`; the script decides and names "
            "its own stops (push-started run, non-main ref), and a condition here is how the dispatch path gets "
            "excluded again without anything failing."
        )
    if handoff_step.get("continue-on-error"):
        errors.append(f"{producer['file']}: the hand-off step must not be continue-on-error; an unstarted consumer is a failed gate.")
    env = handoff_step.get("env") or {}
    if "GITHUB_TOKEN" not in env:
        errors.append(f"{producer['file']}: the hand-off step does not pass GITHUB_TOKEN in env; the dispatch would be unauthenticated.")
    perms = job.get("permissions")
    if not isinstance(perms, dict) or perms.get("actions") != "write":
        errors.append(
            f"{producer['file']}: job {job_id!r} does not declare `permissions: actions: write`; the workflow root is "
            "contents: read, so without a job-level grant the dispatch POST is refused with 403."
        )

    # 4. The script is real, executable, and built on the shared pieces.
    script_path = repo_root / HANDOFF_SCRIPT
    if not script_path.is_file():
        errors.append(f"{HANDOFF_SCRIPT}: missing.")
    else:
        if not script_path.stat().st_mode & stat.S_IXUSR:
            errors.append(f"{HANDOFF_SCRIPT}: not executable.")
        text = script_path.read_text(encoding="utf-8")
        code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
        if not re.search(r"^\. .*workflow_dispatch_lib\.sh\"?$", code, re.M):
            errors.append(f"{HANDOFF_SCRIPT}: does not source {DISPATCH_LIB}; a private copy of the dispatch loop is the drift this guard exists to stop.")
        if "request_workflow_run_for_sha" not in code:
            errors.append(f"{HANDOFF_SCRIPT}: never calls request_workflow_run_for_sha, so no consumer run is requested or confirmed.")
        if f"{CONSUMER_MODULE} plan" not in code:
            errors.append(f"{HANDOFF_SCRIPT}: does not derive its consumer set from {CONSUMER_MODULE}; it would be keeping its own list.")
    lib_path = repo_root / DISPATCH_LIB
    if not lib_path.is_file():
        errors.append(f"{DISPATCH_LIB}: missing.")
    else:
        lib = lib_path.read_text(encoding="utf-8")
        for needle in ("actions/workflows/${workflow_file}/dispatches", "actions/runs?head_sha="):
            if needle not in lib:
                errors.append(f"{DISPATCH_LIB}: no longer contains {needle!r}; requesting without confirming is the f7572445d race.")
    return errors, report


def self_test(workflows_dir: Path, repo_root: Path) -> tuple[list[str], int]:
    """Each fixture is a mutation of the real tree that MUST fail. A guard whose
    failure cases are not exercised is trusted, not proved. Returns the failures
    and the number of fixtures exercised."""
    failures: list[str] = []
    exercised = 0

    def expect_fail(label: str, wf_dir: Path, root: Path) -> None:
        nonlocal exercised
        exercised += 1
        errs, _ = check(wf_dir, root)
        if not errs:
            failures.append(f"self-test {label!r}: the guard passed a tree it must refuse")

    with tempfile.TemporaryDirectory() as tmp:
        empty = Path(tmp) / "empty"
        empty.mkdir()
        expect_fail("empty workflows directory", empty, repo_root)

        def mutated(label: str, mutate) -> None:
            dst = Path(tmp) / re.sub(r"[^a-z0-9]+", "-", label.lower())
            shutil.copytree(workflows_dir, dst)
            mutate(dst)
            expect_fail(label, dst, repo_root)

        def drop_handoff_step(dst: Path) -> None:
            p = dst / "validate-repo.yml"
            doc = load_workflow(p)
            for job in doc["jobs"].values():
                job["steps"] = [s for s in job.get("steps") or [] if HANDOFF_SCRIPT not in str((s or {}).get("run", ""))]
            p.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")

        def drop_actions_write(dst: Path) -> None:
            p = dst / "validate-repo.yml"
            doc = load_workflow(p)
            for job in doc["jobs"].values():
                if isinstance(job.get("permissions"), dict):
                    job["permissions"].pop("actions", None)
            p.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")

        def drop_consumer_dispatch(dst: Path) -> None:
            p = dst / "deploy-distribution.yml"
            doc = load_workflow(p)
            triggers = doc.get("on", doc.get(True))
            triggers.pop("workflow_dispatch", None)
            p.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")

        def drop_all_consumers(dst: Path) -> None:
            for p in list(dst.iterdir()):
                if p.name != "validate-repo.yml":
                    p.unlink()

        def move_handoff_before_upload(dst: Path) -> None:
            p = dst / "validate-repo.yml"
            doc = load_workflow(p)
            for job in doc["jobs"].values():
                steps = job.get("steps") or []
                idx = [i for i, s in enumerate(steps) if HANDOFF_SCRIPT in str((s or {}).get("run", ""))]
                if idx:
                    step = steps.pop(idx[0])
                    steps.insert(0, step)
            p.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")

        mutated("hand-off step removed", drop_handoff_step)
        mutated("actions: write removed from the attesting job", drop_actions_write)
        mutated("consumer without workflow_dispatch", drop_consumer_dispatch)
        mutated("no consumers at all", drop_all_consumers)
        mutated("hand-off before the artifact upload", move_handoff_before_upload)

    return failures, exercised


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workflows-dir", default=".github/workflows")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--no-self-test", action="store_true", help="skip the negative fixtures (for pointing at a foreign tree)")
    args = parser.parse_args(argv)
    workflows_dir = Path(args.workflows_dir)
    repo_root = Path(args.repo_root)

    self_test_failures: list[str] = []
    fixtures = 0
    if not args.no_self_test:
        if not workflows_dir.is_dir():
            self_test_failures.append(f"self-test cannot run: {workflows_dir} is not a directory")
        else:
            self_test_failures, fixtures = self_test(workflows_dir, repo_root)
            if fixtures == 0:
                self_test_failures.append("self-test exercised zero fixtures; a guard whose failure cases were not run is not proved")

    errors, report = check(workflows_dir, repo_root)
    status = "FAIL" if (errors or self_test_failures) else "PASS"
    out_dir = repo_root / "artifacts" / "diagnostics" / os.environ.get("PROOF_RUN_ID", "container-current") / "validate-workflow-run-handoff"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary.json").write_text(
        json.dumps({"status": status, **report, "negative_fixtures_exercised": fixtures, "errors": errors, "self_test_failures": self_test_failures}, indent=2) + "\n",
        encoding="utf-8",
    )
    for failure in self_test_failures:
        print(f"{TAG} FAIL: {failure}", file=sys.stderr)
    for err in errors:
        print(f"{TAG} FAIL: {err}", file=sys.stderr)
    if status == "FAIL":
        print(f"{TAG} FAIL: {len(errors)} issue(s), {len(self_test_failures)} self-test failure(s)", file=sys.stderr)
        return 1
    print(
        f"{TAG} PASS: {len(report['consumers'])} workflow_run consumer(s) of {PRODUCER!r} "
        f"({', '.join(report['consumers'])}) are reachable from a dispatch-started run via {HANDOFF_SCRIPT} "
        f"in job {report.get('attesting_job')!r}; {fixtures} negative fixture(s) refused"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
