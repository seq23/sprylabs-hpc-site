#!/usr/bin/env node
/**
 * Shard the container-prepush validation profile across CI runners.
 *
 * The shard map is DERIVED AT RUN TIME from _repo_validation_matrix.json, never
 * hard-coded. Any validator added to the profile is picked up on the next run;
 * any validator removed disappears. A static list would silently drop new
 * validators, which is exactly the coverage loss this is built to prevent.
 *
 * Step classification mirrors scripts/validation/validate_profile.mjs: a
 * "producer" writes the tree that everything after it reads, so producers run
 * once, in matrix order, in the build job. Everything else is a validator and is
 * distributed across shards.
 *
 * Subcommands:
 *   plan      --shards N       emit the shard matrix (JSON) + write the plan file
 *   producers                  run the ordered build steps, in matrix order
 *   run       --shard I --shards N   run one shard, write its receipt
 *   verify    --shards N       assert the union of the receipts equals everything
 *                              the profile declares; hard-fail otherwise
 *   calibrate                  re-derive the timings file from real receipts
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const PROFILE = process.env.SHARD_PROFILE || 'container-prepush';
const MATRIX_FILE = '_repo_validation_matrix.json';
const REGISTRY_FILE = '_validation_registry.json';
const TIMINGS_FILE = '.github/validation-shard-timings.json';
const ORDERING_FILE = '.github/validation-shard-ordering.json';
const PLAN_FILE = 'artifacts/validation/shard-plan.json';
const RECEIPT_DIR = 'artifacts/validation/shards';
// Drift is what silently un-balances the shards: a slow validator modelled as
// cheap is packed as if it were free, lands with twenty others, and that shard
// becomes the long pole. Wall clock degrades and every run is still green.
//
// But drift is measured from ONE sample on a shared runner, and runner variance
// is real - run 33396568111 recorded a 44.5s validator at 73.7s with nothing
// about it changed. Hard-failing the whole validation run on that would block
// merges on noise, and a gate people learn to re-run is not a gate. So the two
// cases are separated by what they actually mean:
//
//   A validator with NO timing entry that turns out to be expensive is the
//   silent-degradation case exactly - it was modelled at the declared default
//   and the packer had no way to know better. Unambiguous, actionable, and not
//   something noise produces. That hard-fails.
//
//   A validator with a measured timing that came in slower is usually variance.
//   It is reported on every run and recorded in the coverage artifact, and only
//   hard-fails when it is far enough out that no amount of noise explains it.
const DRIFT_REPORT_SECONDS = 20;
const UNTIMED_MUST_MEASURE_SECONDS = 30;
const DRIFT_HARD_FAIL_FACTOR = 2.5;
const DRIFT_HARD_FAIL_MARGIN = 30;

function die(message, details = []) {
  console.error(message);
  for (const line of details) console.error(`  - ${line}`);
  process.exit(1);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

// Same predicate as scripts/validation/validate_profile.mjs, widened in the only
// safe direction. That one tests `step.id || step.command`, so a mutating step
// with a VAL-shaped id (VAL-EXTRACTION-FINAL-NORMALIZATION runs
// repair:extraction-final-state; REPAIR-VISIBLE-CONTENT-ARTIFACTS is uppercase
// and never matched the lowercase pattern) reads as a validator. Serially that
// is harmless because order is preserved; sharded it is not - the repair would
// land in one shard and the validator that depends on it in another. So the
// pattern is tested against BOTH id and command, and `snapshot` is added: a step
// that writes a snapshot must precede the check that reads it. Widening only
// moves steps INTO the ordered build job, so it can never drop coverage.
//
// Narrowed in one direction too: a step whose command is `npm run validate:*`
// only ever asserts, so it cannot be a producer whatever its name contains.
// Without that, VAL-CITATION-REPAIR-REACH and VAL-BUILD-ALL-INTEGRITY were
// pulled into the build job purely because their names carry "repair" and
// "build", which also excluded them from the shard coverage count.
//
// `snapshot` overrides that narrowing. Writing a baseline IS producing, even
// when the command is spelled `validate:extraction-surface-guard:snapshot`:
// treating it as an assertion put the step that WRITES the baseline into a
// shard, which is how run 33394734639 failed. The write and the comparison
// against it are one operation split across two profile steps.
const PRODUCER_PATTERN = /\b(?:build|repair|bootstrap|python-runtime|normalization|apply-report-contract|snapshot)\b/i;
const ALWAYS_PRODUCES = /\bsnapshot\b/i;
const isProducer = (step) => {
  const text = `${step.id || ''} ${step.command || ''}`;
  if (ALWAYS_PRODUCES.test(text)) return true;
  if (/^npm run validate:/.test((step.command || '').trim())) return false;
  return PRODUCER_PATTERN.test(step.id || '') || PRODUCER_PATTERN.test(step.command || '');
};

/**
 * The family a step belongs to: its name with the role suffix removed, so
 * `...-SURFACE-GUARD-SNAPSHOT` and `...-SURFACE-GUARD-CHECK` share a family, as
 * do `validate:x:snapshot` and `validate:x:check`.
 *
 * Steps in one family are one operation the profile happens to spell as several
 * steps, and separating them is a CORRECTNESS question rather than a packing
 * one. The extraction surface guard is the worked example: its snapshot once ran
 * at step 44 and the check it fed at step 58, so the guard graded its own answer
 * sheet and could never fail. That was fixed by moving the pair before
 * build:all - and sharding would reintroduce it in a new form if the two landed
 * on different runners, because each shard unpacks its own copy of the tree.
 * The guard would report green while comparing a baseline it had just written.
 */
