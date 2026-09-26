#!/usr/bin/env node
// The Saturday gate, pinned.
//
// Six Saturdays in a row (2026-08-08 .. 2026-09-19) the Twin Agent's weekly
// artifact landed on main by direct push and Validate Repo went red on it. The
// repair each week was to the intake - never to the state that let unvalidated
// content reach the deploy branch. Three things now hold that state closed, and
// this validator fails the moment any of them is loosened:
//
//   1. THE WRITER'S INSTRUCTIONS say branch + pull request, never main. A rule
//      written in prose governs nothing on its own, so the instruction document
//      is READ here: it must name the agent-drop/<date>-<scope> branch, tell the
//      writer to open a pull request, and carry the explicit "never push to
//      main" sentence. Removing or softening that sentence fails this check.
//
//   2. THE SENTINEL ACTS. main-validation-sentinel.yml must run
//      quarantine_raw_agent_drop.mjs --execute when the coverage verdict is red,
//      with the write scopes that action needs, and the script must keep its
//      refusals (merged PR, bot author) and route the removal through the single
//      writer helper. Its self-test must be a registered validator.
//
//   3. DEPLOY IS GATED ON THE COMMIT'S OWN SHA. deploy-distribution.yml runs only
//      on a green Validate Repo workflow_run for main and downloads the artifact
//      named after that run's head_sha; release:verify-attestation is handed the
//      same SHA. A bot commit therefore cannot reach the distribution deploy
//      without a green run on exactly itself. (The Cloudflare Pages git
//      integration is a separate channel this repository cannot gate from
//      inside; docs/runbooks/SATURDAY_AGENT_DROP_GATE.md records that as an
//      owner action.)
//
//   4. NO WORKFLOW HOLDS A PUSH CREDENTIAL OTHER THAN GITHUB_TOKEN. A personal
//      token in a checkout or a push URL would be a second writer identity that
//      bypasses the helper and raises no push event.
//
//   5. THE DROP HAS ONE ROAD TO MAIN (added 2026-09-26, the seventh red
//      Saturday: the writer pushed to main anyway, the quarantine's pull request
//      was refused to GITHUB_TOKEN, and a PR holding only the raw drop can never
//      go green). A drop pushed to main is inert until Spry Content Release -
//      the only lane that claims a READY run (BHPC_ABSORB_READY_RUNS) - absorbs
//      it; a drop pushed to a branch is absorbed by Spry Content Release,
//      which lays it onto main's tip (overlay_agent_drop.mjs) BEFORE the release
//      validates, so an artifact the intake refuses fails the lane before
//      anything is committed, and the drop lands in the same commit as the pages
//      it repairs. Agent Drop Intake classifies the branch before dispatching.
//      What a drop IS lives once, in agent_drop_contract.mjs.
//
// Every assertion is proved negatively on every run against a mutated copy of
// the real inputs before the real inputs are judged, so a check that has
// stopped being able to fail is itself a failure. Hard-fails on zero
// assertions.

import fs from 'node:fs';
import path from 'node:path';
import {BRANCH_PREFIX} from '../../.github/scripts/agent_drop_contract.mjs';

const ROOT = process.cwd();
const SENTINEL = '.github/workflows/main-validation-sentinel.yml';
const DEPLOY = '.github/workflows/deploy-distribution.yml';
const SCRIPT = '.github/scripts/quarantine_raw_agent_drop.mjs';
const SCRIPT_TEST = '.github/scripts/test_quarantine_raw_agent_drop.mjs';
const INTAKE = '.github/workflows/agent-drop-intake.yml';
const RELEASE = '.github/workflows/spry-content-release.yml';
const OVERLAY = '.github/scripts/overlay_agent_drop.mjs';
const CONTRACT = '.github/scripts/agent_drop_contract.mjs';
const DOC = 'docs/runbooks/TWIN_AGENT_BHPC_REPO_DROP_INSTRUCTIONS.md';
const WORKFLOW_DIR = '.github/workflows';
const NEVER_MAIN_SENTENCE = 'Never push to `main`';

const read = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
};

