// Search Readiness checklist item i10: docs/cost/zero-paid-llm.md exists and
// CLAUDE.md says "nothing paid", with a test that reads it.
//
// The checklist's own reason: "A rule no code reads is a wish; the next agent in
// the repo needs to find the rule where it works." On 25 Oct 2026 the policy
// document existed and had done since 11 Oct, but the repo had no CLAUDE.md at
// all, so nothing an agent reads first carried the rule.
//
// This test is that reader. It refuses the three ways the rule goes quiet: the
// sentence disappearing from CLAUDE.md, the document it points at disappearing,
// and the link between them rotting into a path that is not there.
//
// Run: npm run validate:claude-md-cost-rule
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CLAUDE_MD = 'CLAUDE.md';
const COST_DOC = 'docs/cost/zero-paid-llm.md';

test('CLAUDE.md exists and says "nothing paid"', () => {
  assert.ok(fs.existsSync(path.join(ROOT, CLAUDE_MD)), `${CLAUDE_MD} must exist: it is the first file an agent reads`);
  assert.match(read(CLAUDE_MD).toLowerCase(), /nothing paid/, `${CLAUDE_MD} must say "nothing paid"`);
});

test('the cost policy document exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, COST_DOC)), `${COST_DOC} must exist`);
  assert.match(read(COST_DOC).toLowerCase(), /zero paid|nothing should be paid/, `${COST_DOC} must state the policy`);
});

test('CLAUDE.md points at the cost document, and the link resolves', () => {
  const md = read(CLAUDE_MD);
  assert.ok(md.includes(COST_DOC), `${CLAUDE_MD} must link ${COST_DOC}, so the rule is findable from the front door`);
  for (const rel of [...md.matchAll(/\]\(([^)#:]+\.md)\)/g)].map((m) => m[1])) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${CLAUDE_MD} links ${rel}, which does not exist`);
  }
});

test('the rule names the validator that actually enforces it', () => {
  const md = read(CLAUDE_MD);
  assert.match(md, /validate:zero-paid-llm/, 'CLAUDE.md must name the validator that enforces the spend rule');
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.ok(scripts['validate:zero-paid-llm'], 'validate:zero-paid-llm must be a real script, not a wish');
});

test('the free router is still pinned to $0 and never falls back to paid', () => {
  const routing = JSON.parse(read('config/llm_routing.json'));
  const spend = JSON.stringify(routing);
  assert.match(spend, /"max_cost_usd":\s*0/, 'config/llm_routing.json must keep max_cost_usd at 0');
  assert.match(spend, /"fallback_to_paid":\s*false/, 'config/llm_routing.json must keep fallback_to_paid false');
});

// The "one definition per contract" table is the other half of i10's reason: it
// is where the next agent looks to find the writer instead of editing built
// output. A table naming a file or a script that is not there sends them to
// dist/, which is the defect it exists to prevent. So it is read, not trusted.
test('every file and npm script the contract table names is real', () => {
  const md = read(CLAUDE_MD);
  const rows = md.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*(Contract|-)/.test(l));
  assert.ok(rows.length >= 5, 'the contract table must still be there');
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const row of rows) {
    for (const ref of [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1])) {
      if (ref.startsWith('validate:') || ref.startsWith('repair:')) {
        assert.ok(scripts[ref], `CLAUDE.md names npm script "${ref}", which package.json does not define`);
      } else if (ref.includes('/')) {
        assert.ok(fs.existsSync(path.join(ROOT, ref)), `CLAUDE.md names ${ref}, which does not exist`);
      }
    }
  }
});