const ROLE_SUFFIX = /[-:_](snapshot|check|verify|baseline|self-test|apply|final)$/i;
const familyOf = (step) => String(step.id || '').replace(ROLE_SUFFIX, '').toLowerCase().replace(/[-:_]+/g, '-');
const hasRole = (step) => ROLE_SUFFIX.test(String(step.id || ''));

function resolveSteps() {
  const matrix = readJson(MATRIX_FILE);
  const seen = new Set();
  const steps = [];
  const add = (name, stack = []) => {
    if (stack.includes(name)) die(`[shards] INTERNAL_ERROR: profile cycle ${[...stack, name].join(' -> ')}`);
    const profile = matrix.profiles?.[name];
    if (!profile) die(`[shards] INTERNAL_ERROR: unknown profile ${name}`);
    for (const base of profile.extends || []) add(base, [...stack, name]);
    for (const step of profile.steps || []) {
      const key = step.id || step.command;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({id: key, command: step.command});
    }
  };
  add(PROFILE);
  if (!steps.length) die(`[shards] FAIL: profile ${PROFILE} declares zero steps`);
  return steps;
}

/**
 * Steps the matrix positions deliberately, which therefore cannot be hoisted
 * into a shard. Declared in a reviewed file with a stated reason per entry
 * rather than inferred, because "this validator is order-sensitive" is a fact
 * about the validator that no naming pattern can discover.
 *
 * This is NOT a validator list - the shardable set is still derived wholly from
 * the matrix at run time. It only moves a step from a shard into the ordered
 * build job, and `verify` reconciles both together against the full profile, so
 * an entry here can never remove anything from the run.
 */
function orderedExceptions(steps) {
  if (!fs.existsSync(ORDERING_FILE)) return new Set();
  const declared = readJson(ORDERING_FILE).ordered_steps || [];
  const known = new Set(steps.map((s) => s.id));
  const stale = declared.filter((d) => !known.has(d.id)).map((d) => d.id);
  if (stale.length) {
    die(`[shards] FAIL: ${ORDERING_FILE} pins step(s) the ${PROFILE} profile no longer declares, so the pin is silently doing nothing`, stale);
  }
  const missingReason = declared.filter((d) => !String(d.reason || '').trim()).map((d) => d.id);
  if (missingReason.length) {
    die(`[shards] FAIL: every entry in ${ORDERING_FILE} must carry a reason; an unexplained pin is indistinguishable from a mistake`, missingReason);
  }
  return new Set(declared.map((d) => d.id));
}

/**
 * The profile is a sequence, not two sets. Producers build the tree everything
 * after them reads, so they run in matrix order in the build job; validators are
 * free to run anywhere against the finished tree - unless the matrix positions
 * them deliberately, which is what `ordered` captures.
 */
