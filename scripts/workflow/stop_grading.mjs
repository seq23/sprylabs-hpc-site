/**
 * The single writer of "is this zero a legitimate stop, or did the stage exit 0
 * having done nothing?" for the workflow orchestration and the self-heal loop.
 *
 * Both directions of the governing rule have to hold at once:
 *
 *   - A lane with nothing legitimate to do must be GREEN and self-explaining -
 *     a named stop a human can read. Red must mean broken, or red stops
 *     carrying information.
 *   - Rule 0: no stage may exit 0 having done nothing. A lane that silently
 *     reports success on an empty set is the WORSE failure, because it looks
 *     healthy forever.
 *
 * The discrimination is evidence-based, never a default. A zero is allowed to be
 * green only when it carries strictly more evidence than a silent zero does: a
 * named stop code AND a human-readable message AND proof that the thing being
 * graded was actually examined. A reasonless zero, or a zero the grader could
 * not see, stays red.
 *
 * This lives in one module because the alternative - each consumer keeping its
 * own copy of the decision - is exactly the "two components each keeping their
 * own list with no link" defect. One decision, every caller.
 */

/**
 * Grade one pass of the self-heal loop.
 *
 * The loop reads artifacts/validation/profile-<name>.json to learn which steps
 * failed. Three no-work conditions were being graded as CLEAN:
 *
 *   1. The receipt does not exist. The profile command crashed before writing
 *      one (measured: `[validate:profile] INTERNAL_ERROR: unknown profile ...`),
 *      so the loop read null, coerced it to an empty failure list, and printed
 *      CLEAN with exit 0. The loop graded nothing and called it clean.
 *   2. The receipt exists but lists zero steps. A profile that executed no steps
 *      cannot have proved anything; an empty loop must not pass.
 *   3. The profile command exited non-zero while the receipt names no failing
 *      step. The two disagree, which also covers the stale-receipt case: a
 *      receipt left behind by an earlier run makes a crashed profile look clean.
 *
 * None of these are legitimate stops. There is no configuration under which the
 * self-heal loop is *supposed* to grade nothing - it is invoked precisely to
 * grade something - so each is a hard failure with a named code, not a stop.
 *
 * @param {{profileExit:number, receipt:object|null, profile:string}} input
 * @returns {{status:string, exitCode:number, stop:{code:string,message:string}|null, stepsExamined:number, failed:string[]}}
 */
export function gradeSelfHealOutcome({profileExit, receipt, profile = '(unknown)'} = {}) {
  if (receipt === null || receipt === undefined) {
    return {
      status: 'UNGRADED',
      exitCode: 1,
      stepsExamined: 0,
      failed: [],
      stop: {
        code: 'PROFILE_RECEIPT_MISSING',
        message: `The validation profile "${profile}" wrote no receipt at artifacts/validation/profile-${profile}.json (profile exit ${profileExit}). The self-heal loop had nothing to read, so it graded nothing. Reporting CLEAN here is a stage exiting 0 having done no work - the worst failure mode, because it looks healthy forever. Check that the profile name is correct and that validate:profile ran.`,
      },
    };
  }

  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  const failed = steps.filter(step => step.exit_code !== 0).map(step => step.id || step.command);

  if (steps.length === 0) {
    return {
      status: 'UNGRADED',
      exitCode: 1,
      stepsExamined: 0,
      failed: [],
      stop: {
        code: 'PROFILE_EXAMINED_ZERO_STEPS',
        message: `The validation profile "${profile}" wrote a receipt listing zero steps (profile exit ${profileExit}). A profile that executed nothing has proved nothing, and an empty loop must hard-fail rather than pass. Rule 0: no stage may exit 0 having done nothing.`,
      },
    };
  }

  if (profileExit !== 0 && failed.length === 0) {
    return {
      status: 'UNGRADED',
      exitCode: 1,
      stepsExamined: steps.length,
      failed: [],
      stop: {
        code: 'PROFILE_FAILED_WITHOUT_FAILING_STEP',
        message: `The validation profile "${profile}" exited ${profileExit} but its receipt names no failing step across ${steps.length} step(s). The command and the receipt disagree, which is also what a stale receipt from an earlier run looks like. The loop cannot grade a failure it cannot see, so this is red rather than CLEAN.`,
      },
    };
  }

  if (failed.length) {
    return {status: 'UNRESOLVED', exitCode: 1, stepsExamined: steps.length, failed, stop: null};
  }

  return {status: 'CLEAN', exitCode: 0, stepsExamined: steps.length, failed: [], stop: null};
}

