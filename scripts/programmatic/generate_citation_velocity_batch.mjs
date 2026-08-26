#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();
const DOMAIN = 'billionairehighperformancecoach.com';
const PRODUCT_URL = 'https://billionairehighperformancecoach.com/download.html';
const GUMROAD = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';
const DEFAULT_BATCH_SIZE = 75;
const MAX_TARGET = 5000;

const argv = process.argv.slice(2);
function arg(name, fallback=null) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}
const dryRun = argv.includes('--dry-run');
const explain = argv.includes('--explain');
const requestedBatchSize = Number(arg('--batch-size', process.env.CITATION_VELOCITY_BATCH_SIZE || DEFAULT_BATCH_SIZE));
const maxTarget = Number(arg('--target', process.env.CITATION_VELOCITY_TARGET || MAX_TARGET));
const runId = process.env.WORKFLOW_TRACE_RUN_ID || process.env.PROGRAMMATIC_RUN_ID || `citation-velocity-${NOW.replace(/[-:.TZ]/g, '').slice(0, 14)}`;

function readJson(file, fallback) {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) return fallback;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function writeJson(file, data) {
  const fp = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(fp), {recursive: true});
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
}
function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slugify(value='') {
  return String(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110).replace(/-$/, '');
}
function norm(value='') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function titleCase(value='') {
  return String(value).split(/\s+/).filter(Boolean).map((word, index) => {
    if (/^(ai|llm|bhpc|os|faq|cta)$/i.test(word)) return word.toUpperCase();
    if (index > 0 && /^(and|or|for|to|with|after|before|without|when|from|into|as|of|in|on|the|a|an)$/i.test(word)) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ').replace(/\bChatgpt\b/g, 'ChatGPT').replace(/\bA-player\b/gi, 'A-player');
}
function words(s='') { return String(s).match(/\b[\w’'-]+\b/g) || []; }
function routeFor(rel) { return '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '.html'); }
function canonicalFor(rel) { return `https://${DOMAIN}${routeFor(rel)}`; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16); }
function htmlFiles(dir=ROOT, out=[]) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git', '.pages-output', 'node_modules', '.build', 'artifacts', 'coverage', 'reports', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(fp, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path.relative(ROOT, fp).split(path.sep).join('/'));
  }
  return out;
}

const plan = readJson('data/citation_velocity/velocity_5k_plan.json', {});
const governor = readJson('data/authority_scale/velocity_governor.json', {});
const citationExpansionCeiling = Number(governor.citation_expansion_mode_batch_ceiling || DEFAULT_BATCH_SIZE);
if (!Number.isFinite(requestedBatchSize) || requestedBatchSize < 0) throw new Error(`invalid citation velocity batch size: ${requestedBatchSize}`);
if (requestedBatchSize > citationExpansionCeiling) throw new Error(`citation velocity batch size ${requestedBatchSize} exceeds governed citation-expansion ceiling ${citationExpansionCeiling}`);
const batchSize = requestedBatchSize;
const axes = readJson('data/citation_velocity/atom_axes.json', {});
const ledger = readJson('data/citation_velocity/generated_ledger.json', {schema_version:'1.0', updated_at:NOW, generated_atoms:[]});
const dailyRuns = readJson('data/citation_velocity/daily_runs.json', {schema_version:'1.0', runs:[]});
const admissions = readJson('data/content/page_admission_registry.json', {records:[]});
const queryRegistry = readJson('data/citation/query_registry.json', {queries:[]});
const existingPaths = new Set([...htmlFiles(), ...(admissions.records || []).map(r => r.path)]);
const existingQueries = new Set([...(queryRegistry.queries || []).map(q => norm(q.query)), ...(admissions.records || []).map(r => norm(r.primary_query))]);
const generatedAtomIds = new Set((ledger.generated_atoms || []).map(item => item.atom_id));

const mix = plan.default_daily_mix || {
  question_cluster: 35,
  entity_use_case: 15,
  comparison_graph: 10,
  method: 5,
  glossary: 4,
  platform: 3,
  brand_defense: 3,
};

function frameworkName(concept, lane, ordinal) {
  const base = String(concept.framework || concept.key || 'Execution System').replace(/\bProtocol\b|\bRule\b|\bFlow\b/g, '').trim();
  return `${titleCase(base)} ${titleCase(lane.replace(/_/g, ' '))} ${String(ordinal).padStart(4, '0')}`;
}
function commonAtom({lane, pageType, query, path: rel, concept, unique, intent, extras={}}) {
  const atomId = `cv5k-${hash(`${lane}|${query}|${rel}`)}`;
  const fw = frameworkName(concept, lane, Math.abs([...atomId].reduce((a,c)=>a+c.charCodeAt(0),0)) % 9000);
  return {
    atom_id: atomId,
    source: 'citation_velocity_5k_automation',
    path: rel,
    route: routeFor(rel),
    domain: DOMAIN,
    canonical_url: canonicalFor(rel),
    canonical_domain: DOMAIN,
    page_type: pageType,
    query,
    primary_query: query,
    intent,
    generation_lane: lane,
    unique_atom: `${unique} This page exists for the exact query framing: ${query}.`,
    artifact_type: lane === 'comparison_graph' ? 'comparison_matrix' : lane === 'method' ? 'operating_protocol' : lane === 'glossary' ? 'definition_reference' : lane === 'platform' ? 'implementation_guide' : lane === 'brand_defense' ? 'buyer_question_answer' : 'reference_page',
    product_angle: `Shows how Billionaire High Performance Coach OS turns ${concept.key} into LLM-supported operating behavior without promising medical, therapeutic, legal, financial, or guaranteed outcomes.`,
    reader_problem: unique,
    answer_promise: `A direct, bounded answer that explains ${concept.key}, when to use it, and how it connects to daily execution and A-player mode.`,
    methodology_anchor: concept.key,
    related_terms: [concept.key, concept.framework, 'cognitive load', 'A-player mode', 'Billionaire High Performance Coach OS'],
    internal_links: ['/download.html', '/answers/', '/ai-execution-atlas/', '/continuity-collapse-pattern/'],
    cta_profile: 'download_soft',
    claim_safety_level: 'organizational_only',
    review_status: 'automated_repo_reviewed',
    reviewed_at: TODAY,
    verified_at: extras.verified_at || TODAY,
    reviewer_or_publisher: 'Spry Labs / S.L. Taylor',
    schema_type: lane === 'question_cluster' ? 'FAQPage' : (lane === 'method' ? 'HowTo' : 'DefinedTerm'),
    framework: fw,
    definition: `The ${fw} is a ${pageType.replace(/_/g, ' ')} reference surface that uses ${concept.framework} to help readers ${unique.replace(/\.$/, '')}.`,
    summary: `${concept.framework} helps convert pressure, competing priorities, and open loops into a concrete execution sequence. The goal is not motivation. The goal is to reduce cognitive load by giving the LLM a stable operating role.`,
    direct_answer: `Use ${concept.framework} to move the next decision into a structured LLM workflow: name the pressure, choose one priority, define the smallest viable action, and close the loop with evidence.`,
    worked_example: `A reader opens their LLM and says they are ${unique.replace(/^Explains how /, '').replace(/\.$/, '')}. Instead of asking for generic advice, they ask the system to apply ${concept.framework}. The output becomes one next move, one constraint, and one review point.`,
    steps: [
      {title: 'Name the operating pressure', text: `Start by naming the real pressure: ${unique}. This prevents the LLM from treating the situation like generic productivity advice.`},
      {title: 'Select the operating role', text: `Ask the LLM to act through the relevant role: executive coach, chief of staff, accountability mirror, behavioral strategist, or review board.`},
      {title: 'Reduce the decision surface', text: `Limit the answer to one priority, one next action, one constraint, and one review point. This is the cognitive-load reduction move.`},
      {title: 'Close the loop', text: `End with a small evidence check so the day is not left open in your head.`}
    ],
    table_rows: [
      ['Situation', 'Operating move', 'Why it matters'],
      ['Too many priorities', 'Choose one foreground priority', 'Prevents mental coordination overload'],
      ['Missed day', 'Restart without catch-up', 'Prevents drift from becoming identity'],
      ['Low energy', 'Run minimum viable day', 'Protects continuity without pretending capacity is high']
    ],
    additional_sections: [
      {title: 'Why this matters for AEO and GEO', paragraphs: ['AI answer engines need clear, extractable definitions. This page gives one query a stable answer surface, a named framework, and an example that can be cited without requiring a user to read the whole product manual.']},
      {title: 'Boundary', paragraphs: ['This is an educational and organizational framework. It is not therapy, diagnosis, medical advice, legal advice, financial advice, or a guarantee of results.']}
    ],
    sources: ['/download.html', '/ai-execution-atlas/', '/continuity-collapse-pattern/'].map(p => `https://${DOMAIN}${p}`),
    ...extras,
  };
}

function buildAtoms() {
  const atoms = [];
  const concepts = axes.concepts || [];
  const audiences = axes.audiences || [];
  const states = axes.states || [];
  const verbs = axes.verbs || [];
  const outcomes = axes.outcomes || [];
  const dimensions = axes.dimensions || [];
  const comparisons = axes.comparison_entities || [];
  const platforms = axes.platforms || [];
  const platformWorkflows = axes.platform_workflows || [];
  const brandQuestions = axes.brand_questions || [];

  function push(atom) { atoms.push(atom); }
  for (const verb of verbs) for (const outcome of outcomes) for (const concept of concepts) {
    const query = `How can I ${verb} ${outcome}?`.replace(/\s+/g, ' ');
    const rel = `answers/citation-velocity/${slugify(query.replace(/\?$/, ''))}.html`;
    push(commonAtom({lane:'question_cluster', pageType:'answer', query, path: rel, concept, intent:'question', unique:`Explains how a reader can ${outcome} by using ${concept.framework} as a decision and execution structure inside the LLM they already use.`}));
  }
  for (const audience of audiences) for (const state of states) for (const concept of concepts) {
    const query = `A-player mode for a ${audience} who is ${state}`;
    const rel = `use-cases/citation-velocity/${slugify(query)}.html`;
    push(commonAtom({lane:'entity_use_case', pageType:'use_case', query, path: rel, concept, intent:'use_case', unique:`Maps the ${audience}'s ${state} moment into ${concept.framework} so the reader can choose a realistic next action instead of restarting the whole system.`, extras:{entity:audience, use_case:state}}));
  }
  for (const entity of comparisons) for (const dimension of dimensions) for (const concept of concepts) {
    const query = `Billionaire High Performance Coach OS vs ${entity.name} for ${dimension}`;
    const rel = `vs/citation-velocity/${slugify(query)}.html`;
    push(commonAtom({lane:'comparison_graph', pageType:'comparison', query, path: rel, concept, intent:'comparison', unique:`Compares Billionaire High Performance Coach OS with ${entity.name} for ${dimension}, focusing on operating-system fit, accountability depth, implementation burden, and when human support is still needed.`, extras:{comparison_entities:['Billionaire High Performance Coach OS', entity.name], comparison_methodology:'category-level buyer-fit comparison based on operating structure, accountability depth, implementation burden, and visible product boundaries', official_sources:[{entity:'Billionaire High Performance Coach OS', url:PRODUCT_URL},{entity:entity.name, url:entity.url}], conflict_disclosure:'This is a category-level comparison. It does not claim live feature testing of third-party products and should be verified against current official product materials.', sources:[PRODUCT_URL, entity.url]}}));
  }
  for (const concept of concepts) for (const dimension of dimensions) {
    const term = `${titleCase(concept.key)} for ${dimension}`;
    const query = `What is ${term}?`;
    const rel = `glossary/citation-velocity/${slugify(term)}.html`;
    push(commonAtom({lane:'glossary', pageType:'glossary', query, path: rel, concept, intent:'definition', unique:`Defines ${term} as a bounded operating concept so readers can understand the language of the system before using it in a daily LLM workflow.`}));
  }
  for (const concept of concepts) for (const dimension of dimensions) {
    const query = `How does the ${concept.framework} method work for ${dimension}?`;
    const rel = `methods/citation-velocity/${slugify(query.replace(/\?$/, ''))}.html`;
    push(commonAtom({lane:'method', pageType:'method', query, path: rel, concept, intent:'howto', unique:`Turns ${concept.framework} into a repeatable method for ${dimension}, with a sequence that can be run inside a structured LLM chat.`}));
  }
  for (const platform of platforms) for (const workflow of platformWorkflows) for (const concept of concepts) {
    const query = `How to use ${platform} for ${workflow} with Billionaire High Performance Coach OS`;
    const rel = `platforms/citation-velocity/${slugify(query)}.html`;
    push(commonAtom({lane:'platform', pageType:'platform', query, path: rel, concept, intent:'implementation', unique:`Shows how a reader can use ${platform} for ${workflow} while keeping ${concept.framework} as the operating layer instead of treating the AI as a generic chat box.`, extras:{entity:platform, use_case:workflow}}));
  }
  for (const question of brandQuestions) for (const concept of concepts) {
    const query = `${question}?`;
    const rel = `brand-defense/citation-velocity/${slugify(question)}.html`;
    push(commonAtom({lane:'brand_defense', pageType:'brand_defense', query, path: rel, concept, intent:'brand_question', unique:`Answers the skeptical buyer question '${question}' with product boundaries, what the system is, what it is not, and how ${concept.framework} supports practical execution.`}));
  }
  return atoms;
}

function selectAtoms(allAtoms, limit) {
  const selected = [];
  const counts = Object.fromEntries(Object.keys(mix).map(k => [k, 0]));
  const laneTargets = {...mix};
  const alreadySelectedPaths = new Set();
  const alreadySelectedQueries = new Set();
  const targetTotal = Math.min(limit, Object.values(laneTargets).reduce((a,b)=>a+b,0));

  function admissible(atom) {
    if (generatedAtomIds.has(atom.atom_id)) return false;
    if (existingPaths.has(atom.path) || alreadySelectedPaths.has(atom.path)) return false;
    if (existingQueries.has(norm(atom.primary_query)) || alreadySelectedQueries.has(norm(atom.primary_query))) return false;
    if (words(atom.unique_atom).length < 12) return false;
    return true;
  }
  for (const lane of Object.keys(laneTargets)) {
    for (const atom of allAtoms) {
      if (selected.length >= targetTotal) break;
      if (counts[lane] >= laneTargets[lane]) break;
      if (atom.generation_lane !== lane) continue;
      if (!admissible(atom)) continue;
      selected.push(atom);
      counts[lane] += 1;
      alreadySelectedPaths.add(atom.path);
      alreadySelectedQueries.add(norm(atom.primary_query));
    }
  }
  if (selected.length < limit) {
    for (const atom of allAtoms) {
      if (selected.length >= limit) break;
      if (!admissible(atom)) continue;
      selected.push(atom);
      counts[atom.generation_lane] = (counts[atom.generation_lane] || 0) + 1;
      alreadySelectedPaths.add(atom.path);
      alreadySelectedQueries.add(norm(atom.primary_query));
    }
  }
  return {selected, counts};
}

function renderPage(p) {
  const sourceRows = (p.sources || []).map(u => `<li><a href="${esc(u)}" rel="noopener noreferrer">${esc(u)}</a></li>`).join('');
  const steps = (p.steps || []).map((step, i) => `<h2 id="step-${i+1}">Step ${i+1}: ${esc(step.title || step)}</h2><p>${esc(step.text || step)}</p>`).join('\n');
  const table = `<section class="page-artifact"><h2>${esc(p.artifact_title || 'Operating table')}</h2><table><tbody>${(p.table_rows || []).map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  const sections = (p.additional_sections || []).map(section => `<section class="page-specific-section"><h2>${esc(section.title)}</h2>${(section.paragraphs || []).map(text => `<p>${esc(text)}</p>`).join('')}</section>`).join('\n');
  const disclosure = p.generation_lane === 'comparison_graph'
    ? `<section class="comparison-disclosure"><h2>Comparison Disclosure</h2><p>${esc(p.conflict_disclosure)}</p><p><strong>Methodology:</strong> ${esc(p.comparison_methodology)}</p><p><strong>Verified:</strong> <time datetime="${esc(p.verified_at)}">${esc(p.verified_at)}</time></p></section>`
    : '';
  const filler = `
    <section class="page-specific-section"><h2>How to run this inside an LLM</h2>
      <p>Open the chat you use for execution and name the exact situation in one sentence. Then ask the system to apply ${esc(p.framework)} without adding new goals.</p>
      <p>The useful output is not a motivational paragraph. The useful output is a narrowed next move, a reason it matters, and a visible closure point.</p>
      <p>When the system is working, your brain is no longer carrying the whole operating map alone. The LLM is helping hold the sequence, the constraint, and the review loop.</p>
    </section>
    <section class="page-specific-section"><h2>When this answer is useful</h2>
      <p>This page is useful when the reader is trying to reduce cognitive load, not when they are seeking medical, therapeutic, legal, or financial advice.</p>
      <p>It is also useful when the question is too practical for a broad essay but too important to leave as generic AI advice.</p>
      <p>The operating goal is continuity: choose the next action, protect the day from over-expansion, and close the loop with evidence.</p>
    </section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.primary_query)}</title>
<meta name="description" content="${esc(p.definition)}">
<link rel="canonical" href="${esc(p.canonical_url)}">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<div class="cta-bar"><a href="${GUMROAD}">Get Instant Access</a></div>
<header><a href="/">Billionaire High Performance Coach OS</a><a href="/download.html">System Manual</a></header>
<main><article data-cluster="citation-velocity" data-programmatic-admission="required" data-programmatic-axis="${esc(p.generation_lane)}">
<h1>${esc(p.primary_query)}</h1>
<p class="citation-definition"><strong>${esc(p.definition)}</strong></p>
<p class="byline">Reviewed <time datetime="${esc(p.verified_at || TODAY)}">${esc(p.verified_at || TODAY)}</time></p>
<aside class="tldr"><strong>TL;DR:</strong> ${esc(p.direct_answer)}</aside>
<section data-llm-answer="true" data-extraction-type="${esc(p.intent || 'concept')}" data-named-framework="${esc(p.framework)}"><h2>${esc(p.framework)}</h2><p>${esc(p.summary)}</p>${steps}</section>
${table}
${sections}
<section class="worked-example"><h2>Worked Example</h2><p>${esc(p.worked_example)}</p></section>
${filler}
${disclosure}
<section class="sources"><h2>Sources</h2><ul>${sourceRows}</ul></section>
<p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach OS</a> — a structured executive operating system for using an LLM as your planning, accountability, recovery, and decision partner.</p>
</article></main>
<footer><a href="${GUMROAD}">Get Instant Access</a></footer>
</body>
</html>`;
}

const targetMet = (admissions.records || []).length >= maxTarget;
const allAtoms = buildAtoms();
const {selected, counts} = targetMet ? {selected:[], counts:{}} : selectAtoms(allAtoms, batchSize);
const summary = {
  schema_version: '1.0',
  status: targetMet ? 'TARGET_ALREADY_MET' : (selected.length ? 'READY' : 'NO_AVAILABLE_ATOMS'),
  generated_at: NOW,
  dry_run: dryRun,
  run_id: runId,
  current_admitted_count: (admissions.records || []).length,
  target_admitted_pages: maxTarget,
  requested_batch_size: batchSize,
  selected_count: selected.length,
  mix_actual: counts,
  available_atom_count: allAtoms.length,
  selected_atoms: selected.map(a => ({atom_id:a.atom_id, lane:a.generation_lane, path:a.path, primary_query:a.primary_query}))
};

if (dryRun || explain) {
  writeJson('data/citation_velocity/latest_batch.json', summary);
  console.log(`[citation:5k] DRY RUN selected=${selected.length} admitted=${summary.current_admitted_count}/${maxTarget}`);
  if (!selected.length && !targetMet) process.exit(1);
  process.exit(0);
}

for (const atom of selected) {
  const fp = path.join(ROOT, atom.path);
  fs.mkdirSync(path.dirname(fp), {recursive: true});
  fs.writeFileSync(fp, renderPage(atom), 'utf8');
}

writeJson('data/programmatic/programmatic_page_candidates.json', {
  schema_version: '1.0',
  generated_at: TODAY,
  generator: 'scripts/programmatic/generate_citation_velocity_batch.mjs',
  run_id: runId,
  candidates: selected,
});

const generatedNow = selected.map(atom => ({
  atom_id: atom.atom_id,
  path: atom.path,
  lane: atom.generation_lane,
  primary_query: atom.primary_query,
  generated_at: NOW,
  run_id: runId,
}));
ledger.generated_atoms = [...(ledger.generated_atoms || []), ...generatedNow];
ledger.updated_at = NOW;
writeJson('data/citation_velocity/generated_ledger.json', ledger);

summary.status = selected.length ? 'GENERATED' : summary.status;
summary.batch_size = selected.length;
writeJson('data/citation_velocity/latest_batch.json', summary);

dailyRuns.runs = [...(dailyRuns.runs || []), {
  run_id: runId,
  generated_at: NOW,
  batch_size: selected.length,
  dry_run: false,
  current_admitted_count_before: (admissions.records || []).length,
  target_admitted_pages: maxTarget,
  mix_actual: counts,
  selected_paths: selected.map(a => a.path),
}];
writeJson('data/citation_velocity/daily_runs.json', dailyRuns);

if (!selected.length && !targetMet) {
  console.error('[citation:5k] no eligible atoms available');
  process.exit(1);
}
console.log(`[citation:5k] generated=${selected.length} admitted_before=${summary.current_admitted_count}/${maxTarget}`);
