// The summary under the definition once carried the definition's first sentence
// twice and was cut mid-phrase ("...to choose the first."), on the phase-4 pages
// and on every topic index whose lede is the summary source (6 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const def = 'The Arbitration Engine — choose the first task is a named operating pattern in the Billionaire High Performance Coach system. It applies Arbitration Engine, which chooses between competing priorities using leverage, urgency, energy, compounding, and downside, to choose the first task.';
const page = `<html><body><main><article><h1>How can I build a system to choose the first task?</h1><p class="citation-definition"><strong>${def}</strong></p><p class="byline">Written by Spry Labs.</p><h2>Arbitration Engine</h2><p>Body text about the first task and nothing else here.</p></article></main></body></html>`;

function summarise(html) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  try {
    for (const f of ['config/index_exclusions.json', 'data/page_contracts/protected_buyer_pages.json']) {
      fs.mkdirSync(path.join(root, path.dirname(f)), { recursive: true });
      fs.copyFileSync(path.join(repo, f), path.join(root, f));
    }
    fs.writeFileSync(path.join(root, 'p.html'), html);
    execFileSync(process.execPath, [path.join(repo, 'scripts/retrofit_recommendation_summary.js'), '--apply', '--root', root],
      { env: { ...process.env, RS_INSERT: 'before-first-h2', RS_PANEL_CLASS: 'citation-summary' }, stdio: 'pipe' });
    const out = fs.readFileSync(path.join(root, 'p.html'), 'utf8');
    const m = out.match(/recommendation-summary__answer">([^<]*)</);
    assert.ok(m, 'no summary was written');
    return m[1];
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('the summary never repeats a sentence and ends on a whole sentence', () => {
  const answer = summarise(page);
  const said = answer.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  assert.ok(said.length >= 1, answer);
  assert.equal(new Set(said).size, said.length, `repeated sentence: ${answer}`);
  assert.ok(answer.endsWith('choose the first task.'), `cut mid-sentence: ${answer}`);
});
