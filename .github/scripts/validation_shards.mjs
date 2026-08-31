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
const PLAN_FILE = 'artifacts/validation/shard-plan.json';
const RECEIPT_DIR = 'artifacts/validation/shards';
const DEFAULT_SECONDS = 1.0;

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
const PRODUCER_PATTERN = /\b(?:build|repair|bootstrap|python-runtime|normalization|apply-report-contract|snapshot)\b/i;
const isProducer = (step) => PRODUCER_PATTERN.test(step.id || '') || PRODUCER_PATTERN.test(step.command || '');

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

function partition() {
  const steps = resolveSteps();
  return {
    all: steps,
    producers: steps.filter(isProducer),
    validators: steps.filter((s) => !isProducer(s)),
  };
}

function timings() {
  if (!fs.existsSync(TIMINGS_FILE)) return {};
  return readJson(TIMINGS_FILE).seconds || {};
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
  const cost = timings();
  const ordered = [...validators].sort((a, b) => {
    const d = (cost[b.id] ?? DEFAULT_SECONDS) - (cost[a.id] ?? DEFAULT_SECONDS);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const bins = Array.from({length: count}, (_, index) => ({shard: index, seconds: 0, steps: []}));
  for (const step of ordered) {
    const bin = bins.reduce((lightest, b) => (b.seconds < lightest.seconds ? b : lightest), bins[0]);
    bin.steps.push(step);
    bin.seconds += cost[step.id] ?? DEFAULT_SECONDS;
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

  if (errors.length) die(`[shards:verify] FAIL: ${errors.length} coverage issue(s)`, errors);
  console.log(`[shards:verify] OK: ${executedSet.size} validator(s) executed across ${count} shard(s), equal to the ${declared.length} the matrix declares`);
  process.exit(0);
}

die(`[shards] FAIL: unknown subcommand ${command ?? '(none)'}; expected plan|producers|run|verify`);
