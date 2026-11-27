// The zero-paid-llm guard lets OPENROUTER_API_KEY reach a scheduled job only through the
// shared search-loop engine. It must accept the engine at @v1 or pinned to a full commit sha of
// seq23/search-loop's own workflow (boss-os #574 pins callers that way), and refuse any other
// repo, path or a branch name. Each case runs the real validator on a copy of this repo's files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WF = '.github/workflows/search-loop.yml';
const SHA = '56a1b11eb0262dd00dd4c379db7ff45dfebde4b6';
const USES = /^(\s+uses:\s*)seq23\/search-loop\/\.github\/workflows\/search-loop\.yml@\S+\s*$/gm;
const APM_CONFIG = 'search-loop.aplayermode.config.json';

// usesRef swaps every job's engine line; { only: n } swaps only the n-th (0-based); apmConfig edits
// the aplayermode.com config the second job runs.
function run(usesRef, { only = null, apmConfig = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zpl-'));
  for (const p of ['config', 'scripts', '.github', 'search-loop.config.json', APM_CONFIG]) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  const wf = fs.readFileSync(path.join(dir, WF), 'utf8');
  assert.equal(wf.match(USES)?.length, 2, 'the caller has two engine uses: lines (BHPC and aplayermode.com)');
  assert.match(wf, /^\s+OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/m, 'the caller passes the OpenRouter key by name');
  let n = -1;
  fs.writeFileSync(path.join(dir, WF), usesRef === null ? wf : wf.replace(USES, (m, pre) => { n += 1; return only === null || only === n ? `${pre}${usesRef}` : m; }));
  if (apmConfig) fs.writeFileSync(path.join(dir, APM_CONFIG), JSON.stringify(apmConfig(JSON.parse(fs.readFileSync(path.join(dir, APM_CONFIG), 'utf8')))));
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts/validators/validate_zero_paid_llm.mjs')], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const exposed = /scheduled workflow exposes a model-provider secret/;

test('engine pinned to a full commit sha of seq23/search-loop passes', () => {
  const r = run(`seq23/search-loop/.github/workflows/search-loop.yml@${SHA}`);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[validate:zero-paid-llm\] PASS/);
});
test('engine at @v1 still passes', () => {
  assert.equal(run('seq23/search-loop/.github/workflows/search-loop.yml@v1').code, 0);
});
test('the same sha in another repo fails', () => {
  const r = run(`seq23/other-loop/.github/workflows/search-loop.yml@${SHA}`);
  assert.equal(r.code, 1); assert.match(r.out, exposed);
});
test('another workflow path in seq23/search-loop fails', () => {
  const r = run(`seq23/search-loop/.github/workflows/other.yml@${SHA}`);
  assert.equal(r.code, 1); assert.match(r.out, exposed);
});
test('a branch name or a short sha fails', () => {
  for (const ref of ['main', SHA.slice(0, 12), `${SHA}0`]) {
    const r = run(`seq23/search-loop/.github/workflows/search-loop.yml@${ref}`);
    assert.equal(r.code, 1, ref); assert.match(r.out, exposed, ref);
  }
});
test('one job on another repo fails even when the other job is the pinned engine', () => {
  const r = run(`seq23/other-loop/.github/workflows/search-loop.yml@${SHA}`, { only: 1 });
  assert.equal(r.code, 1); assert.match(r.out, exposed);
});
test('the aplayermode.com config must route through this repo\'s $0 file too', () => {
  assert.equal(run(null).code, 0, 'as committed');
  for (const edit of [(c) => { delete c.llm; return c; }, (c) => ({ ...c, llm: { routing_file: 'config/paid.json' } })]) {
    const r = run(null, { apmConfig: edit });
    assert.equal(r.code, 1, r.out); assert.match(r.out, exposed);
  }
});
