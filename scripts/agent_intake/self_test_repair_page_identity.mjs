#!/usr/bin/env node
// A REPAIR adds what an agent query asks for to a page; it never renames the page.
//
// On 2026-10-03 (Spry Content Release, commit e74b7ba2) the repair planner took a
// published page's identity from the agent row's raw query whenever no curated
// entry existed: insights/deep-work-realistic-protocol.html was republished with
// the title, og:title, data-named-framework, definition and registry framework
// "i'm going to organize these files don't let me spend more than 20 minutes on it
// keep me focused", and Validate Repo stayed red on main at
// validate:framework-name-shape for every later commit.
//
// This pins the class at the one place the identity is decided -
// bhpcRepairPageIdentity() in scripts/lib/bhpc_public_page_contract.mjs, which the
// planner calls - and then asks the committed tree the same question of every
// repair spec, failing on zero examined.
import fs from 'node:fs';
import path from 'node:path';
import {
  bhpcPublishedPageIdentity, bhpcRepairPageIdentity, bhpcGeneratedFrameworkName,
  bhpcGeneratedCitationDefinition, frameworkNameShapeViolations,
} from '../lib/bhpc_public_page_contract.mjs';

const ROOT = process.cwd();
const failures = [];
let cases = 0;
const check = (ok, label) => { cases += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const QUERY = "i'm going to organize these files don't let me spend more than 20 minutes on it keep me focused";
const NAME = 'Deep work for high-pressure people: a realistic protocol';
const DEF = `${NAME} is a named operating framework for understanding deep work through observable signals.`;
const page = (h1, fw, def) => `<html><head><title>${h1}</title></head><body><h1>${h1}</h1>`
  + `<p class="citation-definition"><strong>${def}</strong></p>`
  + `<section data-llm-answer="true" data-named-framework="${fw}"></section></body></html>`;
const mentionsQuery = (id) => Object.values(id).some((v) => String(v).toLowerCase().includes('organize these files'));

// 1. A healthy published page keeps its identity against a raw query.
const healthy = bhpcPublishedPageIdentity(page(NAME, NAME, DEF));
check(healthy.h1 === NAME && healthy.framework === NAME && healthy.definition === DEF, 'published identity is read off the page (h1, data-named-framework, citation-definition)');
const kept = bhpcRepairPageIdentity({query: QUERY, heading: QUERY, curated: null, published: healthy});
check(kept.h1 === NAME && kept.framework === NAME && kept.definition === DEF, 'repair of a published page keeps its h1, framework and definition');
check(!mentionsQuery(kept), 'no identity field carries the raw agent query');

// 2. A page the old rule already damaged is repaired, not frozen.
const damaged = bhpcPublishedPageIdentity(page(NAME, QUERY, bhpcGeneratedCitationDefinition(QUERY, QUERY)));
const healed = bhpcRepairPageIdentity({query: QUERY, heading: QUERY, curated: null, published: damaged});
check(healed.framework === NAME, 'a query-shaped published framework is replaced by the page\'s own heading');
check(frameworkNameShapeViolations(healed.framework).length === 0, 'the healed framework passes validate:framework-name-shape');
check(!mentionsQuery(healed), 'the pipeline\'s own query boilerplate definition is not preserved');

// 3. A question heading stays the heading but is never taken as a NAME.
const question = 'AI Coach vs Human Coach: Which Is Better?';
const q = bhpcRepairPageIdentity({query: 'ai coaching vs human coaching', heading: 'ai coaching vs human coaching', curated: null,
  published: bhpcPublishedPageIdentity(page(question, 'AI Coach vs Human Coach Fit Matrix', 'The Fit Matrix is a decision framework.'))});
check(q.h1 === question && q.framework === 'AI Coach vs Human Coach Fit Matrix', 'a question heading is kept as h1 and the established name as framework');

// 4. Curation still wins over everything.
const c = bhpcRepairPageIdentity({query: QUERY, heading: QUERY, curated: {h1: 'Curated H1', framework: 'Curated Loop', definition: 'Curated.'}, published: healthy});
check(c.h1 === 'Curated H1' && c.framework === 'Curated Loop' && c.definition === 'Curated.', 'a curated entry outranks the published identity');

// 5. A page the pipeline CREATES (no published identity) is exactly what it was.
const created = bhpcRepairPageIdentity({query: 'build a weekly review ritual', heading: 'build a weekly review ritual', curated: null, published: null});
const legacyFw = bhpcGeneratedFrameworkName('build a weekly review ritual') || 'build a weekly review ritual';
check(created.h1 === 'build a weekly review ritual' && created.framework === legacyFw
  && created.definition === bhpcGeneratedCitationDefinition('build a weekly review ritual', legacyFw), 'a created page keeps the query-derived identity unchanged');

// 6. The validator and the planner share ONE rule.
const validatorSrc = fs.readFileSync(path.join(ROOT, 'scripts/validators/validate_framework_name_shape.mjs'), 'utf8');
const plannerSrc = fs.readFileSync(path.join(ROOT, 'scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs'), 'utf8');
check(/import\s*\{[^}]*frameworkNameShapeViolations[^}]*\}\s*from\s*'..\/lib\/bhpc_public_page_contract\.mjs'/.test(validatorSrc), 'validate:framework-name-shape reads the shared rule');
check(/bhpcRepairPageIdentity\(/.test(plannerSrc) && !/h1:\s*\(curated[^\n]*primary\.query/.test(plannerSrc), 'the planner decides identity through bhpcRepairPageIdentity, not the raw query');

// 7. The committed tree: every repair spec of a pre-existing page carries a shape-legal
//    name, or one already recorded as debt in the shrink-only baseline.
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/citation/agent_repair_specs.generated.json'), 'utf8')).priority_pages || {};
const baseline = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/framework_name_shape_baseline.json'), 'utf8')).paths || []);
let examined = 0;
const bad = [];
for (const [rel, spec] of Object.entries(specs)) {
  examined += 1;
  if (frameworkNameShapeViolations(spec.framework).length && !baseline.has(rel)) bad.push(`${rel}: ${JSON.stringify(spec.framework)}`);
}
check(examined > 0, `committed repair specs examined (${examined})`);
check(bad.length === 0, `no committed repair spec plans a new query-shaped name${bad.length ? `: ${bad.join('; ')}` : ''}`);

if (failures.length) {
  console.error(`[self-test:repair-page-identity] FAIL: ${failures.length} of ${cases} case(s)`);
  process.exit(1);
}
console.log(`[self-test:repair-page-identity] PASS: ${cases} case(s); a repair keeps the page's published identity, heals one the old rule damaged, curation still wins, created pages are unchanged, and ${examined} committed repair spec(s) carry no new query-shaped name.`);