function partition() {
  const steps = resolveSteps();
  const pinned = orderedExceptions(steps);

  // Families are kept whole. If any member of a family produces - or is pinned -
  // every member joins it in the ordered build job, because a consumer that runs
  // on a different runner than its producer is comparing against a baseline that
  // runner wrote itself. This is derived from the profile, not listed: a new
  // snapshot/check pair is picked up with no change here.
  const families = new Map();
  for (const s of steps) {
    if (!hasRole(s)) continue;
    const key = familyOf(s);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(s);
  }
  const mustOrder = new Set();
  for (const [, members] of families) {
    if (members.length < 2) continue;
    if (members.some((s) => isProducer(s) || pinned.has(s.id))) {
      for (const s of members) mustOrder.add(s.id);
    }
  }

  const inOrdered = (s) => isProducer(s) || pinned.has(s.id) || mustOrder.has(s.id);
  const ordered = steps.filter(inOrdered);
  const shardable = steps.filter((s) => !inOrdered(s));
  return {
    all: steps,
    // Matrix order is preserved: `ordered` is a filter of `steps`, never a sort.
    ordered,
    producers: ordered,
    pinned,
    shardable,
    validators: shardable,
    // Multi-member families among the shardable steps. These are packed as one
    // unit so LPT can never separate them, and asserted afterwards so a future
    // change to the packer cannot quietly start separating them again.
    units: (() => {
      const byFamily = new Map();
      for (const s of shardable) {
        const key = hasRole(s) ? familyOf(s) : `solo:${s.id}`;
        if (!byFamily.has(key)) byFamily.set(key, []);
        byFamily.get(key).push(s);
      }
      return [...byFamily.entries()].map(([key, members]) => ({key, members}));
    })(),
  };
}

/**
 * Per-validator modelled cost, plus the default applied to anything not measured.
 *
 * A missing timing used to mean a silent 1.0s. That is the failure the whole
 * coverage argument depends on NOT happening quietly: twenty validators landed
 * tonight with no entry, every one modelled as ~free, and the bin packer had no
 * way to know. The default is now DECLARED in the timings file, so choosing it is
 * a visible decision, and `plan` names every validator that falls back to it.
 */
function timings() {
  if (!fs.existsSync(TIMINGS_FILE)) {
    die(`[shards] FAIL: ${TIMINGS_FILE} is missing; every validator would be modelled as equal cost and the shards would not balance`);
  }
  const file = readJson(TIMINGS_FILE);
  const fallback = file.untimed_default_seconds;
  if (typeof fallback !== 'number' || !(fallback > 0)) {
    die(`[shards] FAIL: ${TIMINGS_FILE} must declare a positive "untimed_default_seconds"; without a documented default a validator with no timing entry is silently modelled as free`);
  }
  return {seconds: file.seconds || {}, fallback};
}

/**
 * Every validator the matrix declares must have a measured timing, or be
 * explicitly modelled by the declared default. Returns the untimed ones so the
 * caller can name them rather than absorbing them.
 */
function timingCoverage() {
  const {validators} = partition();
  const {seconds, fallback} = timings();
  const untimed = validators.filter((s) => typeof seconds[s.id] !== 'number').map((s) => s.id);
  const known = new Set(partition().all.map((s) => s.id));
  const stale = Object.keys(seconds).filter((id) => !known.has(id));
  return {untimed, stale, fallback, total: validators.length};
}

/**
 * Longest-processing-time-first bin packing. An alphabetical split would pile
 * the slow validators into one shard and barely move wall clock; LPT keeps the
 * heaviest shard close to total/N.
 */
