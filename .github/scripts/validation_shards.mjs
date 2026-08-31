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
 *   producers                  run every producer step, in matrix order
 *   run       --shard I --shards N   run one shard, write its receipt
 *   verify    --shards N       assert executed set == declared set; hard-fail otherwise
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
// How far a validator's real cost may exceed the cost the plan modelled before
// the timings file counts as stale. Drift is what silently un-balances the
// shards: an untimed or badly-timed slow validator is packed as if it were free,
// lands with twenty others, and that shard becomes the long pole. Wall clock
// degrades and every run is still green, so nothing ever reports it.
const DRIFT_TOLERANCE_SECONDS = 20;

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
const PRODUCER_PATTERN = /\b(?:build|repair|bootstrap|python-runtime|normalization|apply-report-contract|snapshot)\b/i;
const isProducer = (step) => !/^npm run validate:/.test((step.command || '').trim())
  && (PRODUCER_PATTERN.test(step.id || '') || PRODUCER_PATTERN.test(step.command || ''));

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
  const ordered = steps.filter((s) => isProducer(s) || pinned.has(s.id));
  const shardable = steps.filter((s) => !isProducer(s) && !pinned.has(s.id));
  return {
    all: steps,
    // Matrix order is preserved: `ordered` is a filter of `steps`, never a sort.
    ordered,
    producers: ordered,
    pinned,
    shardable,
    validators: shardable,
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
  const {validators} = partition();
  if (count < 1) die('[shards] FAIL: --shards must be >= 1');
  if (count > validators.length) {
    die(`[shards] FAIL: ${count} shards requested but the profile declares only ${validators.length} validator steps; an empty shard would exit 0 having done nothing`);
  }
  const {seconds: cost, fallback} = timings();
  const at = (id) => (typeof cost[id] === 'number' ? cost[id] : fallback);
  const ordered = [...validators].sort((a, b) => {
    const d = at(b.id) - at(a.id);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const bins = Array.from({length: count}, (_, index) => ({shard: index, seconds: 0, steps: []}));
  for (const step of ordered) {
    const bin = bins.reduce((lightest, b) => (b.seconds < lightest.seconds ? b : lightest), bins[0]);
    bin.steps.push(step);
    bin.seconds += at(step.id);
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
    .filter((d) => d.actual - d.model > DRIFT_TOLERANCE_SECONDS)
    .sort((a, b) => (b.actual - b.model) - (a.actual - a.model));
  if (drift.length) {
    errors.push(`${drift.length} validator(s) cost materially more than the shard plan modelled, so the bin packing is balancing on stale numbers - re-derive with \`validation_shards.mjs calibrate\`: ${drift.map((d) => `${d.id} modelled ${d.model}s${d.timed ? '' : ' (untimed default)'} but took ${d.actual}s`).join('; ')}`);
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
