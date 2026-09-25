#!/usr/bin/env node
/**
 * A workflow step's env block and the scripts that step runs must agree on names.
 *
 * Refuses the failure found on 2026-09-25 in deploy-distribution.yml: the step
 * "Verify attestation and deploy IndexNow distribution" ran
 * scripts/distribution/deploy_distribution.sh, whose Search Console lane read
 * GSC_SERVICE_ACCOUNT_JSON_PATH and GSC_SITE_URL. The step set neither, so every
 * run printed "GSC skipped: credentials/site secret not present" while the
 * GSC_SERVICE_ACCOUNT_JSON secret existed. Nothing checked that the name a
 * workflow provides is the name its script reads.
 *
 * Two checks, per `run:` step, following the step's run text through
 * `npm run <script>` (package.json, recursively) and every `scripts/...` file it
 * names (shell files recursively, other files one level):
 *
 *   A. provided-but-unread: every key in the step's `env:` must be read by the
 *      run text or a reached file. An env name no script reads is a typo or a
 *      dead wire, and the value silently goes nowhere.
 *   B. read-but-unprovided: a reached file that reads a variable in a
 *      credential family this workflow wires from `secrets.*` (same first name
 *      token, e.g. GSC_*, INDEXNOW_*) must get it from the step, job or workflow
 *      env, or from an inline `NAME=` assignment on the chain. Otherwise the
 *      script sees it empty and takes its "not configured" branch forever.
 *
 * Exceptions are named in WAIVERS with a reason; there is no other way past.
 *
 * Usage: validate_workflow_step_env_contract.mjs [--root <dir>] [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Consumed by tools or the runner, not by repo scripts.
const TOOL_CONSUMED = new Set([
  'NODE_OPTIONS', 'GITHUB_TOKEN', 'GH_TOKEN', 'CI', 'FORCE_COLOR', 'PYTHONUNBUFFERED',
  'NODE_ENV', 'TZ', 'PIP_DISABLE_PIP_VERSION_CHECK', 'NPM_CONFIG_LOGLEVEL',
]);

// Variables a script reads optionally, deliberately left unset by CI.
const WAIVERS = {
  INDEXNOW_DRY_RUN: 'local dry-run switch; CI must submit for real, so it is never set there',
  INDEXNOW_HOST: 'optional single-host override; CI submits mixed-host',
};

function parseWorkflow(text) {
  const lines = text.split('\n');
  const topEnv = new Set();
  const steps = [];
  const jobEnvs = [];
  let i = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;
  const readMapKeys = (start, baseIndent) => {
    const keys = new Set();
    let j = start;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#')) continue;
      if (indentOf(l) <= baseIndent) break;
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (m && indentOf(l) === indentOf(lines[start] || l)) keys.add(m[1]);
    }
    return keys;
  };
  const firstContent = (start) => {
    let j = start;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) j++;
    return j;
  };
  let currentJobEnv = null;
  for (i = 0; i < lines.length; i++) {
    const l = lines[i];
    const ind = indentOf(l);
    if (/^env:\s*$/.test(l)) {
      for (const k of readMapKeys(firstContent(i + 1), 0)) topEnv.add(k);
    } else if (ind === 4 && /^\s{4}env:\s*$/.test(l) && currentJobEnv) {
      for (const k of readMapKeys(firstContent(i + 1), 4)) currentJobEnv.add(k);
    } else if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(l) && ind === 2) {
      currentJobEnv = new Set();
      jobEnvs.push(currentJobEnv);
    } else if (/^\s*-\s/.test(l) && /^\s*steps:\s*$/.test(lines.slice(0, i).reverse().find((x) => x.trim() && indentOf(x) < ind) || '')) {
      // A step item. Collect its block.
      const stepIndent = ind;
      const block = [l.replace(/^(\s*)-\s/, '$1  ')];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const x = lines[j];
        if (x.trim() && indentOf(x) <= stepIndent) break;
        block.push(x);
      }
      steps.push({ line: i + 1, block, jobEnv: currentJobEnv });
    }
  }
  return {
    topEnv,
    steps: steps.map((s) => {
      const b = s.block;
      const keyIndent = indentOf(b.find((x) => x.trim()));
      let name = null; let uses = null; let run = null; const env = new Set(); const envValues = {};
      for (let k = 0; k < b.length; k++) {
        const x = b[k];
        if (indentOf(x) !== keyIndent) continue;
        let m;
        if ((m = x.match(/^\s*name:\s*(.*)$/))) name = m[1].replace(/^['"]|['"]$/g, '');
        else if ((m = x.match(/^\s*uses:\s*(.*)$/))) uses = m[1];
        else if (/^\s*env:\s*$/.test(x)) {
          for (let e = k + 1; e < b.length; e++) {
            const y = b[e];
            if (!y.trim() || y.trim().startsWith('#')) continue;
            if (indentOf(y) <= keyIndent) break;
            const km = y.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
            if (km) { env.add(km[1]); envValues[km[1]] = km[2]; }
          }
        } else if ((m = x.match(/^\s*run:\s*(.*)$/))) {
          if (/^[|>][-+]?\s*$/.test(m[1])) {
            const body = [];
            for (let e = k + 1; e < b.length; e++) {
              const y = b[e];
              if (y.trim() && indentOf(y) <= keyIndent) break;
              body.push(y);
            }
            run = body.join('\n');
          } else run = m[1];
        }
      }
      // commit_and_push_if_changed.sh replays WORKFLOW_ARGV after a rebase, so the
      // step's env is consumed by that command too.
      if (run && envValues.WORKFLOW_ARGV) run = `${run}\n${envValues.WORKFLOW_ARGV}`;
      return { line: s.line, name, uses, run, env, jobEnv: s.jobEnv || new Set() };
    }),
  };
}

const READ_PATTERNS = {
  js: [/process\.env\.([A-Z][A-Z0-9_]+)/g, /process\.env\[[^\]]*?['"]([A-Z][A-Z0-9_]+)['"][^\]]*\]/g, /\benv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
    /\{[^}]*\}\s*=\s*process\.env/g],
  py: [/os\.environ\.get\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g, /os\.environ\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g, /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g],
  sh: [/\$\{?([A-Z][A-Z0-9_]+)/g],
};

function kindOf(file) {
  if (/\.(mjs|cjs|js|ts)$/.test(file)) return 'js';
  if (/\.py$/.test(file)) return 'py';
  return 'sh';
}

function readsOf(text, kind) {
  const out = new Set();
  for (const re of READ_PATTERNS[kind]) {
    for (const m of text.matchAll(re)) {
      if (m[1]) out.add(m[1]);
      else for (const d of m[0].matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) out.add(d[1]);
    }
  }
  return out;
}

// Reads with no usable default: the script's behaviour depends on the value being
// provided. `${X:-}` counts as no default; `${X:-https://...}` does not.
function undefaultedReadsOf(text, kind) {
  const out = new Set();
  if (kind === 'sh') {
    for (const m of text.matchAll(/\$\{([A-Z][A-Z0-9_]+)(:?[-=?+])?([^}]*)\}|\$([A-Z][A-Z0-9_]+)/g)) {
      const name = m[1] || m[4];
      if (m[1] && m[2] && m[3] !== '') continue;
      out.add(name);
    }
  } else if (kind === 'py') {
    for (const m of text.matchAll(/os\.(?:environ\.get|getenv)\(\s*['"]([A-Z][A-Z0-9_]+)['"]\s*(,\s*(['"]?)([^)'"]*)\3)?\s*\)/g)) {
      if (m[2] && m[4] !== '') continue;
      out.add(m[1]);
    }
    for (const m of text.matchAll(/os\.environ\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g)) out.add(m[1]);
  } else {
    for (const m of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\])(\s*(\|\||\?\?)\s*(['"]?)([^'"\s);,]*))?/g)) {
      if (m[3] && m[6] !== '') continue;
      out.add(m[1] || m[2]);
    }
    for (const m of text.matchAll(/\benv\(\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\)/g)) out.add(m[1]);
  }
  return out;
}

function assignsOf(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:^|[\s;&|(])(?:export\s+)?([A-Z][A-Z0-9_]+)=/g)) out.add(m[1]);
  return out;
}

function topologyStages(root, lane) {
  const f = path.join(root, 'data/workflows/workflow_topology.json');
  if (!fs.existsSync(f)) return [];
  const def = JSON.parse(fs.readFileSync(f, 'utf8')).canonical_lanes?.[lane];
  if (!def) return [];
  return Object.values(def.stages_by_mode || {}).flat().filter((st) => Array.isArray(st?.command)).map((st) => st.command.join(' '));
}

function traceChain(root, runText, pkgScripts) {
  const files = new Set();
  const texts = [{ text: runText, kind: 'sh', file: '<run>' }];
  const seenScripts = new Set();
  const queue = [{ text: runText, kind: 'sh', depth: 0 }];
  while (queue.length) {
    const { text, kind, depth } = queue.shift();
    if (depth > 6) continue;
    if (kind === 'sh') {
      // scripts/workflow/run_topology_lane.mjs runs the stages a lane declares in
      // data/workflows/workflow_topology.json; those stages are what reads the env.
      if (/run_topology_lane\.mjs/.test(text)) {
        for (const m of text.matchAll(/--lane[= ]\s*([A-Za-z0-9_-]+)/g)) {
          for (const cmd of topologyStages(root, m[1])) {
            texts.push({ text: cmd, kind: 'sh', file: `topology#${m[1]}` });
            queue.push({ text: cmd, kind: 'sh', depth: depth + 1 });
          }
        }
      }
      for (const m of text.matchAll(/npm run\s+([A-Za-z0-9:._-]+)/g)) {
        const name = m[1];
        if (seenScripts.has(name) || !pkgScripts[name]) continue;
        seenScripts.add(name);
        texts.push({ text: pkgScripts[name], kind: 'sh', file: `package.json#${name}` });
        queue.push({ text: pkgScripts[name], kind: 'sh', depth: depth + 1 });
      }
      for (const m of text.matchAll(/(?:^|[\s"'=(])(?:\.\/)?((?:scripts|\.github\/scripts)\/[A-Za-z0-9_./-]+\.(?:sh|mjs|cjs|js|py))/g)) {
        const rel = m[1];
        if (files.has(rel)) continue;
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) continue;
        files.add(rel);
        const t = fs.readFileSync(abs, 'utf8');
        const k = kindOf(rel);
        texts.push({ text: t, kind: k, file: rel });
        if (k === 'sh') queue.push({ text: t, kind: 'sh', depth: depth + 1 });
      }
    }
  }
  return texts;
}

export function validate(root) {
  const wfDir = path.join(root, '.github/workflows');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pkgScripts = pkg.scripts || {};
  const errors = [];
  let workflows = 0; let stepsChecked = 0; let envNamesChecked = 0;
  const wfFiles = fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)) : [];
  for (const f of wfFiles) {
    const text = fs.readFileSync(path.join(wfDir, f), 'utf8');
    workflows++;
    const secretNames = new Set([...text.matchAll(/secrets\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
    const families = new Set([...secretNames].map((n) => n.split('_')[0]));
    const wf = parseWorkflow(text);
    for (const step of wf.steps) {
      if (!step.run) continue;
      stepsChecked++;
      const chain = traceChain(root, step.run, pkgScripts);
      const reads = new Set();
      const assigned = new Set();
      for (const t of chain) {
        for (const r of readsOf(t.text, t.kind)) reads.add(r);
        if (t.kind === 'sh') for (const a of assignsOf(t.text)) assigned.add(a);
      }
      const label = `${f}:${step.line} "${step.name || '(unnamed step)'}"`;
      // A: provided but unread.
      for (const k of step.env) {
        envNamesChecked++;
        if (TOOL_CONSUMED.has(k)) continue;
        if (!reads.has(k)) errors.push(`${label}: env ${k} is set but nothing the step runs reads it (traced ${chain.length - 1} file(s)/script(s) from the run text)`);
      }
      // B: read in a secret-wired family but never provided.
      const provided = new Set([...step.env, ...step.jobEnv, ...wf.topEnv, ...assigned]);
      for (const t of chain) {
        if (t.file === '<run>') continue;
        for (const r of undefaultedReadsOf(t.text, t.kind)) {
          if (!families.has(r.split('_')[0])) continue;
          if (provided.has(r) || WAIVERS[r]) continue;
          errors.push(`${label}: ${t.file} reads ${r}, but neither the step, its job, the workflow nor the call chain provides it; the script will always see it empty`);
        }
      }
    }
  }
  const unique = [...new Set(errors)];
  return { workflows, stepsChecked, envNamesChecked, errors: unique };
}

function report(result, root) {
  if (result.workflows === 0 || result.stepsChecked === 0) {
    console.error(`[workflow-step-env-contract] FAIL: found ${result.workflows} workflow(s) and ${result.stepsChecked} run step(s) under ${root}; a check over nothing is not a pass`);
    return 1;
  }
  if (result.errors.length) {
    for (const e of result.errors) console.error(`  FAIL ${e}`);
    console.error(`[workflow-step-env-contract] FAIL: ${result.errors.length} mismatch(es) across ${result.stepsChecked} run step(s) in ${result.workflows} workflow(s)`);
    return 1;
  }
  console.log(`[workflow-step-env-contract] PASS: ${result.stepsChecked} run step(s) in ${result.workflows} workflow(s); ${result.envNamesChecked} env name(s) each read by the step's scripts, and every secret-family variable a script reads is provided`);
  return 0;
}

function selfTest() {
  const mk = (wf, files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-env-contract-'));
    fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'dist:deploy': 'bash scripts/deploy.sh' } }));
    fs.writeFileSync(path.join(dir, '.github/workflows/w.yml'), wf);
    for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, k), v);
    return dir;
  };
  const wfBad = `name: w\non: push\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - name: restore\n        env:\n          GSC_SERVICE_ACCOUNT_JSON: \${{ secrets.GSC_SERVICE_ACCOUNT_JSON }}\n        run: printf '%s' "$GSC_SERVICE_ACCOUNT_JSON" > f\n      - name: deploy\n        env:\n          INDEXNOW_KEY: \${{ secrets.INDEXNOW_KEY }}\n        run: npm run dist:deploy\n`;
  const shBad = 'KEY="${INDEXNOW_KEY:-}"\nGSC_CREDS="${GSC_SERVICE_ACCOUNT_JSON_PATH:-}"\n';
  const shGood = 'KEY="${INDEXNOW_KEY:-}"\n';
  const wfTypo = wfBad.replace('INDEXNOW_KEY: ${{', 'INDEXNOWKEY: ${{');
  const cases = [
    ['the 2026-09-25 defect (script reads GSC_SERVICE_ACCOUNT_JSON_PATH, step never sets it) -> FAIL', mk(wfBad, { 'scripts/deploy.sh': shBad }), (r) => r.errors.some((e) => e.includes('GSC_SERVICE_ACCOUNT_JSON_PATH'))],
    ['same workflow, script reads only what the step provides -> PASS', mk(wfBad, { 'scripts/deploy.sh': shGood }), (r) => r.errors.length === 0 && r.stepsChecked === 2],
    ['a step env name nothing reads (typo) -> FAIL', mk(wfTypo, { 'scripts/deploy.sh': shGood }), (r) => r.errors.some((e) => e.includes('INDEXNOWKEY is set but nothing'))],
    ['no workflows -> FAIL rather than PASS', (() => { const d = mk(wfBad, { 'scripts/deploy.sh': shGood }); fs.rmSync(path.join(d, '.github/workflows/w.yml')); return d; })(), (r) => report(r, 'x') === 1],
  ];
  let failed = 0;
  for (const [desc, dir, ok] of cases) {
    const r = validate(dir);
    const pass = ok(r);
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${desc}`);
    if (!pass) failed++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failed) { console.error(`[workflow-step-env-contract] self-test FAIL: ${failed} case(s)`); return 1; }
  console.log(`[workflow-step-env-contract] self-test PASS: ${cases.length} case(s)`);
  return 0;
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const rootIdx = args.indexOf('--root');
  const root = path.resolve(rootIdx >= 0 ? args[rootIdx + 1] : '.');
  let code = selfTest();
  if (!args.includes('--self-test')) code = report(validate(root), root) || code;
  process.exit(code);
}