function planShards(count) {
  const {validators, units} = partition();
  if (count < 1) die('[shards] FAIL: --shards must be >= 1');
  if (count > units.length) {
    die(`[shards] FAIL: ${count} shards requested but the profile offers only ${units.length} independently schedulable unit(s) (${validators.length} validator steps, with producer/consumer families packed together); an empty shard would exit 0 having done nothing`);
  }
  const {seconds: cost, fallback} = timings();
  const at = (id) => (typeof cost[id] === 'number' ? cost[id] : fallback);
  // Cost and ordering are per UNIT, so a family is placed as one indivisible item.
  const priced = units.map((u) => ({...u, seconds: u.members.reduce((t, s) => t + at(s.id), 0)}));
  const ordered = priced.sort((a, b) => (b.seconds - a.seconds) || a.key.localeCompare(b.key));
  const bins = Array.from({length: count}, (_, index) => ({shard: index, seconds: 0, steps: []}));
  for (const unit of ordered) {
    const bin = bins.reduce((lightest, b) => (b.seconds < lightest.seconds ? b : lightest), bins[0]);
    bin.steps.push(...unit.members);
    bin.seconds += unit.seconds;
  }
  for (const bin of bins) {
    // Rule 0: a shard that runs nothing must never exit 0.
    if (!bin.steps.length) die(`[shards] FAIL: shard ${bin.shard} was assigned zero validators`);
    bin.steps.sort((a, b) => a.id.localeCompare(b.id));
    bin.seconds = Math.round(bin.seconds * 10) / 10;
  }
  const assigned = new Set(bins.flatMap((b) => b.steps.map((s) => s.id)));
  const orphans = validators.filter((s) => !assigned.has(s.id)).map((s) => s.id);
  if (orphans.length) die('[shards] FAIL: profile validators assigned to no shard', orphans);

  // Asserted, not merely arranged. Packing by unit is what keeps a family
  // together; this is what makes a future change to the packer fail loudly
  // instead of silently separating a snapshot from the check that reads it.
  const shardOf = new Map();
  for (const bin of bins) for (const s of bin.steps) shardOf.set(s.id, bin.shard);
  const split = [];
  const grouped = new Map();
  for (const [id, shard] of shardOf) {
    const step = validators.find((s) => s.id === id);
    if (!hasRole(step)) continue;
    const key = familyOf(step);
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key).set(id, shard);
  }
  for (const [key, members] of grouped) {
    const shards = new Set(members.values());
    if (shards.size > 1) {
      split.push(`${key}: ${[...members].map(([id, sh]) => `${id} -> shard ${sh}`).join(', ')}`);
    }
  }
  if (split.length) {
    die('[shards] FAIL: a producer/consumer family was split across shards. Each shard unpacks its own copy of the tree, so a check separated from the snapshot it reads would compare against a baseline it wrote itself and could never fail', split);
  }
  return bins;
}

