#!/usr/bin/env node
/**
 * Run a validation profile, repair what is repairable, re-validate, and loop
 * until clean or the attempt budget runs out.
 *
 * The profile already front-loads repairs before the validators, which fixes
 * the common cases on the way through. What it could not do is react to a
 * validator that fails AFTER those repairs have run. This closes that loop.
 *
 * It reads artifacts/validation/profile-<name>.json, which now lists every
 * failing step rather than only the first, so one pass is enough to decide what
 * to repair.
 *
 * The pairing rule is narrow on purpose: a repair is declared only when it
 * writes the artifact the check reads. A repair that merely sounds related
 * would produce motion without fixing the defect, and make the loop look like
 * it had tried something.
 *
 * A loop cannot fix every class of failure, and pretending otherwise is worse
 * than stopping. When two subsystems disagree about what is correct - as when
 * the owner-uniqueness repair renamed a page's query and the agent-recommendation
 * contract still pinned the old one - re-running the repair reproduces the same
 * result forever. Those need a human to decide which side is right, so the loop
 * stops and says so instead of burning attempts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PROFILE = process.argv.find((a) => a.startsWith('--profile='))?.split('=')[1] ?? 'container-prepush';
const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 3);
const DRY = process.argv.includes('--dry-run');
const REPORT = path.join(ROOT, 'reports/validation/self-heal-loop.json');

// step id -> repair command. Only where the repair writes what the check reads.
const REPAIRS = {
  'validate:citation-contract': { command: 'npm run repair:citation-contract-surfaces',
    why: 'repair_active_citation_contract.py and its siblings are the only writers of the citation contract surfaces this check reads.' },
  'validate:programmatic-registry': { command: 'npm run repair:programmatic-registry-owners',
    why: 'repair_programmatic_registry_owners.mjs is the sole writer of the admission/query registry rows this check validates.' },
  'VAL-QUERY-OWNER-UNIQUENESS': { command: 'npm run repair:programmatic-registry-owners',
    why: 'Duplicate query ownership is exactly what this repair resolves, by renaming the losing page.' },
  'VAL-VISIBLE-CONTENT-ARTIFACTS': { command: 'npm run repair:visible-content-artifacts',
    why: 'The repair strips the visible artifacts this check reports.' },
  'VAL-EXTRACTION-SURFACE-GUARD-CHECK': { command: 'npm run repair:extraction-final-state',
    why: 'The extraction final-state repair writes the surface state this guard compares against.' },
  'VAL-EXTRACTION-CONTRACT-SELF-TEST': { command: 'npm run repair:extraction-contracts',
    why: 'repair_extraction_contracts.py is the only writer of the extraction contracts under test.' },
  'VAL-FULL-PAGE-AUDIT': { command: 'npm run agent:bhpc:plan-exact && npm run agent:bhpc:apply-exact',
    why: 'The page-seo contract inside this audit fails on record markers and required headings that the agent acceptance manifest expects; plan-exact/apply-exact are what write them. Proven: a page carrying 24 such failures went to 0 after one apply.' },
  'VAL-BHPC-PAGE-SEO': { command: 'npm run agent:bhpc:plan-exact && npm run agent:bhpc:apply-exact',
    why: 'Same contract, incremental mode - same writer.' },
  'validate:ui-test-parity': { command: 'npm run repair:citation-contract-surfaces',
    why: 'repair_ui_test_parity.py runs inside this chain and writes the parity manifest the check reads.' },
};

// Deliberately unpaired, recorded so the omissions stay auditable:
// validate:repo, validate:validation-registry, validate:workflow-* and the
// orchestration/python-runtime checks describe repository and toolchain state -
// repairing them would mean asserting a configuration nobody chose.
// validate:agent-run, agent:bhpc:* and VAL-SEARCH-INTELLIGENCE measure
// externally produced runs; generating their inputs would be fabrication.
// validate:content-pattern, VAL-BHPC-PAGE-SEO and validate:claim-safety need
// words written into pages, which is an editorial decision, not a repair.

const run = (command) => spawnSync('sh', ['-c', command], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' }).status ?? 1;

const readFailures = () => {
  const p = path.join(ROOT, `artifacts/validation/profile-${PROFILE}.json`);
  if (!fs.existsSync(p)) return null;
  const receipt = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (receipt.steps || []).filter((s) => s.exit_code !== 0).map((s) => s.id || s.command);
};

const attempts = [];
let failed = [];

for (let attempt = 0; attempt <= MAX; attempt += 1) {
  run(`npm run validate:profile -- ${PROFILE}`);
  failed = readFailures() ?? [];
  console.log(`self-heal: attempt ${attempt} - ${failed.length} failing step(s)${failed.length ? `: ${failed.join(', ')}` : ''}`);
  if (!failed.length || attempt === MAX) break;

  const actions = [];
  const alreadyRun = new Set();
  for (const step of failed) {
    const repair = REPAIRS[step];
    if (!repair) { actions.push({ step, action: 'no declared repair', ran: false }); continue; }
    if (alreadyRun.has(repair.command)) { actions.push({ step, action: repair.command, ran: false, skipped: 'already run this attempt' }); continue; }
    if (DRY) { actions.push({ step, action: repair.command, ran: false, skipped: 'dry-run' }); continue; }
    alreadyRun.add(repair.command);
    const code = run(repair.command);
    actions.push({ step, action: repair.command, ran: true, repair_exit: code, why: repair.why });
  }
  attempts.push({ attempt: attempt + 1, failed_before: failed, actions });
  if (!actions.some((a) => a.ran)) {
    console.log('self-heal: nothing repairable - these need a decision, not another attempt');
    break;
  }
}

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  profile: PROFILE,
  mode: DRY ? 'dry-run' : 'repair',
  max_attempts: MAX,
  status: failed.length ? 'UNRESOLVED' : 'CLEAN',
  unresolved: failed,
  attempts,
}, null, 2)}\n`);

console.log(`self-heal: ${failed.length ? `UNRESOLVED (${failed.join(', ')})` : 'CLEAN'} - report at ${path.relative(ROOT, REPORT)}`);
process.exit(failed.length ? 1 : 0);
