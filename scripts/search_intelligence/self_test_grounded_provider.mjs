#!/usr/bin/env node
/**
 * Proof that the repointed grounded provider is read correctly, and that the
 * lane can no longer be pointed back at a provider that cannot ground.
 *
 * Why a fixture: the response below is the shape OpenRouter's web plugin
 * returns - choices[0].message.annotations[] of type url_citation, each with a
 * url. Asserting against it is what makes the parser's contract explicit; the
 * live call itself is exercised by the workflow, which holds the credential.
 *
 * What this refuses to do is claim a citation rate. It checks parsing and
 * configuration, nothing about whether these pages are actually cited.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { citations, citationUrls, citationRefs, answerText, WEB_PLUGIN, WEB_ENGINE, WEB_MODE } from '../lib/openrouter_web_citations.mjs';

const FIXTURE = {
  id: 'gen-fixture',
  model: 'openai/gpt-4o-mini',
  choices: [{
    message: {
      role: 'assistant',
      content: 'Several AI coaching tools are commonly compared...',
      annotations: [
        { type: 'url_citation', url_citation: { url: 'https://billionairehighperformancecoach.com/answers/phase4/demand/ai-coaching-tools', title: 'AI Coaching Tools' } },
        { type: 'url_citation', url_citation: { url: 'https://www.example.com/roundup', title: 'A roundup' } },
        { type: 'url_citation', url_citation: { url: 'https://www.example.com/roundup', title: 'A roundup (duplicate)' } },
        { type: 'file', file: { name: 'not-a-citation.pdf' } },
        { type: 'url_citation', url_citation: { title: 'no url at all' } }
      ]
    }
  }]
};

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures += 1; console.error(`  FAIL ${name}: ${e.message}`); }
};

check('url_citation annotations are read, in order', () => {
  assert.deepEqual(citationUrls(FIXTURE), [
    'https://billionairehighperformancecoach.com/answers/phase4/demand/ai-coaching-tools',
    'https://www.example.com/roundup'
  ]);
});
check('duplicate urls collapse to one citation', () => assert.equal(citations(FIXTURE).length, 2));
check('annotations that are not url_citations are ignored', () => {
  assert.ok(!citationUrls(FIXTURE).some((u) => u.includes('not-a-citation')));
});
check('a url_citation with no url is not counted as a citation', () => {
  assert.ok(citations(FIXTURE).every((c) => typeof c.url === 'string' && c.url));
});
check('hosts are normalised so an owned domain is recognisable', () => {
  assert.deepEqual(citationRefs(FIXTURE).map((r) => r.domain),
    ['billionairehighperformancecoach.com', 'example.com']);
});
check('the answer text is read from message.content', () => {
  assert.ok(answerText(FIXTURE).startsWith('Several AI coaching tools'));
});
check('an empty or errored payload yields no citations, never a fabricated one', () => {
  assert.deepEqual(citationUrls({}), []);
  assert.deepEqual(citationUrls({ error: { message: 'RESOURCE_EXHAUSTED' } }), []);
});
check('the web plugin is declared with a result count', () => {
  assert.deepEqual(WEB_PLUGIN(10), [{ id: 'web', engine: WEB_ENGINE, mode: WEB_MODE, max_results: 10 }]);
  assert.equal(WEB_PLUGIN()[0].max_results, 10, 'the default must still request results');
});
check('the plugin defaults to the per-request engine, not per-result billing', () => {
  // Asserted as literals on purpose. OpenRouter's DEFAULT web engine bills per
  // RESULT (~$0.04/query measured on this account); 'parallel'/'turbo' bills
  // per REQUEST with 10 results included ($0.00127/call measured). Flipping
  // these back is a ~31x cost regression that nothing else in CI would catch,
  // so the cheap engine is pinned here rather than merely defaulted in the lib.
  const [plugin] = WEB_PLUGIN(10);
  assert.equal(plugin.engine, 'parallel');
  assert.equal(plugin.mode, 'turbo');
});

const contract = JSON.parse(fs.readFileSync('data/search_intelligence/search_intelligence_contract.json', 'utf8'));
const cfg = contract.providers?.grounded_search || {};
check('the grounded provider is not pointed at Google GenAI, which is hard-blocked here', () => {
  assert.notEqual(cfg.provider_id, 'google_genai_grounded_search');
  assert.ok(!String(cfg.endpoint || '').includes('generativelanguage.googleapis.com'),
    `endpoint still points at the blocked provider: ${cfg.endpoint}`);
  assert.equal(cfg.credential_env, 'OPENROUTER_API_KEY');
});
check('the contract records why the previous provider was retired', () => {
  assert.ok(String(cfg.why_not_gemini || '').includes('RESOURCE_EXHAUSTED'));
});

const probe = fs.readFileSync('scripts/llm_citation_probe.mjs', 'utf8');
check('grounded mode in the probe cannot route to gemini', () => {
  assert.ok(/GROUNDED \? 'openrouter'/.test(probe), 'grounded mode must be pinned to openrouter');
});
check('a citation rate is only recorded against answered observations', () => {
  assert.ok(probe.includes('answered ? Number(((100 * cited) / answered)'),
    'the rate denominator must be answered observations');
  assert.ok(probe.includes("measurement_state: answered ? 'MEASURED' : 'NOT_MEASURED'"));
});

console.log(failures ? `[search:grounded-provider:self-test] FAIL: ${failures} check(s)` : '[search:grounded-provider:self-test] OK');
process.exit(failures ? 1 : 0);