function writePlan(bins) {
  const {all, producers, validators} = partition();
  fs.mkdirSync(path.dirname(PLAN_FILE), {recursive: true});
  const plan = {
    profile: PROFILE,
    generated_at: new Date().toISOString(),
    shard_count: bins.length,
    profile_step_count: all.length,
    producer_count: producers.length,
    declared_validator_count: validators.length,
    declared_validator_ids: validators.map((s) => s.id).sort(),
    ordered_step_ids: partition().ordered.map((s) => s.id),
    // Recorded so `verify` can compare what was modelled against what actually
    // happened, and so a plan artifact is self-describing after the fact.
    timing_coverage: (() => {
      const c = timingCoverage();
      return {
        measured: c.total - c.untimed.length,
        untimed: c.untimed.length,
        untimed_ids: c.untimed,
        untimed_default_seconds: c.fallback,
        stale_timing_ids: c.stale,
      };
    })(),
    modelled_seconds: Object.fromEntries(bins.flatMap((b) => b.steps.map((s) => [s.id, timings().seconds[s.id] ?? timings().fallback]))),
    shards: bins,
  };
  fs.writeFileSync(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function runCommands(steps, label) {
  const results = [];
  for (const step of steps) {
    console.log(`[shards:${label}] ${step.id}`);
    const started = Date.now();
    const r = spawnSync(step.command, {shell: true, stdio: 'inherit', env: process.env});
    const code = r.status ?? 2;
    results.push({id: step.id, command: step.command, exit_code: code, seconds: Math.round((Date.now() - started) / 100) / 10});
    if (code !== 0 && label === 'producers') {
      // Producers make the tree the validators read; a broken tree makes every
      // later result noise, so stop here exactly as validate:profile does.
      console.error(`[shards:producers] stopping: ${step.id} produces the tree later steps read`);
      break;
    }
  }
  return results;
}

function summarize(results) {
  return results.filter((r) => r.exit_code !== 0).map((r) => r.id);
}

const command = process.argv[2];

if (command === 'plan') {
  const count = Number(arg('shards', '8'));
  const bins = planShards(count);
  const plan = writePlan(bins);
  const emitted = bins.map((b) => ({shard: b.shard, name: `shard-${b.shard}`, seconds: b.seconds, steps: b.steps.length}));
  console.log(`[shards:plan] profile=${PROFILE} steps=${plan.profile_step_count} producers=${plan.producer_count} validators=${plan.declared_validator_count} shards=${count} heaviest=${Math.max(...bins.map((b) => b.seconds))}s`);
  for (const bin of bins) console.log(`[shards:plan]   shard-${bin.shard}: ${bin.steps.length} validator(s), ${bin.seconds}s modelled`);
  // Name them. An untimed validator is modelled at the declared default, which
  // is a guess; leaving the guess anonymous is how the packing rotted last time.
  const cov = timingCoverage();
  console.log(`[shards:plan] timings: ${cov.total - cov.untimed.length}/${cov.total} validators measured, ${cov.untimed.length} at the declared ${cov.fallback}s default`);
  for (const id of cov.untimed) console.log(`[shards:plan]   UNTIMED ${id} -> modelled ${cov.fallback}s`);
  for (const id of cov.stale) console.log(`[shards:plan]   STALE timing for a step the profile no longer declares: ${id}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(emitted)}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `declared=${plan.declared_validator_count}\n`);
  }
  process.exit(0);
}

if (command === 'producers') {
  const {producers} = partition();
  if (!producers.length) die('[shards] FAIL: the profile declares zero producer steps; the build job would exit 0 having built nothing');
  const results = runCommands(producers, 'producers');
  fs.mkdirSync(path.dirname(PLAN_FILE), {recursive: true});
  fs.writeFileSync('artifacts/validation/shard-producers.json', `${JSON.stringify({profile: PROFILE, results}, null, 2)}\n`);
  const failed = summarize(results);
  if (failed.length) die(`[shards:producers] FAIL: ${failed.length} producer step(s) failed`, failed);
  console.log(`[shards:producers] OK: ${results.length} producer step(s)`);
  process.exit(0);
}

if (command === 'run') {
  const count = Number(arg('shards', '8'));
  const index = Number(arg('shard', '-1'));
  const bins = planShards(count);
  const bin = bins.find((b) => b.shard === index);
  if (!bin) die(`[shards:run] FAIL: shard ${index} is not in a ${count}-shard plan`);
  if (!bin.steps.length) die(`[shards:run] FAIL: shard ${index} has zero validators`);
  const results = runCommands(bin.steps, `run:${index}`);
  fs.mkdirSync(RECEIPT_DIR, {recursive: true});
  const receipt = {
    profile: PROFILE,
    shard: index,
    shard_count: count,
    executed_ids: results.map((r) => r.id).sort(),
    executed_count: results.length,
    failures: summarize(results),
    results,
  };
  fs.writeFileSync(path.join(RECEIPT_DIR, `shard-${index}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.failures.length) die(`[shards:run:${index}] FAIL: ${receipt.failures.length} failing validator(s)`, receipt.failures);
  console.log(`[shards:run:${index}] OK: ${results.length} validator(s) passed`);
  process.exit(0);
}

if (command === 'verify') {
  let driftReport = [];
  const count = Number(arg('shards', '8'));
  const {validators} = partition();
  const declared = validators.map((s) => s.id).sort();
  const errors = [];

  if (!fs.existsSync(RECEIPT_DIR)) die(`[shards:verify] FAIL: no shard receipts found under ${RECEIPT_DIR}`);
  const files = fs.readdirSync(RECEIPT_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) die(`[shards:verify] FAIL: ${RECEIPT_DIR} contains no shard receipts; the coverage check examined zero items`);
  if (files.length !== count) errors.push(`expected ${count} shard receipts, found ${files.length}: ${files.join(', ')}`);

  const executed = [];
  const seenShards = new Set();
  for (const file of files) {
    const receipt = readJson(path.join(RECEIPT_DIR, file));
    if (seenShards.has(receipt.shard)) errors.push(`duplicate receipt for shard ${receipt.shard}`);
    seenShards.add(receipt.shard);
    if (!receipt.executed_count) errors.push(`shard ${receipt.shard} executed zero validators`);
    if (receipt.failures?.length) errors.push(`shard ${receipt.shard} reported failures: ${receipt.failures.join(', ')}`);
    executed.push(...(receipt.executed_ids || []));
  }
  for (let i = 0; i < count; i += 1) if (!seenShards.has(i)) errors.push(`shard ${i} produced no receipt`);

  const executedSet = new Set(executed);
  if (executedSet.size !== executed.length) {
    const dupes = executed.filter((id, i) => executed.indexOf(id) !== i);
    errors.push(`validator executed by more than one shard: ${[...new Set(dupes)].join(', ')}`);
  }
  const missing = declared.filter((id) => !executedSet.has(id));
  const extra = [...executedSet].filter((id) => !declared.includes(id));
  if (missing.length) errors.push(`declared by ${MATRIX_FILE} but executed by no shard: ${missing.join(', ')}`);
  if (extra.length) errors.push(`executed but not declared by ${MATRIX_FILE}: ${extra.join(', ')}`);
  if (executedSet.size !== declared.length) {
    errors.push(`executed validator count ${executedSet.size} != declared validator count ${declared.length}`);
  }

  // Second, independent source of truth: every ADMITTED registry record whose
  // command the profile carries must have been executed. This catches a matrix
  // entry silently dropped from the profile, which the matrix-only check above
  // cannot see.
  const records = (readJson(REGISTRY_FILE).records || []).filter((r) => r.status === 'ADMITTED');
  const commandById = new Map(partition().all.map((s) => [s.id, s.command]));
  const executedCommands = new Set([...executedSet].map((id) => commandById.get(id)));
  const producerCommands = new Set(partition().producers.map((s) => s.command));
  const registryGap = records
    .filter((r) => (r.matrix_ids || []).length && typeof r.command === 'string')
    .filter((r) => commandById.has(r.validation_id) || [...commandById.values()].includes(r.command))
    .filter((r) => !executedCommands.has(r.command) && !producerCommands.has(r.command))
    .map((r) => `${r.validation_id} (${r.command})`);
  if (registryGap.length) errors.push(`ADMITTED registry records carried by the profile but not executed: ${registryGap.join(', ')}`);

  fs.writeFileSync('artifacts/validation/shard-coverage.json', `${JSON.stringify({
    profile: PROFILE,
    shard_count: count,
    declared_validator_count: declared.length,
    executed_validator_count: executedSet.size,
    declared_validator_ids: declared,
    executed_validator_ids: [...executedSet].sort(),
    registry_admitted_records: records.length,
    timing_drift: driftReport,
    status: errors.length ? 'FAIL' : 'PASS',
    errors,
  }, null, 2)}\n`);

  // Coverage is proven above. This is the second failure mode: coverage intact,
  // but the model so far from reality that the shards no longer balance. It is
  // invisible in a green run, so it is asserted rather than eyeballed.
  const {seconds: modelled, fallback} = timings();
  const measured = new Map();
  for (const file of files) {
    for (const r of readJson(path.join(RECEIPT_DIR, file)).results || []) measured.set(r.id, r.seconds);
  }
  const drift = [...measured.entries()]
    .map(([id, actual]) => ({id, actual, model: typeof modelled[id] === 'number' ? modelled[id] : fallback, timed: typeof modelled[id] === 'number'}))
    .filter((d) => d.actual - d.model > DRIFT_REPORT_SECONDS)
    .sort((a, b) => (b.actual - b.model) - (a.actual - a.model));
  const describe = (d) => `${d.id} modelled ${d.model}s${d.timed ? '' : ' (untimed, the declared default)'} but took ${d.actual}s`;
  const unmeasured = drift.filter((d) => !d.timed && d.actual > UNTIMED_MUST_MEASURE_SECONDS);
  const stale = drift.filter((d) => d.timed && d.actual > d.model * DRIFT_HARD_FAIL_FACTOR + DRIFT_HARD_FAIL_MARGIN);
  if (unmeasured.length) {
    errors.push(`${unmeasured.length} validator(s) carry no timing entry and are expensive, so the shard plan plainly did not account for them - re-derive with \`validation_shards.mjs calibrate\` and commit the result: ${unmeasured.map(describe).join('; ')}`);
  }
  if (stale.length) {
    errors.push(`${stale.length} validator(s) cost far more than the shard plan modelled, beyond what runner variance explains, so the bin packing is balancing on stale numbers - re-derive with \`validation_shards.mjs calibrate\`: ${stale.map(describe).join('; ')}`);
  }
  driftReport = drift.map((d) => ({...d, over: Math.round((d.actual - d.model) * 10) / 10}));
  for (const d of drift) {
    const verdict = unmeasured.includes(d) || stale.includes(d) ? 'FAIL' : 'note';
    console.log(`[shards:verify] ${verdict}: ${describe(d)}`);
  }

  // The shard receipts account for the shardable steps. The build job accounts
  // for the rest, and without reconciling it too the ordered prefix could fail
  // to run a step and nothing here would notice - the union would simply be
  // smaller and still internally consistent. Coverage is asserted over the whole
  // profile, not over the part that happens to be sharded.
  const {all, ordered} = partition();
  const PRODUCER_RECEIPT = 'artifacts/validation/shard-producers.json';
  if (!fs.existsSync(PRODUCER_RECEIPT)) {
    errors.push(`the build job receipt ${PRODUCER_RECEIPT} is absent, so the ${ordered.length} ordered step(s) it runs are unaccounted for`);
  } else {
    const producerResults = readJson(PRODUCER_RECEIPT).results || [];
    const ranOrdered = new Set(producerResults.map((r) => r.id));
    const failedOrdered = producerResults.filter((r) => r.exit_code !== 0).map((r) => r.id);
    if (failedOrdered.length) errors.push(`ordered build step(s) failed: ${failedOrdered.join(', ')}`);
    const missingOrdered = ordered.filter((s) => !ranOrdered.has(s.id)).map((s) => s.id);
    if (missingOrdered.length) errors.push(`declared by ${MATRIX_FILE} for the ordered build job but never executed: ${missingOrdered.join(', ')}`);
    const wholeProfile = new Set([...executedSet, ...ranOrdered]);
    const unaccounted = all.filter((s) => !wholeProfile.has(s.id)).map((s) => s.id);
    if (unaccounted.length) errors.push(`profile step(s) executed by neither the build job nor any shard: ${unaccounted.join(', ')}`);
    if (wholeProfile.size !== all.length) {
      errors.push(`the run executed ${wholeProfile.size} of the ${all.length} step(s) ${PROFILE} declares`);
    }
  }

  if (errors.length) die(`[shards:verify] FAIL: ${errors.length} coverage issue(s)`, errors);
  console.log(`[shards:verify] OK: ${executedSet.size} validator(s) across ${count} shard(s) plus ${ordered.length} ordered build step(s) = all ${all.length} step(s) the ${PROFILE} profile declares`);
  process.exit(0);
}

/**
 * Re-derive the timings file from the receipts of a real run. This is the loop
 * that keeps the model honest: `verify` fails when reality drifts from the plan,
 * and `calibrate` is how that failure is fixed - by measurement, never by hand.
 * Entries for steps the profile no longer declares are dropped, so the file
 * cannot accumulate names that no longer exist.
 */
if (command === 'calibrate') {
  const {all} = partition();
  const known = new Set(all.map((s) => s.id));
  const previous = fs.existsSync(TIMINGS_FILE) ? readJson(TIMINGS_FILE) : {};
  const next = {...(previous.seconds || {})};
  let updated = 0;
  const sources = [];
  if (fs.existsSync('artifacts/validation/shard-producers.json')) sources.push('artifacts/validation/shard-producers.json');
  if (fs.existsSync(RECEIPT_DIR)) {
    for (const f of fs.readdirSync(RECEIPT_DIR).filter((f) => f.endsWith('.json'))) sources.push(path.join(RECEIPT_DIR, f));
  }
  if (!sources.length) die('[shards:calibrate] FAIL: no receipts found; calibration examined zero items');
  for (const src of sources) {
    for (const r of readJson(src).results || []) {
      if (typeof r.seconds === 'number') { next[r.id] = r.seconds; updated += 1; }
    }
  }
  if (!updated) die('[shards:calibrate] FAIL: receipts carried no per-step timings; calibration examined zero items');
  const dropped = Object.keys(next).filter((id) => !known.has(id));
  for (const id of dropped) delete next[id];
  const out = {
    source_run_id: process.env.GITHUB_RUN_ID || previous.source_run_id || 'local',
    measured_at: new Date().toISOString(),
    note: 'Per-step wall clock, re-derived from shard receipts by `validation_shards.mjs calibrate`. Do not hand-edit.',
    untimed_default_seconds: previous.untimed_default_seconds ?? 2,
    seconds: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(TIMINGS_FILE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[shards:calibrate] OK: ${updated} step timing(s) recorded, ${dropped.length} stale entr(ies) dropped, ${Object.keys(out.seconds).length} total`);
  process.exit(0);
}

die(`[shards] FAIL: unknown subcommand ${command ?? '(none)'}; expected plan|producers|run|verify|calibrate`);