function assess(inputs) {
  const errors = [];
  let assertions = 0;
  const must = (condition, message) => { assertions += 1; if (!condition) errors.push(message); };
  const {sentinel, deploy, script, scriptTest, doc, pkg, matrix, workflows, intake, release, overlay} = inputs;

  // 1. the writer's instructions
  must(typeof doc === 'string' && doc.length > 0, `${DOC} is missing; the writer's instructions are the first gate and they cannot be read`);
  if (doc) {
    must(doc.includes(BRANCH_PREFIX), `${DOC} does not name the ${BRANCH_PREFIX}<date>-<scope> branch the writer must push to`);
    must(doc.includes('Agent Drop Intake') && doc.includes('Spry Content Release'), `${DOC} does not say the drop reaches main only through Agent Drop Intake and Spry Content Release`);
    must(/pull request/i.test(doc), `${DOC} does not tell the writer to open a pull request`);
    must(doc.includes(NEVER_MAIN_SENTENCE), `${DOC} has lost the sentence "${NEVER_MAIN_SENTENCE}"; the prohibition is the rule, not a preference`);
  }

  // 2. the sentinel acts
  must(typeof sentinel === 'string', `${SENTINEL} is missing`);
  if (sentinel) {
    must(sentinel.includes('quarantine_raw_agent_drop.mjs --execute'), `${SENTINEL} does not run quarantine_raw_agent_drop.mjs --execute; the sentinel is back to alarming without acting`);
    must(/if:\s*always\(\)\s*&&\s*steps\.coverage\.outputs\.state\s*==\s*'red'/.test(sentinel), `${SENTINEL} quarantine step is not gated on always() && steps.coverage.outputs.state == 'red'`);
    for (const scope of ['contents: write', 'pull-requests: write', 'actions: write']) {
      must(sentinel.includes(scope), `${SENTINEL} lacks "${scope}"; the quarantine cannot create the branch, open the pull request, or request validation without it`);
    }
    must(/HEAD_SHA:\s*\$\{\{\s*steps\.coverage\.outputs\.head_sha\s*\}\}/.test(sentinel), `${SENTINEL} does not hand the coverage verdict's head_sha to the quarantine; acting on any other SHA is acting on the wrong commit`);
  }
  must(typeof script === 'string', `${SCRIPT} is missing`);
  if (script) {
    must(script.includes('arrived_through_pull_request'), `${SCRIPT} no longer refuses a commit that arrived through a pull request; it would revert a human merge`);
    must(script.includes('bot_author'), `${SCRIPT} no longer refuses a github-actions[bot] commit; a helper-covered release would be reverted as if it were a raw drop`);
    must(script.includes('commit_and_push_if_changed.sh'), `${SCRIPT} no longer removes the drop through commit_and_push_if_changed.sh; a second main-writing path has appeared`);
    must(script.includes('refusing to overwrite'), `${SCRIPT} would overwrite an agent-drop branch that already carries other work`);
    must(script.includes("from './agent_drop_contract.mjs'") && script.includes('classifyDropFiles('), `${SCRIPT} decides what a drop is on its own instead of through ${CONTRACT}`);
    must(script.includes('agent-drop-intake.yml/dispatches'), `${SCRIPT} no longer dispatches Agent Drop Intake for the branch it preserves; the drop would sit on a branch nothing reads`);
  }
  must(typeof scriptTest === 'string', `${SCRIPT_TEST} is missing; the quarantine's refusals are unproven`);
  const testScript = pkg?.scripts?.['validate:raw-agent-drop-quarantine'] || '';
  must(testScript.includes('test_quarantine_raw_agent_drop.mjs'), 'package.json: validate:raw-agent-drop-quarantine does not run test_quarantine_raw_agent_drop.mjs');
  must((matrix?.entries || []).some((e) => e.command === 'npm run validate:raw-agent-drop-quarantine' && e.status === 'ADMITTED'), '_repo_validation_matrix.json: validate:raw-agent-drop-quarantine is not an ADMITTED matrix entry, so the quarantine self-test never runs in CI');

  // 5. one road to main
  must(typeof intake === 'string', `${INTAKE} is missing; a pushed drop branch reaches nothing`);
  if (intake) {
    must(/branches:\s*\n\s*-\s*"agent-drop\/\*\*"/.test(intake), `${INTAKE} does not trigger on pushes to agent-drop/**`);
    const classifyAt = intake.indexOf('overlay_agent_drop.mjs classify');
    const dispatchAt = intake.indexOf('gh workflow run spry-content-release.yml');
    must(classifyAt >= 0 && dispatchAt > classifyAt, `${INTAKE} does not classify the branch with overlay_agent_drop.mjs before dispatching the release; a branch that is not a drop could be carried toward main`);
    must(/-f drop_branch="\$DROP_BRANCH"/.test(intake) && intake.includes('-f mode=agent-intake'), `${INTAKE} does not dispatch Spry Content Release in agent-intake mode with drop_branch`);
  }
  must(typeof release === 'string', `${RELEASE} is missing`);
  if (release) {
    const syncAt = release.indexOf('git reset --hard origin/main');
    const overlayAt = release.indexOf('overlay_agent_drop.mjs overlay "$DROP_BRANCH"');
    const releaseAt = release.indexOf('- name: Run governed Spry content release');
    const commitAt = release.indexOf('- name: Commit validated Spry content release');
    must(syncAt >= 0 && overlayAt > syncAt && releaseAt > overlayAt && commitAt > releaseAt, `${RELEASE}: the drop must be laid onto main's tip after the sync and BEFORE the release validates it, and committed only after; a drop laid after validation would land unvalidated`);
    must(/export WORKFLOW_ARGV="node \.github\/scripts\/overlay_agent_drop\.mjs overlay '\$DROP_BRANCH' && \$WORKFLOW_ARGV"/.test(release), `${RELEASE}: the commit helper's replay does not re-lay the drop; a replay after a remote advance would publish without it`);
    const closeAt = release.indexOf('- name: Close the drop once it is on main');
    const closeBlock = closeAt >= 0 ? release.slice(closeAt, release.indexOf('- name:', closeAt + 10)) : '';
    must(closeBlock.includes('verify-landed') && closeBlock.indexOf('verify-landed') < closeBlock.indexOf('git/refs/heads/'), `${RELEASE}: the drop branch is deleted without first proving the drop is on main`);
    must(/if: failure\(\) && env\.DROP_BRANCH != ''/.test(release) && release.includes('NAMED STOP agent_drop_not_absorbed'), `${RELEASE}: a refused drop is not named on its pull request`);
  }
  must(typeof overlay === 'string' && overlay.includes("from './agent_drop_contract.mjs'") && overlay.includes('classifyDropFiles('), `${OVERLAY} is missing or decides what a drop is on its own instead of through ${CONTRACT}`);
  const overlayTest = pkg?.scripts?.['validate:agent-drop-overlay'] || '';
  must(overlayTest.includes('test_overlay_agent_drop.mjs'), 'package.json: validate:agent-drop-overlay does not run test_overlay_agent_drop.mjs');
  must((matrix?.entries || []).some((e) => e.command === 'npm run validate:agent-drop-overlay' && e.status === 'ADMITTED'), '_repo_validation_matrix.json: validate:agent-drop-overlay is not an ADMITTED matrix entry, so the overlay self-test never runs in CI');

  // 3. deploy is gated on the commit's own sha
  must(typeof deploy === 'string', `${DEPLOY} is missing`);
  if (deploy) {
    must(/github\.event\.workflow_run\.conclusion\s*==\s*'success'/.test(deploy), `${DEPLOY} no longer requires the Validate Repo workflow_run to have concluded success`);
    must(/github\.event\.workflow_run\.head_branch\s*==\s*'main'/.test(deploy), `${DEPLOY} no longer requires the validated run to be on main`);
    must(deploy.includes('spry-validated-${{ github.event.workflow_run.head_sha }}'), `${DEPLOY} does not download the artifact named after the validated run's own head_sha`);
    must(/EXPECTED_COMMIT_SHA:\s*\$\{\{\s*steps\.artifact\.outputs\.commit_sha\s*\}\}/.test(deploy), `${DEPLOY} does not hand release:verify-attestation the validated commit sha`);
    must(!/^\s*push:\s*$/m.test(deploy), `${DEPLOY} has a push trigger; a push deploys without any validation run at all`);
  }

  // 4. no push credential other than GITHUB_TOKEN
  must(Object.keys(workflows || {}).length > 0, `${WORKFLOW_DIR}: no workflow files examined (Rule 0)`);
  for (const [file, text] of Object.entries(workflows || {})) {
    must(!/actions\/checkout@[^\n]*\n(?:[^\n]*\n){0,6}?[^\n]*token:\s*\$\{\{\s*secrets\./.test(text), `${file}: checks out with a token from secrets; that identity can push to main outside the helper and raises no push event`);
    must(!/x-access-token:\$\{\{\s*secrets\./.test(text) && !/https:\/\/[^\s@]*\$\{\{\s*secrets\.[^}]*\}\}@github\.com/.test(text), `${file}: pushes with a credential from secrets embedded in a URL`);
  }

  return {errors, assertions};
}

function realInputs() {
  const workflows = {};
  const dir = path.join(ROOT, WORKFLOW_DIR);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) workflows[`${WORKFLOW_DIR}/${f}`] = read(`${WORKFLOW_DIR}/${f}`);
  let pkg = null, matrix = null;
  try { pkg = JSON.parse(read('package.json')); } catch { pkg = null; }
  try { matrix = JSON.parse(read('_repo_validation_matrix.json')); } catch { matrix = null; }
  return {sentinel: read(SENTINEL), deploy: read(DEPLOY), script: read(SCRIPT), scriptTest: read(SCRIPT_TEST), doc: read(DOC), pkg, matrix, workflows, intake: read(INTAKE), release: read(RELEASE), overlay: read(OVERLAY)};
}

// --- negative proof on every run --------------------------------------------
const real = realInputs();
const broken = [
  ['instructions lose "never push to main"', (i) => ({...i, doc: (i.doc || '').replace(NEVER_MAIN_SENTENCE, 'Push to main when convenient')}), NEVER_MAIN_SENTENCE],
  ['instructions lose the branch', (i) => ({...i, doc: (i.doc || '').replaceAll('agent-drop/', 'some-branch/')}), 'agent-drop/'],
  ['sentinel stops executing the quarantine', (i) => ({...i, sentinel: (i.sentinel || '').replaceAll('--execute', '')}), '--execute'],
  ['sentinel gate widened off red', (i) => ({...i, sentinel: (i.sentinel || '').replace("steps.coverage.outputs.state == 'red'", "steps.coverage.outputs.state != 'covered'")}), 'gated on'],
  ['sentinel loses contents: write', (i) => ({...i, sentinel: (i.sentinel || '').replace('contents: write', 'contents: read')}), 'contents: write'],
  ['quarantine forgets the pull-request refusal', (i) => ({...i, script: (i.script || '').replaceAll('arrived_through_pull_request', 'x')}), 'arrived through a pull request'],
  ['quarantine bypasses the helper', (i) => ({...i, script: (i.script || '').replaceAll('commit_and_push_if_changed.sh', 'git push origin HEAD:main')}), 'commit_and_push_if_changed.sh'],
  ['deploy drops the success condition', (i) => ({...i, deploy: (i.deploy || '').replace("github.event.workflow_run.conclusion == 'success' &&", '')}), 'concluded success'],
  ['deploy gains a push trigger', (i) => ({...i, deploy: (i.deploy || '').replace('on:\n', 'on:\n  push:\n')}), 'push trigger'],
  ['a workflow checks out with a PAT', (i) => ({...i, workflows: {...i.workflows, 'x.yml': 'steps:\n  - uses: actions/checkout@v7\n    with:\n      token: ${{ secrets.OWNER_PAT }}\n'}}), 'token from secrets'],
  ['instructions stop naming the one road', (i) => ({...i, doc: (i.doc || '').replaceAll('Agent Drop Intake', 'the owner')}), 'Agent Drop Intake and Spry Content Release'],
  ['quarantine keeps its own drop list', (i) => ({...i, script: (i.script || '').replace("from './agent_drop_contract.mjs'", "from './elsewhere.mjs'")}), 'decides what a drop is on its own'],
  ['quarantine goes back to opening a pull request', (i) => ({...i, script: (i.script || '').replace('agent-drop-intake.yml/dispatches', 'pulls')}), 'dispatches Agent Drop Intake'],
  ['intake workflow deleted', (i) => ({...i, intake: null}), `${INTAKE} is missing`],
  ['intake dispatches before classifying', (i) => ({...i, intake: (i.intake || '').replace('overlay_agent_drop.mjs classify', 'true')}), 'classify the branch'],
  ['release lays the drop after validating it', (i) => {
    const r = i.release || '';
    const block = r.slice(r.indexOf("      - name: Lay the agent drop onto main's tip"), r.indexOf('      - uses: actions/setup-node'));
    return {...i, release: r.replace(block, '').replace('      - name: Commit validated Spry content release', `${block}      - name: Commit validated Spry content release`)};
  }, 'BEFORE the release validates'],
  ['replay forgets the drop', (i) => ({...i, release: (i.release || '').replace("overlay_agent_drop.mjs overlay '$DROP_BRANCH' && $WORKFLOW_ARGV", '$WORKFLOW_ARGV')}), 're-lay the drop'],
  ['branch deleted without proof it landed', (i) => ({...i, release: (i.release || '').replace('node .github/scripts/overlay_agent_drop.mjs verify-landed "$DROP_BRANCH"', 'true')}), 'without first proving'],
  ['overlay self-test unregistered', (i) => ({...i, matrix: {entries: (i.matrix?.entries || []).filter((e) => e.command !== 'npm run validate:agent-drop-overlay')}}), 'overlay self-test never runs'],
  ['self-test unregistered', (i) => ({...i, matrix: {entries: (i.matrix?.entries || []).filter((e) => e.command !== 'npm run validate:raw-agent-drop-quarantine')}}), 'ADMITTED matrix entry'],
];
const proofFailures = [];
console.log('[agent-drop-gate] restoring each broken state and checking the failure returns');
for (const [name, mutate, expectedFragment] of broken) {
  const verdict = assess(mutate(real));
  const caught = verdict.errors.some((e) => e.includes(expectedFragment));
  console.log(`  ${caught ? 'ok  ' : 'FAIL'} ${name} -> ${caught ? 'FAIL returns' : 'not detected'}`);
  if (!caught) proofFailures.push(`${name}: expected an error containing "${expectedFragment}", got ${JSON.stringify(verdict.errors.slice(0, 3))}`);
}

const verdict = assess(real);
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: verdict.errors.length || proofFailures.length ? 'FAIL' : 'PASS', assertions: verdict.assertions, negative_proofs: broken.length, errors: verdict.errors, negative_proof_failures: proofFailures};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/agent-drop-gate.json'), `${JSON.stringify(report, null, 2)}\n`);

if (verdict.assertions === 0) { console.error('[agent-drop-gate] FAIL: zero assertions executed (Rule 0)'); process.exit(1); }
if (proofFailures.length) {
  console.error(`[agent-drop-gate] FAIL: ${proofFailures.length} negative proof(s) did not fail when broken; this validator can no longer catch what it claims to`);
  for (const f of proofFailures) console.error(`  - ${f}`);
  process.exit(1);
}
if (verdict.errors.length) {
  console.error(`[agent-drop-gate] FAIL: ${verdict.errors.length} of ${verdict.assertions} assertion(s)`);
  for (const e of verdict.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[agent-drop-gate] PASS: ${verdict.assertions} assertion(s), ${broken.length} negative proof(s); the writer's instructions say branch + pull request and never main, the sentinel quarantines a raw drop off a red main through the writer helper, the distribution deploy is gated on a green run for the commit's own sha, no workflow holds a push credential other than GITHUB_TOKEN, and a drop reaches main only through Agent Drop Intake -> Spry Content Release, laid onto main's tip before validation and committed with the pages it repairs.`);
