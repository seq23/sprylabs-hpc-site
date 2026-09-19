#!/usr/bin/env node
// Guards the sentinel's one ACTION: quarantining a raw agent drop off a red main.
//
// The action rewrites main, so what matters most is what it refuses to touch.
// Every refusal is a case here, driven against a scripted local GitHub API, and
// the execute path is proved against a recording stand-in for the writer helper
// so the exact removal handed to the single main-writing choke point is
// asserted rather than assumed. Hard-fails if zero cases execute.

import {spawn, spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'quarantine_raw_agent_drop.mjs');
const REPO = 'seq23/sprylabs-hpc-site';
const DROP = 'data/report_fixes/agent_runs/2026-09-19/bhpc';
const DROP_FILES = [`${DROP}/agent_run_manifest.json`, `${DROP}/bhpc.csv`, `${DROP}/bhpc.html`, `${DROP}/bhpc.json`];

function commitPayload({files = DROP_FILES, parents = 1, login = 'seq23', name = 'S.L.T.'} = {}) {
  return {
    author: login ? {login} : null,
    commit: {message: 'citation-velocity: bhpc run 2026-09-19', author: {name}},
    parents: Array.from({length: parents}, (_, i) => ({sha: `${i}`.padStart(40, 'a')})),
    files: files.map((filename) => ({filename})),
  };
}

async function startApi({commit, pulls = [], commitStatus = 200, refStatus = 201, prStatus = 201}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      requests.push({method: req.method, url: req.url, body: body ? JSON.parse(body) : null});
      const send = (status, payload) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(payload)); };
      if (req.method === 'GET' && /\/commits\/[0-9a-f]{40}\/pulls/.test(req.url)) return send(200, pulls);
      if (req.method === 'GET' && /\/commits\/[0-9a-f]{40}$/.test(req.url)) return send(commitStatus, commitStatus === 200 ? commit : {message: 'boom'});
      if (req.method === 'POST' && req.url.endsWith('/git/refs')) return send(refStatus, {ref: 'refs/heads/agent-drop/2026-09-19-bhpc'});
      if (req.method === 'GET' && req.url.includes('/git/ref/heads/')) return send(200, {object: {sha: process.env.TEST_EXISTING_REF_SHA || ''}});
      if (req.method === 'GET' && req.url.includes('/pulls?state=open')) return send(200, []);
      if (req.method === 'POST' && req.url.endsWith('/pulls')) return send(prStatus, {number: 101, html_url: 'https://example.invalid/pull/101'});
      send(404, {message: `unscripted ${req.method} ${req.url}`});
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {server, requests, url: `http://127.0.0.1:${server.address().port}`};
}