/**
 * Grade the aggregate hostile review across every governed workflow.
 *
 * A workflow whose latest trace is missing is reviewed as SKIP. That is a real
 * and legitimate condition - a governed workflow that has not run yet has no
 * trace to review, and turning that red would make red meaningless. But the
 * aggregate counted SKIPs as neither pass nor fail and then printed
 * `PASS all governed workflows=N`, so a run that reviewed ZERO workflows
 * reported a clean pass. Measured: workflow_count=3, reviewed_count=0,
 * pass_count=0, status=PASS, exit 0.
 *
 * So both directions:
 *   - reviewed_count === 0 while workflows are declared -> hard fail. The review
 *     examined nothing; that is a broken scan, not a pass.
 *   - some reviewed, some skipped -> green, but the skips are NAMED in the
 *     status and printed, so a human sees which lanes went unreviewed instead of
 *     the skip being swallowed by a bare PASS.
 *
 * @param {{results:Array<{workflow_id:string,status:string}>, errors:string[]}} input
 * @returns {{status:string, exitCode:number, stop:{code:string,message:string}|null,
 *            workflowCount:number, reviewedCount:number, skippedCount:number, skipped:string[]}}
 */
export function gradeHostileAggregate({results = [], errors = []} = {}) {
  const REVIEWED = ['PASS', 'PASS_WITH_WARNING', 'FAIL', 'INTERNAL_ERROR'];
  const reviewed = results.filter(result => REVIEWED.includes(result.status));
  const skippedResults = results.filter(result => result.status === 'SKIP');
  const skipped = skippedResults.map(result => result.workflow_id);
  const base = {
    workflowCount: results.length,
    reviewedCount: reviewed.length,
    skippedCount: skipped.length,
    skipped,
  };

  if (errors.length) {
    return {...base, status: 'FAIL', exitCode: 1, stop: null};
  }

  if (results.length > 0 && reviewed.length === 0) {
    return {
      ...base,
      status: 'FAIL',
      exitCode: 1,
      stop: {
        code: 'HOSTILE_REVIEW_EXAMINED_ZERO_WORKFLOWS',
        message: `${results.length} governed workflow(s) are declared and none was reviewed; every one was skipped for a missing latest trace (${skipped.join(', ') || 'none named'}). A hostile review that examines nothing must not report PASS - that is a guard that cannot reach what it governs. Run the lanes so a trace exists under reports/workflows/<id>/latest.json, or remove the workflow from data/workflows/workflow_contracts.json.`,
      },
    };
  }

  if (results.length === 0) {
    return {
      ...base,
      status: 'FAIL',
      exitCode: 1,
      stop: {
        code: 'NO_GOVERNED_WORKFLOWS_DECLARED',
        message: 'data/workflows/workflow_contracts.json declares no governed workflows, so the hostile review had nothing to govern. An empty contract set is a configuration defect, not a pass.',
      },
    };
  }

  if (skipped.length) {
    return {
      ...base,
      status: 'PASS_WITH_UNREVIEWED_LANES',
      exitCode: 0,
      stop: {
        code: 'LANES_UNREVIEWED_NO_TRACE',
        message: `${reviewed.length} of ${results.length} governed workflow(s) were reviewed. Unreviewed for want of a latest trace: ${skipped.join(', ')}. This is a named stop, not a failure - a governed workflow that has not run has no trace to review - but it is reported so the gap stays visible rather than being absorbed into a bare PASS.`,
      },
    };
  }

  const warned = results.some(result => result.status === 'PASS_WITH_WARNING');
  return {...base, status: warned ? 'PASS_WITH_WARNING' : 'PASS', exitCode: 0, stop: null};
}

/**
 * Paired fixtures for both graders. Every legitimate stop is proved green AND
 * the corresponding silent-zero is proved red, so the guard cannot be satisfied
 * by a grader that simply says yes.
 */