function runScript({apiUrl, headSha, cwd, execute = false, extraEnv = {}}) {
  return new Promise((resolve) => {
    const outFile = path.join(cwd, 'github-output');
    fs.writeFileSync(outFile, '');
    const child = spawn(process.execPath, [script, ...(execute ? ['--execute'] : [])], {
      cwd,
      env: {
        ...process.env,
        GITHUB_API_URL: apiUrl,
        GITHUB_REPOSITORY: REPO,
        GITHUB_TOKEN: 'stub-token',
        HEAD_SHA: headSha,
        GITHUB_OUTPUT: outFile,
        ...extraEnv,
      },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({code, stdout, stderr, outputs: fs.readFileSync(outFile, 'utf8')}));
  });
}

const failures = [];
let executed = 0;
function check(name, condition, detail = '') {
  executed += 1;
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}`);
}

const SHA = 'b'.repeat(40);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-test-'));

// --- refusals ---------------------------------------------------------------
{
  const cases = [
    ['raw direct drop by the owner on red main -> would quarantine', {commit: commitPayload()}, 'would_quarantine', null],
    ['same files by github-actions[bot] -> none (bot_author)', {commit: commitPayload({login: 'github-actions[bot]', name: 'github-actions[bot]'})}, 'none', 'bot_author'],
    ['drop plus a page outside the drop root -> none (not_a_raw_drop)', {commit: commitPayload({files: [...DROP_FILES, 'insights/how-to-delegate-without-losing-quality.html']})}, 'none', 'not_a_raw_drop'],
    ['drop files without a manifest -> none (no_manifest)', {commit: commitPayload({files: DROP_FILES.filter((f) => !f.endsWith('agent_run_manifest.json'))})}, 'none', 'no_manifest'],
    ['merge commit -> none (not_a_direct_push)', {commit: commitPayload({parents: 2})}, 'none', 'not_a_direct_push'],
    ['drop that arrived through a merged PR -> none (arrived_through_pull_request)', {commit: commitPayload(), pulls: [{number: 95, merged_at: '2026-09-19T15:00:00Z', state: 'closed'}]}, 'none', 'arrived_through_pull_request'],
    ['drop with only an OPEN PR attached -> would quarantine (nothing merged it)', {commit: commitPayload(), pulls: [{number: 96, merged_at: null, state: 'open'}]}, 'would_quarantine', null],
  ];
  for (const [name, apiConfig, expectedAction, expectedReason] of cases) {
    const apiServer = await startApi(apiConfig);
    const caseDir = fs.mkdtempSync(path.join(scratch, 'case-'));
    const result = await runScript({apiUrl: apiServer.url, headSha: SHA, cwd: caseDir});
    apiServer.server.close();
    const action = /^action=(.*)$/m.exec(result.outputs)?.[1];
    const reason = /^reason=(.*)$/m.exec(result.outputs)?.[1];
    check(name, result.code === 0 && action === expectedAction && (!expectedReason || reason === expectedReason), `exit ${result.code}, action=${action}, reason=${reason} ${result.stderr.slice(0, 200)}`);
    if (expectedAction === 'none') {
      check(`${name} -> no write was attempted`, !apiServer.requests.some((r) => r.method === 'POST'), 'a POST was made on a refusal');
    }
  }
}

// --- refuses to guess -------------------------------------------------------
{
  const apiServer = await startApi({commit: commitPayload(), commitStatus: 500});
  const caseDir = fs.mkdtempSync(path.join(scratch, 'case-'));
  const result = await runScript({apiUrl: apiServer.url, headSha: SHA, cwd: caseDir});
  apiServer.server.close();
  check('unreadable commit -> hard failure, not a verdict', result.code === 2 && /could not read commit/.test(result.stderr), `exit ${result.code}`);
  check('unreadable commit -> no write was attempted', !apiServer.requests.some((r) => r.method === 'POST'));
}
{
  const caseDir = fs.mkdtempSync(path.join(scratch, 'case-'));
  const result = await runScript({apiUrl: 'http://127.0.0.1:9', headSha: 'deadbeef', cwd: caseDir});
  check('short SHA -> refused before any API call', result.code === 2 && /full commit SHA/.test(result.stderr), `exit ${result.code}`);
}

// --- execute ----------------------------------------------------------------
// A scratch repository whose HEAD is a real raw drop, and a recording stand-in
// for the writer helper: the test asserts exactly what reaches the choke point.
function makeDropRepo() {
  const dir = fs.mkdtempSync(path.join(scratch, 'repo-'));
  const git = (...args) => { const r = spawnSync('git', args, {cwd: dir, encoding: 'utf8'}); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(dir, DROP), {recursive: true});
  for (const f of DROP_FILES) fs.writeFileSync(path.join(dir, f), f.endsWith('.json') ? '{"status":"READY_FOR_ABSORPTION"}\n' : 'x\n');
  git('add', '-A'); git('commit', '-q', '-m', 'citation-velocity: bhpc run 2026-09-19');
  return {dir, sha: git('rev-parse', 'HEAD')};
}
function makeHelperDouble(exitCode) {
  const file = path.join(scratch, `helper-${exitCode}.sh`);
  fs.writeFileSync(file, `#!/usr/bin/env bash\nprintf 'message=%s\\nworkflow_id=%s\\nargv=%s\\n' "$1" "$2" "\${WORKFLOW_ARGV:-}" > "\${HELPER_RECORD:?}"\ngit status --porcelain >> "\${HELPER_RECORD}"\nexit ${exitCode}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}
{
  const repo = makeDropRepo();
  const apiServer = await startApi({commit: commitPayload()});
  const record = path.join(repo.dir, '..', `record-${path.basename(repo.dir)}`);
  const result = await runScript({apiUrl: apiServer.url, headSha: repo.sha, cwd: repo.dir, execute: true, extraEnv: {QUARANTINE_WRITER_HELPER: makeHelperDouble(0), HELPER_RECORD: record}});
  apiServer.server.close();
  const posts = apiServer.requests.filter((r) => r.method === 'POST');
  const recorded = fs.existsSync(record) ? fs.readFileSync(record, 'utf8') : '';
  check('execute: branch created at the exact drop SHA', posts.some((r) => r.url.endsWith('/git/refs') && r.body?.sha === repo.sha && r.body?.ref === 'refs/heads/agent-drop/2026-09-19-bhpc'), JSON.stringify(posts.map((p) => p.url)));
  check('execute: pull request opened from that branch onto main', posts.some((r) => r.url.endsWith('/pulls') && r.body?.head === 'agent-drop/2026-09-19-bhpc' && r.body?.base === 'main'));
  check('execute: the drop is staged for removal when the helper is called', /^D  data\/report_fixes\/agent_runs\/2026-09-19\/bhpc\/agent_run_manifest\.json$/m.test(recorded), recorded.slice(0, 400));
  check('execute: nothing but the drop is staged', !recorded.split('\n').some((l) => /^[ MADRCU]{2} /.test(l) && !l.includes(DROP)), recorded.slice(0, 400));
  check('execute: the helper is told the PR it is clearing main for', /message=quarantine raw agent drop 2026-09-19\/bhpc: moved to agent-drop\/2026-09-19-bhpc, PR #101/.test(recorded), recorded.slice(0, 200));
  check('execute: the replay argv removes exactly the drop', /argv=git rm -r -q --ignore-unmatch -- 'data\/report_fixes\/agent_runs\/2026-09-19\/bhpc'/.test(recorded));
  check('execute: exit 0 and pr_url reported', result.code === 0 && /^pr_url=https:\/\/example\.invalid\/pull\/101$/m.test(result.outputs), `exit ${result.code} ${result.stderr.slice(0, 300)}`);
}
{
  const repo = makeDropRepo();
  const apiServer = await startApi({commit: commitPayload()});
  const record = path.join(repo.dir, '..', `record-${path.basename(repo.dir)}`);
  const result = await runScript({apiUrl: apiServer.url, headSha: repo.sha, cwd: repo.dir, execute: true, extraEnv: {QUARANTINE_WRITER_HELPER: makeHelperDouble(1), HELPER_RECORD: record}});
  apiServer.server.close();
  check('execute: a helper that cannot land the removal fails the run', result.code !== 0 && /main still carries the drop/.test(result.stderr), `exit ${result.code}`);
}
{
  const repo = makeDropRepo();
  process.env.TEST_EXISTING_REF_SHA = 'c'.repeat(40);
  const apiServer = await startApi({commit: commitPayload(), refStatus: 422});
  const record = path.join(repo.dir, '..', `record-${path.basename(repo.dir)}`);
  const result = await runScript({apiUrl: apiServer.url, headSha: repo.sha, cwd: repo.dir, execute: true, extraEnv: {QUARANTINE_WRITER_HELPER: makeHelperDouble(0), HELPER_RECORD: record}});
  apiServer.server.close();
  delete process.env.TEST_EXISTING_REF_SHA;
  check('execute: an existing branch at a DIFFERENT sha is never overwritten', result.code === 2 && /refusing to overwrite/.test(result.stderr) && !apiServer.requests.some((r) => r.url.endsWith('/pulls') && r.method === 'POST'), `exit ${result.code}`);
}
{
  // main moved between the verdict and the checkout: stop, create nothing.
  const repo = makeDropRepo();
  const apiServer = await startApi({commit: commitPayload()});
  const record = path.join(repo.dir, '..', `record-${path.basename(repo.dir)}`);
  const result = await runScript({apiUrl: apiServer.url, headSha: 'd'.repeat(40), cwd: repo.dir, execute: true, extraEnv: {QUARANTINE_WRITER_HELPER: makeHelperDouble(0), HELPER_RECORD: record}});
  apiServer.server.close();
  check('execute: checkout not at the verdict sha -> named stop, nothing created, helper not called', result.code === 0 && /^reason=main_moved_on$/m.test(result.outputs) && !apiServer.requests.some((r) => r.method === 'POST') && !fs.existsSync(record), `exit ${result.code} ${result.outputs.slice(0, 200)}`);
}
{
  // A declared WORKFLOW_ARGV (the workflow's replay command) is passed through.
  const repo = makeDropRepo();
  const apiServer = await startApi({commit: commitPayload()});
  const record = path.join(repo.dir, '..', `record-${path.basename(repo.dir)}`);
  await runScript({apiUrl: apiServer.url, headSha: repo.sha, cwd: repo.dir, execute: true, extraEnv: {QUARANTINE_WRITER_HELPER: makeHelperDouble(0), HELPER_RECORD: record, WORKFLOW_ARGV: 'node .github/scripts/quarantine_raw_agent_drop.mjs --execute'}});
  apiServer.server.close();
  const recorded = fs.existsSync(record) ? fs.readFileSync(record, 'utf8') : '';
  check('execute: a declared replay command reaches the helper unchanged', /argv=node \.github\/scripts\/quarantine_raw_agent_drop\.mjs --execute/.test(recorded), recorded.slice(0, 200));
}
{
  // The helper seam must be inert against the real API host.
  const src = fs.readFileSync(script, 'utf8');
  check('source: helper override is honoured only against a non-github API url', /apiIsStub/.test(src) && /api\\\.github\\\.com/.test(src));
  check('source: removal goes through commit_and_push_if_changed.sh', /commit_and_push_if_changed\.sh/.test(src));
  check('source: a merged pull request is a refusal', /arrived_through_pull_request/.test(src));
}

fs.rmSync(scratch, {recursive: true, force: true});
if (executed === 0) { console.error('[quarantine-raw-agent-drop-self-test] FAIL: zero cases executed'); process.exit(1); }
if (failures.length) {
  console.error(`[quarantine-raw-agent-drop-self-test] FAIL: ${failures.length} of ${executed} case(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[quarantine-raw-agent-drop-self-test] PASS: ${executed} case(s); refusals are named and write nothing, the execute path stages exactly the drop and hands it to the writer helper, and a helper that cannot land it fails the run.`);