export function stopGradingSelfTest() {
  const okStep = {id: 'validate:repo', exit_code: 0};
  const badStep = {id: 'validate:citation-contract', exit_code: 1};

  const cases = [
    // --- self-heal: the silent-zero conditions must be RED ---
    {name: 'self-heal: missing receipt is red, not CLEAN',
      actual: gradeSelfHealOutcome({profileExit: 1, receipt: null, profile: 'ghost'}),
      expect: {exitCode: 1, status: 'UNGRADED', stopCode: 'PROFILE_RECEIPT_MISSING'}},
    {name: 'self-heal: zero-step receipt is red',
      actual: gradeSelfHealOutcome({profileExit: 0, receipt: {steps: []}, profile: 'empty'}),
      expect: {exitCode: 1, status: 'UNGRADED', stopCode: 'PROFILE_EXAMINED_ZERO_STEPS'}},
    {name: 'self-heal: profile crashed but receipt names no failure is red',
      actual: gradeSelfHealOutcome({profileExit: 2, receipt: {steps: [okStep]}, profile: 'stale'}),
      expect: {exitCode: 1, status: 'UNGRADED', stopCode: 'PROFILE_FAILED_WITHOUT_FAILING_STEP'}},
    // --- self-heal: real outcomes must keep their existing grade ---
    {name: 'self-heal: genuinely clean run stays green',
      actual: gradeSelfHealOutcome({profileExit: 0, receipt: {steps: [okStep, okStep]}, profile: 'container-prepush'}),
      expect: {exitCode: 0, status: 'CLEAN', stopCode: null}},
    {name: 'self-heal: real failing step stays red',
      actual: gradeSelfHealOutcome({profileExit: 1, receipt: {steps: [okStep, badStep]}, profile: 'container-prepush'}),
      expect: {exitCode: 1, status: 'UNRESOLVED', stopCode: null}},

    // --- hostile review: examining nothing must be RED ---
    {name: 'hostile: every lane skipped is red',
      actual: gradeHostileAggregate({results: [
        {workflow_id: 'a', status: 'SKIP'},
        {workflow_id: 'b', status: 'SKIP'},
      ]}),
      expect: {exitCode: 1, status: 'FAIL', stopCode: 'HOSTILE_REVIEW_EXAMINED_ZERO_WORKFLOWS'}},
    {name: 'hostile: no declared workflows is red',
      actual: gradeHostileAggregate({results: []}),
      expect: {exitCode: 1, status: 'FAIL', stopCode: 'NO_GOVERNED_WORKFLOWS_DECLARED'}},
    // --- hostile review: a legitimate partial skip must be GREEN and named ---
    {name: 'hostile: some reviewed with a named skip is green and self-explaining',
      actual: gradeHostileAggregate({results: [
        {workflow_id: 'a', status: 'PASS'},
        {workflow_id: 'b', status: 'SKIP'},
      ]}),
      expect: {exitCode: 0, status: 'PASS_WITH_UNREVIEWED_LANES', stopCode: 'LANES_UNREVIEWED_NO_TRACE'}},
    {name: 'hostile: all reviewed and clean is a plain pass',
      actual: gradeHostileAggregate({results: [{workflow_id: 'a', status: 'PASS'}]}),
      expect: {exitCode: 0, status: 'PASS', stopCode: null}},
    {name: 'hostile: a real error stays red',
      actual: gradeHostileAggregate({results: [{workflow_id: 'a', status: 'FAIL'}], errors: ['a: broke']}),
      expect: {exitCode: 1, status: 'FAIL', stopCode: null}},
  ];

  const failures = [];
  for (const item of cases) {
    const stopCode = item.actual.stop?.code ?? null;
    if (item.actual.exitCode !== item.expect.exitCode) failures.push(`${item.name}: exitCode expected=${item.expect.exitCode} actual=${item.actual.exitCode}`);
    if (item.actual.status !== item.expect.status) failures.push(`${item.name}: status expected=${item.expect.status} actual=${item.actual.status}`);
    if (stopCode !== item.expect.stopCode) failures.push(`${item.name}: stop code expected=${item.expect.stopCode} actual=${stopCode}`);
    // A stop is acceptable only when it is named AND readable by a human.
    if (item.actual.stop && !String(item.actual.stop.message || '').trim()) failures.push(`${item.name}: stop ${stopCode} carries no message`);
  }
  return {fixtures: cases.length, failures};
}
