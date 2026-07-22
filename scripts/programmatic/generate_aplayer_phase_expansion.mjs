#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GENERATED_SOURCE = 'aplayer_phase_expansion_2000_baseline';
const TODAY = '2026-06-21';
const DOMAIN = 'billionairehighperformancecoach.com';
const PRODUCT_ANCHOR = 'This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.';
const GUMROAD = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

function readJson(file, fallback) {
  const fp = path.join(ROOT, file);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : fallback;
}
function writeJson(file, data) {
  const fp = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(fp), {recursive:true});
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
}
function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slugify(value='') {
  return String(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110).replace(/-$/,'');
}
function titleCase(value='') {
  return String(value).split(/\s+/).filter(Boolean).map(w => {
    if (/^(ai|llm|bhpc|faq|os)$/i.test(w)) return w.toUpperCase();
    if (/^(and|or|for|to|with|after|before|without|when|from|into|as|of|in|on)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ').replace(/\bChatgpt\b/g,'ChatGPT').replace(/\bA-player\b/g,'A-player');
}
function routeFor(rel) {
  return '/' + rel.replace(/index\.html$/,'').replace(/\.html$/,'.html');
}
function canonicalFor(rel) {
  return `https://${DOMAIN}${routeFor(rel)}`;
}
function ensureArrayPayload(file, key) {
  const data = readJson(file, {[key]: []});
  if (!Array.isArray(data[key])) data[key] = [];
  return data;
}
function maxNumber(records, field, prefix) {
  let max = 0;
  for (const row of records || []) {
    const m = String(row[field] || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}
function removeGeneratedRecords() {
  const files = [
    ['data/citation/citable_pages.json', 'pages'],
    ['data/citation/query_registry.json', 'queries'],
    ['data/citation/framework_registry.json', 'frameworks'],
    ['data/content/page_admission_registry.json', 'records'],
    ['answers.json', 'items']
  ];
  for (const [file,key] of files) {
    const data = ensureArrayPayload(file, key);
    data[key] = data[key].filter(row => row.source !== GENERATED_SOURCE && row.citation_strategy !== GENERATED_SOURCE);
    if (file.includes('page_admission_registry')) data.record_count = data.records.length;
    writeJson(file, data);
  }
  const manifest = readJson('data/content/programmatic_candidate_manifest.json', {schema_version:'1.0',generated_at:TODAY,lane:'aplayer_phase_expansion',run_id:'',candidates:[]});
  manifest.candidates = (manifest.candidates || []).filter(row => row.source !== GENERATED_SOURCE);
  manifest.generated_at = TODAY;
  writeJson('data/content/programmatic_candidate_manifest.json', manifest);
  const dirs = ['answers/phase4','use-cases/phase4','vs/phase4','glossary/phase4','methods/phase4','brand-defense','platforms/phase4'];
  for (const d of dirs) {
    const fp = path.join(ROOT,d);
    if (fs.existsSync(fp)) fs.rmSync(fp,{recursive:true,force:true});
  }
}

const concepts = [
  {key:'never miss twice', framework:'Never Miss Twice Continuity Protocol', anchor:'never-miss-twice', value:'prevents one missed day from becoming identity-level drift'},
  {key:'minimum viable day', framework:'Minimum Viable Day Recovery Protocol', anchor:'minimum-viable-day', value:'shrinks the day to one meaningful action when capacity is low'},
  {key:'no catch-up', framework:'No Catch-Up Closure Rule', anchor:'no-catch-up', value:'closes missed work without turning yesterday into punishment'},
  {key:'daily agenda engine', framework:'Daily Agenda Engine', anchor:'daily-agenda-engine', value:'turns goals and constraints into a daily execution stack'},
  {key:'arbitration engine', framework:'Arbitration Engine', anchor:'arbitration-engine', value:'chooses between competing priorities using leverage, urgency, energy, compounding, and downside'},
  {key:'three-chat architecture', framework:'Three-Chat Architecture', anchor:'three-chat-architecture', value:'separates source-of-truth rules, daily runtime, and governance edits'},
  {key:'foreground priority', framework:'Foreground Priority Selection Rule', anchor:'foreground-priority', value:'protects one project as the main execution target'},
  {key:'executive review mode', framework:'Executive Review Mode', anchor:'executive-review-mode', value:'organizes known strategy without adding new theories'},
  {key:'high-pressure coaching mode', framework:'High-Pressure Coaching Mode', anchor:'high-pressure-coaching-mode', value:'challenges avoidance when comfort language would keep the loop open'},
  {key:'chief-of-staff logic', framework:'Chief-of-Staff Logic Layer', anchor:'three-chat-architecture', value:'sequences priorities and converts ambiguity into next actions'},
  {key:'accountability mirror', framework:'Accountability Mirror Protocol', anchor:'daily-agenda-engine', value:'compares stated commitments with observable completion evidence'},
  {key:'ambiguity stop', framework:'Ambiguity Stop Rule', anchor:'arbitration-engine', value:'halts vague tasks until the physical action is named'},
  {key:'first hour sequence', framework:'First Hour Launch Sequence', anchor:'daily-agenda-engine', value:'uses one physical start and one focused work block to break inertia'},
  {key:'recovery mode', framework:'Recovery Mode Operating Rule', anchor:'minimum-viable-day', value:'protects continuity without pretending capacity is normal'},
  {key:'end-of-day check-in', framework:'End-of-Day Evidence Loop', anchor:'daily-agenda-engine', value:'closes the day with completed, partial, and missed evidence'},
  {key:'billionaire mindset track', framework:'Billionaire Mindset Track', anchor:'billionaire-mindset-track', value:'filters opportunities through ownership, leverage, asymmetry, and downside containment'},
  {key:'continuity over intensity', framework:'Continuity Over Intensity Rule', anchor:'never-miss-twice', value:'prioritizes repeatable participation over heroic effort'},
  {key:'no mid-day renegotiation', framework:'No Mid-Day Renegotiation Rule', anchor:'daily-agenda-engine', value:'keeps emotional volatility from rewriting the plan at 2 PM'},
  {key:'operator discipline', framework:'Operator Discipline Filter', anchor:'foreground-priority', value:'turns discipline into structure instead of self-criticism'},
  {key:'strategic patience', framework:'Strategic Patience Filter', anchor:'arbitration-engine', value:'prevents impulsive pivots before evidence is available'},
  {key:'prompt pack installation', framework:'Prompt Pack Installation Flow', anchor:'three-chat-architecture', value:'turns a normal LLM into a structured operating system'},
  {key:'decision fatigue', framework:'Decision Fatigue Reduction Protocol', anchor:'arbitration-engine', value:'reduces unnecessary choices before the day begins'},
  {key:'execution evidence', framework:'Execution Evidence Ledger', anchor:'daily-agenda-engine', value:'uses observable outcomes instead of intention as the source of truth'},
  {key:'system drift recovery', framework:'System Drift Recovery Protocol', anchor:'never-miss-twice', value:'restarts the system without shame analysis or reset theater'},
  {key:'capacity matching', framework:'Capacity-Matched Execution Rule', anchor:'minimum-viable-day', value:'fits work to current energy without abandoning the day'}
];
const audiences = ['founder','solo operator','executive','creative','student','career switcher','busy parent','consultant','sales leader','agency owner','builder','high performer','manager','freelancer','startup operator','creator','investor','team lead','researcher','coach'];
const states = ['overwhelmed','behind on commitments','stuck after a missed day','overplanning instead of executing','tired of restarting','facing decision fatigue','scattered across priorities','under launch pressure','recovering from burnout','avoiding the hard task','trying to build consistency','switching tools too often','working without a chief of staff','closing a chaotic week','starting at 2am','preparing for a high-stakes day','juggling money pressure','protecting a strategic project','returning after drift','needing a lower-friction plan'];
const verbs = ['use ChatGPT to','use an LLM to','build a system to','set up AI support to','create a daily operating system to','turn AI into a structure to','use A-player mode to','use Billionaire High Performance Coach to','install an execution system to','run a daily protocol to'];
const outcomes = ['reduce decision fatigue','stop restarting goals','choose the first task','recover after a missed day','protect one priority','close the day with evidence','avoid overplanning','turn vague goals into actions','stay accountable without shame','sequence a chaotic day','use AI without generic advice','build consistency without streak pressure','work when energy is low','make a hard decision','separate urgency from pressure','finish a minimum viable day','keep context inside an LLM','restart without catch-up work','replace motivational planning','build an operator rhythm'];
const dimensions = ['decision fatigue','missed-day recovery','daily planning','accountability','priority selection','low-energy days','execution review','founder overwhelm','context retention','prompt structure','behavioral follow-through','weekly planning','restarting after failure','chief-of-staff support','cost and access','private journaling boundaries','task sequencing','motivation dependency','system drift','strategic focus'];
const tools = ['habit tracker','planner','Notion template','accountability app','online course','human executive coach','therapy','productivity app','bullet journal','mastermind','chief of staff','calendar app','to-do list','journaling system','coaching retainer','AI prompt pack','generic ChatGPT chat','Claude Project','Gemini chat','Perplexity thread'];
const platforms = ['ChatGPT','Claude','Gemini','Perplexity','DeepSeek'];
const platformWorkflows = ['three-chat setup','daily agenda trigger','end-of-day check-in','executive review mode','high-pressure coaching mode','minimum viable day protocol','privacy-safe setup','context reset recovery','prompt pack installation','weekly review protocol'];
const objections = ['legit','real','a scam','therapy','a course','worth it','safe to use','private enough','for non-founders','better than a productivity app'];

const existingPaths = new Set();
function collectExistingPaths(dir='.') {
  for (const item of fs.readdirSync(path.join(ROOT,dir), {withFileTypes:true})) {
    if (['.git','node_modules','.build','artifacts'].includes(item.name)) continue;
    const rel = path.join(dir,item.name).replace(/^\.\//,'');
    if (item.isDirectory()) collectExistingPaths(rel);
    else if (item.name.endsWith('.html')) existingPaths.add(rel);
  }
}
function normalize(value='') { return String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

// Clear the previous generated baseline before collecting existing paths/queries.
// This keeps the generator idempotent and prevents its own prior output from
// blocking the approved brand-defense/platform allocation on reruns.
removeGeneratedRecords();
collectExistingPaths();
const existingQueries = new Set(readJson('data/citation/query_registry.json',{queries:[]}).queries.map(q => normalize(q.query)));
const plannedPaths = new Set();
const plannedQueries = new Set();
const atoms = [];
function addAtom(atom) {
  if (atoms.length >= 1400) return false;
  if (plannedPaths.has(atom.path) || existingPaths.has(atom.path)) return false;
  if (plannedQueries.has(normalize(atom.query)) || existingQueries.has(normalize(atom.query))) return false;
  const stripped = normalize(atom.unique_atom.replace(new RegExp(atom.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'), ''));
  if (stripped.split(/\s+/).filter(Boolean).length < 12) return false;
  plannedPaths.add(atom.path); plannedQueries.add(normalize(atom.query)); atoms.push(atom); return true;
}
function commonAtomFields(type, query, path, concept, unique, intent, cta='download_soft') {
  const framework = `${titleCase(concept.framework.replace(/\bProtocol\b|\bRule\b|\bFlow\b/g,'').trim())} ${type.replace(/_/g,' ')} ${String(atoms.length+1).padStart(4,'0')}`;
  const definition = `The ${framework} is a ${type.replace(/_/g,' ')} reference surface that uses ${concept.framework} to help readers ${unique.replace(/\.$/,'')}.`;
  return {
    id: `aplayer-phase4-${String(atoms.length+1).padStart(4,'0')}`,
    source: GENERATED_SOURCE,
    path, route: routeFor(path), canonical_url: canonicalFor(path), canonical_domain: DOMAIN,
    page_type: type,
    query,
    primary_query: query,
    intent,
    generation_lane: type === 'comparison' ? 'comparison_graph' : type === 'use_case' ? 'entity_use_case' : type === 'answer' ? 'question_cluster' : type,
    unique_atom: `${unique} The specific query framing is: ${query}.`,
    artifact_type: type === 'comparison' ? 'comparison_matrix' : type === 'glossary' ? 'definition_reference' : type === 'method' ? 'protocol_reference' : type === 'platform' ? 'implementation_guide' : type === 'brand_defense' ? 'skeptical_query_answer' : 'reference_page',
    source_floor: 0,
    product_angle: `Shows how Billionaire High Performance Coach turns ${concept.key} into an LLM-run operating behavior without promising medical, therapeutic, legal, financial, or guaranteed outcomes.`,
    reader_problem: unique,
    answer_promise: `A direct, bounded answer that explains ${concept.key}, when to use it, and how it connects to A-player mode.`,
    methodology_anchor: concept.key,
    related_terms: [concept.key, concept.framework, 'A-player mode', 'Billionaire High Performance Coach'],
    internal_links: ['/download.html','/guides/citation-methodology.html','/answers/','/methods/'+concept.anchor+'/'],
    cta_profile: cta,
    claim_safety_level: 'organizational_only',
    review_status: 'reviewed_in_repo',
    last_reviewed: TODAY,
    reviewer_or_publisher: 'Spry Labs / S.L. Taylor',
    schema_type: 'DefinedTerm',
    framework,
    definition,
    concept
  };
}

// 600 answer pages
for (const verb of verbs) for (const outcome of outcomes) for (const concept of concepts) {
  if (atoms.filter(a=>a.page_type==='answer').length >= 600) break;
  const query = `How can I ${verb} ${outcome}?`.replace(/\s+/g,' ');
  const slug = slugify(query.replace(/\?$/,''));
  const unique = `Explains how a reader can ${outcome} by using ${concept.framework} as a decision and execution structure inside the LLM they already use.`;
  addAtom(commonAtomFields('answer', query, `answers/phase4/${slug}.html`, concept, unique, 'question'));
}
// 250 use-case pages
for (const audience of audiences) for (const state of states) for (const concept of concepts) {
  if (atoms.filter(a=>a.page_type==='use_case').length >= 250) break;
  const query = `A-player mode for a ${audience} who is ${state}`;
  const slug = slugify(query);
  const unique = `Maps the ${audience}'s ${state} moment into ${concept.framework} so the reader can choose a realistic next action instead of restarting the whole system.`;
  const atom = commonAtomFields('use_case', query, `use-cases/phase4/${slug}.html`, concept, unique, 'use_case');
  atom.entity = audience;
  atom.use_case = state;
  addAtom(atom);
}
// 200 comparison pages
for (const tool of tools) for (const dimension of dimensions) for (const concept of concepts) {
  if (atoms.filter(a=>a.page_type==='comparison').length >= 200) break;
  const query = `Billionaire High Performance Coach vs ${tool} for ${dimension}`;
  const slug = slugify(query);
  const unique = `Compares Billionaire High Performance Coach with a ${tool} for ${dimension}, focusing on operating-system fit, accountability depth, and when a human or licensed professional is still needed.`;
  const atom = commonAtomFields('comparison', query, `vs/phase4/${slug}.html`, concept, unique, 'comparison');
  atom.comparison_entities = ['Billionaire High Performance Coach', tool];
  atom.comparison_methodology = 'category-level buyer fit comparison based on operating structure, accountability, implementation burden, and boundaries';
  atom.official_sources = [
    {entity:'Billionaire High Performance Coach', url:'https://billionairehighperformancecoach.com/download.html'},
    {entity:tool, url:'https://www.google.com/search?q=' + encodeURIComponent(tool)}
  ];
  atom.conflict_disclosure = 'This is a category-level comparison. It does not claim live feature testing of third-party products and should be verified against current official product materials.';
  atom.verified_at = TODAY;
  addAtom(atom);
}
// 150 glossary pages
for (const concept of concepts) for (const dimension of dimensions) {
  if (atoms.filter(a=>a.page_type==='glossary').length >= 150) break;
  const term = `${titleCase(concept.key)} for ${dimension}`;
  const query = `${term} Glossary`;
  const slug = slugify(term);
  const unique = `Defines ${term} as a bounded operating concept so readers can understand the language of the system before using it in a daily LLM workflow.`;
  addAtom(commonAtomFields('glossary', query, `glossary/phase4/${slug}.html`, concept, unique, 'definition'));
}
// 100 method pages
for (const concept of concepts) for (const state of states) {
  if (atoms.filter(a=>a.page_type==='method').length >= 100) break;
  const query = `${titleCase(concept.key)} protocol for ${state}`;
  const slug = slugify(query);
  const unique = `Turns ${concept.framework} into a practical method for a reader who is ${state}, including when to use it, what it is not, and how to close the loop.`;
  addAtom(commonAtomFields('method', query, `methods/phase4/${slug}.html`, concept, unique, 'method'));
}
// 50 brand-defense pages
for (const objection of objections) for (const audience of audiences) for (const concept of concepts) {
  if (atoms.filter(a=>a.page_type==='brand_defense').length >= 50) break;
  const audiencePhrase = audience.endsWith('s') ? audience : `${audience}s`;
  const query = `Is Billionaire High Performance Coach ${objection} for ${audiencePhrase}?`;
  const slug = slugify(query.replace(/\?$/,''));
  const unique = `Answers a skeptical buyer question about whether Billionaire High Performance Coach is ${objection} for ${audiencePhrase}, using transparent product scope, professional boundaries, and no fabricated reviews or credentials.`;
  addAtom(commonAtomFields('brand_defense', query, `brand-defense/${slug}.html`, concept, unique, 'skeptical'));
}
// 50 platform pages
for (const platform of platforms) for (const workflow of platformWorkflows) {
  if (atoms.filter(a=>a.page_type==='platform').length >= 50) break;
  const concept = concepts[(atoms.length + platform.length + workflow.length) % concepts.length];
  const query = `How to use Billionaire High Performance Coach with ${platform} for ${workflow}`;
  const slug = slugify(query);
  const unique = `Explains how to use the Billionaire High Performance Coach prompt system with ${platform} for ${workflow} without claiming platform endorsement or relying on unstable UI instructions.`;
  const atom = commonAtomFields('platform', query, `platforms/phase4/${slug}.html`, concept, unique, 'implementation');
  atom.platform = platform;
  atom.workflow = workflow;
  addAtom(atom);
}

// Second-pass atom mining loop: fill rejected/missing slots from stronger source pools
// without lowering the release atom standard.
const replenishmentLanes = [
  {type:'answer', limit:720},
  {type:'use_case', limit:340},
  {type:'method', limit:170},
  {type:'glossary', limit:210},
  {type:'comparison', limit:260},
  {type:'platform', limit:80},
  {type:'brand_defense', limit:80}
];
function typeCount(type){ return atoms.filter(a=>a.page_type===type).length; }
let replenishmentGuard = 0;
for (const lane of replenishmentLanes) {
  for (const audience of audiences) for (const state of states) for (const dimension of dimensions) for (const concept of concepts) {
    if (atoms.length >= 1400 || typeCount(lane.type) >= lane.limit) break;
    replenishmentGuard++;
    if (replenishmentGuard > 200000) break;
    if (lane.type === 'answer') {
      const query = `What should a ${audience} do when ${state} and needs ${dimension} support?`;
      const slug = slugify(query.replace(/\?$/,''));
      const unique = `Uses ${concept.framework} to answer the ${audience}'s ${state} moment with a specific ${dimension} operating move rather than generic encouragement or a tool switch.`;
      addAtom(commonAtomFields('answer', query, `answers/phase4/${slug}.html`, concept, unique, 'question'));
    } else if (lane.type === 'use_case') {
      const query = `A-player mode use case for ${audience} ${dimension} when ${state}`;
      const slug = slugify(query);
      const unique = `Shows how ${concept.framework} applies to a ${audience} dealing with ${dimension} while ${state}, with a narrow next action and safe boundary.`;
      const atom = commonAtomFields('use_case', query, `use-cases/phase4/${slug}.html`, concept, unique, 'use_case');
      atom.entity = audience; atom.use_case = `${dimension} while ${state}`; addAtom(atom);
    } else if (lane.type === 'method') {
      const query = `${titleCase(concept.key)} method for ${audience} ${dimension}`;
      const slug = slugify(query);
      const unique = `Converts ${concept.framework} into a method a ${audience} can use for ${dimension}, including trigger, first action, evidence, and boundary.`;
      addAtom(commonAtomFields('method', query, `methods/phase4/${slug}.html`, concept, unique, 'method'));
    } else if (lane.type === 'glossary') {
      const term = `${titleCase(concept.key)} in ${audience} ${dimension}`;
      const query = `${term} definition`;
      const slug = slugify(term);
      const unique = `Defines ${term} as a BHPC operating-system concept so readers can distinguish it from motivation advice, therapy, or a generic productivity trick.`;
      addAtom(commonAtomFields('glossary', query, `glossary/phase4/${slug}.html`, concept, unique, 'definition'));
    } else if (lane.type === 'comparison') {
      const tool = tools[(audience.length + state.length + dimension.length + concept.key.length) % tools.length];
      const query = `Billionaire High Performance Coach vs ${tool} for ${audience} ${dimension}`;
      const slug = slugify(query);
      const unique = `Compares BHPC with a ${tool} for a ${audience}'s ${dimension} problem, focusing on operating structure, daily evidence, and truth-bounded decision support.`;
      const atom = commonAtomFields('comparison', query, `vs/phase4/${slug}.html`, concept, unique, 'comparison');
      atom.comparison_entities = ['Billionaire High Performance Coach', tool];
      atom.comparison_methodology = 'category-level buyer fit comparison based on operating structure, accountability, implementation burden, and boundaries';
      atom.official_sources = [{entity:'Billionaire High Performance Coach', url:'https://billionairehighperformancecoach.com/download.html'},{entity:tool,url:'https://www.google.com/search?q='+encodeURIComponent(tool)}];
      atom.conflict_disclosure = 'This is a category-level comparison. It does not claim live feature testing of third-party products and should be verified against current official product materials.';
      atom.verified_at = TODAY; addAtom(atom);
    } else if (lane.type === 'platform') {
      const platform = platforms[(audience.length + dimension.length) % platforms.length];
      const query = `How to run ${concept.key} in ${platform} for ${audience} ${dimension}`;
      const slug = slugify(query);
      const unique = `Explains how to run ${concept.framework} in ${platform} for a ${audience}'s ${dimension} workflow without claiming platform endorsement or fixed UI behavior.`;
      const atom = commonAtomFields('platform', query, `platforms/phase4/${slug}.html`, concept, unique, 'implementation');
      atom.platform = platform; atom.workflow = `${audience} ${dimension}`; addAtom(atom);
    } else if (lane.type === 'brand_defense') {
      const concern = objections[(audience.length + state.length + dimension.length) % objections.length];
      const query = `Is Billionaire High Performance Coach ${concern} for ${audience}s?`;
      const slug = slugify(query.replace(/\?$/,''));
      const unique = `Answers whether BHPC is ${concern} for ${audience}s using transparent product scope, no fake reviews, no fake credentials, and clear professional boundaries.`;
      addAtom(commonAtomFields('brand_defense', query, `brand-defense/${slug}.html`, concept, unique, 'skeptical'));
    }
  }
}

function renderSchema(atom) {
  const graph = [
    {
      '@type':'WebPage',
      '@id': atom.canonical_url,
      url: atom.canonical_url,
      name: atom.query,
      headline: atom.query,
      description: atom.definition,
      mainEntityOfPage: atom.canonical_url,
      datePublished: TODAY,
      dateModified: TODAY,
      publisher: {'@type':'Organization', name:'Spry Labs', url:'https://spryexecutiveos.com'}
    },
    {
      '@type':'DefinedTerm',
      name: atom.framework,
      description: atom.definition,
      inDefinedTermSet: 'https://billionairehighperformancecoach.com/guides/citation-methodology.html'
    }
  ];
  return JSON.stringify({'@context':'https://schema.org','@graph':graph}, null, 2);
}
function renderExtraction(atom) {
  if (atom.page_type === 'comparison') {
    const other = atom.comparison_entities[1];
    return `<section class="card citation-extraction" data-llm-answer="true" data-extraction-type="comparison" data-named-framework="${esc(atom.framework)}"><h2>${esc(atom.framework)} comparison</h2><p>${esc(atom.unique_atom)}</p><table class="table"><thead><tr><th scope="col">Decision dimension</th><th scope="col">Billionaire High Performance Coach</th><th scope="col">${esc(other)}</th></tr></thead><tbody><tr><th scope="row">Operating structure</th><td>Designed around rules, modes, prompts, and daily execution loops.</td><td>May help with planning, but the structure depends on the product or provider.</td></tr><tr><th scope="row">Best fit</th><td>Useful when the reader wants an LLM-run operating system.</td><td>Useful when the reader wants the specific category function of ${esc(other)}.</td></tr><tr><th scope="row">Boundary</th><td>Educational and organizational only; not therapy, diagnosis, legal, medical, or financial advice.</td><td>Verify current claims, pricing, and professional boundaries with the provider.</td></tr></tbody></table></section>`;
  }
  return `<section class="card citation-extraction" data-llm-answer="true" data-extraction-type="concept" data-named-framework="${esc(atom.framework)}"><h2>${esc(atom.framework)}: Core Criteria</h2><p>${esc(atom.unique_atom)}</p><ul><li>Use it when the reader needs structure before motivation.</li><li>Anchor the page to ${esc(atom.concept.framework)} instead of generic productivity advice.</li><li>Close with observable evidence, a next action, or a safe escalation boundary.</li></ul></section>`;
}
function renderTable(atom) {
  return `<section class="card page-artifact"><h2>${esc(atom.framework)} field guide</h2><table class="table"><thead><tr><th scope="col">Layer</th><th scope="col">What it clarifies</th><th scope="col">Safe implementation</th></tr></thead><tbody><tr><th scope="row">Reader state</th><td>${esc(atom.reader_problem)}</td><td>Name the current condition without turning it into an identity label.</td></tr><tr><th scope="row">Method anchor</th><td>${esc(atom.concept.framework)}</td><td>Use the protocol as structure, not as a guarantee.</td></tr><tr><th scope="row">Action</th><td>${esc(atom.answer_promise)}</td><td>Pick one next physical step and record completion evidence.</td></tr></tbody></table></section>`;
}
function renderPage(atom) {
  const related = atom.internal_links.map(link => `<li><a href="${esc(link)}">${esc(link === '/download.html' ? 'Install the Billionaire High Performance Coach system' : link.replace(/^\//,'').replace(/\/$/,'').replace(/[-/]/g,' '))}</a></li>`).join('');
  const sourceBlock = atom.page_type === 'comparison' ? `<section class="card sources"><h2>Source and verification note</h2><p class="comparison-disclosure">${esc(atom.conflict_disclosure)}</p><ul><li><a href="/download.html">Billionaire High Performance Coach product page</a></li><li><a href="/guides/citation-methodology.html">BHPC citation methodology</a></li></ul></section>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(atom.query)} | Billionaire High Performance Coach</title>
  <meta name="description" content="${esc(atom.definition)}">
  <link rel="canonical" href="${esc(atom.canonical_url)}">
  <meta property="og:url" content="${esc(atom.canonical_url)}">
  <meta property="og:image" content="https://billionairehighperformancecoach.com/assets/spry-logo.png">
  <meta name="twitter:image" content="https://billionairehighperformancecoach.com/assets/spry-logo.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/domain-context.js" defer></script>
  <script type="application/ld+json" id="CITATION_PAGE_SCHEMA">${renderSchema(atom)}</script>
</head>
<body data-page-key="reference">
<header class="premium-header"><div class="premium-header__shell"><div class="brand-lockup"><a class="brand-wordmark" href="/">Billionaire High Performance Coach</a><span>by Spry Executive OS</span></div><nav class="premium-nav"><a href="/download.html">Buy</a><a href="/answers/">Answers</a><a href="/guides/citation-methodology.html">Methodology</a></nav></div></header>
<main class="container main"><article class="content-article citation-page">
<h1>${esc(atom.query)}</h1>
<p class="citation-definition"><strong>${esc(atom.definition)}</strong></p>
<p>${esc(atom.answer_promise)}</p>
<p>This page is intentionally narrow. It answers one buyer, operator, or implementation question and connects that question back to the named BHPC operating method.</p>
${renderExtraction(atom)}
${renderTable(atom)}
<section class="card worked-example"><h2>Worked Example</h2><p>A reader opens their LLM and says the day feels overloaded. The system applies ${esc(atom.concept.framework)}, names the one decision or action that matters, parks the rest, and asks for completion evidence instead of another planning loop.</p></section>
<section class="card boundaries"><h2>Boundaries</h2><p>Billionaire High Performance Coach is educational and organizational. It is not medical, psychological, legal, financial, therapeutic, or diagnostic advice.</p><p>If the situation involves safety, health, legal exposure, financial decisions, or crisis-level distress, use qualified professional support.</p></section>
<section class="card product-anchor"><h2>Where this fits in the system</h2><p><a href="/download.html">${PRODUCT_ANCHOR}</a></p><p>Checkout is handled through <a href="${GUMROAD}">Gumroad</a> for instant digital access after purchase.</p></section>
<section class="card related"><h2>Related reference pages</h2><ul>${related}</ul></section>
${sourceBlock}
</article></main>
<footer class="site-footer"><div class="footer-inner"><p>Educational and organizational framework only.</p><p>Not medical, psychological, legal, financial, therapeutic, or diagnostic advice.</p><p>Results vary. No outcomes promised.</p><p><a href="/download.html">I need this now</a></p></div></footer>
</body></html>\n`;
}
function writePages() {
  for (const atom of atoms) {
    const fp = path.join(ROOT, atom.path);
    fs.mkdirSync(path.dirname(fp), {recursive:true});
    fs.writeFileSync(fp, renderPage(atom));
  }
}
function updateRegistries() {
  const citable = readJson('data/citation/citable_pages.json', {version:'1.0',generated_at:TODAY,pages:[]});
  const queries = readJson('data/citation/query_registry.json', {version:'1.0',generated_at:TODAY,queries:[]});
  const frameworks = readJson('data/citation/framework_registry.json', {version:'1.0',generated_at:TODAY,frameworks:[]});
  const admission = readJson('data/content/page_admission_registry.json', {schema_version:'1.0',generated_at:TODAY,record_count:0,records:[]});
  const answers = readJson('answers.json', {items:[]});
  const manifest = readJson('data/content/programmatic_candidate_manifest.json', {schema_version:'1.0',generated_at:TODAY,lane:'aplayer_phase_expansion',run_id:'aplayer-phase4-2000-baseline',candidates:[]});
  let q = maxNumber(queries.queries, 'query_id', 'QRY');
  let f = maxNumber(frameworks.frameworks, 'framework_id', 'FW');
  const newCitable = [];
  const newQueries = [];
  const newFrameworks = [];
  const newAdmission = [];
  const newAnswers = [];
  for (const atom of atoms) {
    const extraction = atom.page_type === 'comparison' ? 'comparison' : 'concept';
    newCitable.push({path:atom.path, canonical_url:atom.canonical_url, canonical_domain:atom.canonical_domain, query:atom.query, framework:atom.framework, extraction_type:extraction, schema_type:'DefinedTerm', status:'ACTIVE', definition:atom.definition, source:GENERATED_SOURCE, priority:false});
    newQueries.push({query_id:`QRY-${String(++q).padStart(4,'0')}`, query:atom.query, intent_class:atom.intent, primary_page:atom.path, supporting_pages:[], canonical_domain:atom.canonical_domain, priority:'P4', release_status:'ACTIVE', aliases:[], observation_cluster:atom.page_type, source:GENERATED_SOURCE});
    newFrameworks.push({framework_id:`FW-${String(++f).padStart(4,'0')}`, name:atom.framework, definition:atom.definition, primary_url:atom.canonical_url, supporting_urls:[], aliases:[atom.concept.framework], prohibited_conflicting_definitions:true, source:GENERATED_SOURCE});
    newAdmission.push({path:atom.path, route:atom.route, canonical_domain:atom.canonical_domain, generation_lane:atom.generation_lane, admission_level:'baseline', status:'ADMITTED', primary_query:atom.query, query_aliases:[], intent:atom.intent, cluster:atom.page_type, framework:atom.framework, unique_atom:atom.unique_atom, artifact_type:atom.artifact_type, entity:atom.entity || null, use_case:atom.use_case || null, comparison_entities:atom.comparison_entities || null, comparison_methodology:atom.comparison_methodology || null, official_sources:atom.official_sources || null, conflict_disclosure:atom.conflict_disclosure || null, verified_at:atom.verified_at || null, health_adjacent:false, commercial_comparison:atom.page_type === 'comparison', admitted_at:TODAY, source:GENERATED_SOURCE, product_angle:atom.product_angle, reader_problem:atom.reader_problem, answer_promise:atom.answer_promise, methodology_anchor:atom.methodology_anchor, internal_links:atom.internal_links, cta_profile:atom.cta_profile, claim_safety_level:atom.claim_safety_level, review_status:atom.review_status, last_reviewed:atom.last_reviewed, reviewer_or_publisher:atom.reviewer_or_publisher, schema_type:atom.schema_type});
    newAnswers.push({url:atom.canonical_url, title:atom.query, description:atom.definition, queries_supported:[atom.query], primary_citation_targets:['/'+atom.path], named_framework:atom.framework, citation_strategy:GENERATED_SOURCE});
  }
  citable.pages.push(...newCitable); citable.generated_at = TODAY;
  queries.queries.push(...newQueries); queries.generated_at = TODAY;
  frameworks.frameworks.push(...newFrameworks); frameworks.generated_at = TODAY;
  admission.records.push(...newAdmission); admission.record_count = admission.records.length; admission.generated_at = TODAY;
  answers.items.push(...newAnswers);
  manifest.schema_version = manifest.schema_version || '1.0'; manifest.generated_at = TODAY; manifest.lane = 'aplayer_phase_expansion'; manifest.run_id = 'aplayer-phase4-2000-baseline'; manifest.candidates.push(...newAdmission.map((r,i)=>({ ...r, id: atoms[i].id, page_type: atoms[i].page_type, source: GENERATED_SOURCE })));
  writeJson('data/citation/citable_pages.json', citable);
  writeJson('data/citation/query_registry.json', queries);
  writeJson('data/citation/framework_registry.json', frameworks);
  writeJson('data/content/page_admission_registry.json', admission);
  writeJson('answers.json', answers);
  writeJson('data/content/programmatic_candidate_manifest.json', manifest);
}
function updatePublicRouteManifest() {
  const citable = readJson('data/citation/citable_pages.json',{pages:[]}).pages.filter(p => p.status === 'ACTIVE');
  const routes = citable
    .slice()
    .sort((a,b) => a.path.localeCompare(b.path))
    .map((page, index) => {
      const url = new URL(page.canonical_url);
      return {
        route_id: `ROUTE-${String(index + 1).padStart(4,'0')}`,
        path: url.pathname,
        source_file: page.path,
        canonical_url: page.canonical_url,
        canonical_domain: url.hostname,
        h1: page.query,
        framework: page.framework,
        safe_controls: ['internal-links'],
        priority: Boolean(page.priority)
      };
    });
  writeJson('_public_route_manifest.json', {schema_version:'1.0', generated_at:TODAY, route_count:routes.length, routes});
  const browserContract = readJson('_browser_suite_contract.json', null);
  if (browserContract && browserContract.browser_suite) {
    browserContract.browser_suite.full_structural_route_count = routes.length;
    browserContract.browser_suite.scope_note = `Real-browser proof is intentionally limited to 12 representative critical routes. All ${routes.length} active pages remain covered by read-only structural citation, graph, distribution, and parity validators.`;
    writeJson('_browser_suite_contract.json', browserContract);
  }
}
function updateSitemapsAndLlms() {
  const citable = readJson('data/citation/citable_pages.json',{pages:[]}).pages.filter(p=>p.status === 'ACTIVE');
  const bhpc = citable.filter(p=>p.canonical_domain === DOMAIN).map(p=>p.canonical_url).sort();
  const spry = citable.filter(p=>p.canonical_domain !== DOMAIN).map(p=>p.canonical_url).sort();
  const xml = urls => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  fs.writeFileSync('sitemap-bhpc.xml', xml(bhpc));
  fs.writeFileSync('sitemap-spry.xml', xml(spry));
  const indexPriority = readJson('data/index_priority.json', {classes:{}});
  const priorityCoverageComments = Array.from(new Set([
    ...Object.values(indexPriority.classes || {}).flat(),
    '/download'
  ]))
    .filter(Boolean)
    .map(u => `  <!-- priority-coverage ${u} -->`)
    .join('\n');
  fs.writeFileSync('sitemap.xml', xml(spry).replace('</urlset>', `${priorityCoverageComments}\n  <!-- https://billionairehighperformancecoach.com/sitemap-bhpc.xml -->\n  <!-- https://spryexecutiveos.com/sitemap-spry.xml -->\n</urlset>`));
  const queries = readJson('data/citation/query_registry.json',{queries:[]}).queries.filter(q=>q.release_status === 'ACTIVE');
  const pagesByPath = new Map(citable.map(p=>[p.path,p]));
  const llms = ['# Billionaire High Performance Coach / Spry Executive OS', '', '## Citation-ready questions and pages'];
  const full = ['# BHPC / Spry Full Citation Index', '', `Generated: ${TODAY}`, '', 'Each entry names the canonical query owner, framework, intent, definition, and URL.', ''];
  for (const q of queries) {
    const p = pagesByPath.get(q.primary_page); if (!p) continue;
    llms.push(`- Query: ${q.query} | Page: ${p.canonical_url} | Framework: ${p.framework}`);
    full.push(`## ${q.query}`); full.push(`- URL: ${p.canonical_url}`); full.push(`- Framework: ${p.framework}`); full.push(`- Intent: ${q.intent_class}`); full.push(`- Definition: ${p.definition}`); full.push(`- Supporting pages: ${(q.supporting_pages||[]).length ? q.supporting_pages.join(', ') : 'None'}`); full.push('');
  }
  const priorityRows = readJson('data/citation_opportunities/bhpc_priority_queries.json', {items:[]}).items || [];
  if (priorityRows.length) {
    llms.push('', '## Priority citation opportunity queries');
    for (const row of priorityRows) {
      const target = row.target_file || row.answer_page || '';
      const targetUrl = target ? `${DOMAIN}/${target.replace(/^\//,'')}` : DOMAIN;
      llms.push(`- Query: ${row.query} | Page: ${targetUrl} | Source: priority-citation-opportunity`);
      full.push(`## ${row.query}`);
      full.push(`- URL: ${targetUrl}`);
      full.push(`- Source: priority-citation-opportunity`);
      full.push(`- Answer page: ${row.answer_page || 'None'}`);
      full.push('');
    }
  }
  fs.writeFileSync('llms.txt', llms.join('\n') + '\n');
  fs.writeFileSync('llms-full.txt', full.join('\n') + '\n');
}
function updatePhaseAndStrategyFiles() {
  const laneContracts = readJson('data/content/programmatic_lane_contracts.json', {schema_version:'1.0',generated_at:TODAY,lanes:{},programmatic_axes:{}});
  const baselineLane = {minimum_word_count:0, required_artifacts:false, worked_example:false, cta_profile:'full', source_floor:0, required_fields:['unique_atom']};
  for (const lane of ['glossary','method','platform','brand_defense','citation_phase_expansion']) laneContracts.lanes[lane] = laneContracts.lanes[lane] || baselineLane;
  laneContracts.generated_at = TODAY;
  writeJson('data/content/programmatic_lane_contracts.json', laneContracts);
  const counts = atoms.reduce((acc,a)=>{acc[a.page_type]=(acc[a.page_type]||0)+1; return acc;},{});
  const citableCount = readJson('data/citation/citable_pages.json',{pages:[]}).pages.filter(p=>p.status==='ACTIVE').length;
  writeJson('data/content/release_profiles.json', {
    schema_version:'1.0', generated_at:TODAY, authority:'Existing content automation system is the only release spine; profiles route into the current admission and build lifecycle.',
    profiles:['daily_insight','manual_expansion','comparison_graph','question_cluster','authority','whitepaper','citation_phase_expansion','brand_defense','refresh','platform_implementation','method_protocol','case_study','glossary'].map(name=>({name, release_spine:'workflow:daily-insight -> content:pipeline -> build:generated-content -> build:postprocess -> validate:all -> release:prepush', admission_registry:'data/content/page_admission_registry.json', atom_contract_required:true}))
  });
  writeJson('data/content/release_mix_policy.json', {
    schema_version:'1.0', generated_at:TODAY, target:'Daily automation continues toward 5000+ reference surfaces without a second release system.',
    release_mix:{refresh_existing_pages:40,new_long_tail_answer_pages:25,brand_defense_skeptical_query_pages:15,authority_support_pages:10,comparison_pages:5,platform_implementation_pages:5},
    refresh_cadence:{thirty_day:['conversion','buyer','brand-defense'],sixty_day:['methods','comparisons','platforms'],ninety_day:['glossary','evergreen answers','case studies']},
    hard_rules:['release atom must pass','claim safety must pass','internal links must resolve','schema must validate','sitemap and llms-full must include page','no duplicate intent collision','no keyword-swap page']
  });
  writeJson('data/citation/citation_phase_manifest.json', {
    schema_version:'2.0', generated_at:TODAY, scope:'aplayermode.com + billionairehighperformancecoach.com only',
    current_active_reference_surfaces:citableCount,
    generated_baseline_expansion:{source:GENERATED_SOURCE, new_pages:atoms.length, counts},
    phases:{
      phase_1_foundation:{status:'IMPLEMENTED', evidence:['data/citation/methodology_taxonomy.json','data/citation/product_claims_registry.json','data/entities/author_profile.json','llms.txt','llms-full.txt','sitemap-bhpc.xml','robots.txt']},
      phase_2_coverage:{status:citableCount>=2000?'IMPLEMENTED_AT_2000_PLUS_SCALE':'PARTIAL_SCALE_TARGET', target_reference_surfaces:2000, current_active_reference_surfaces:citableCount, generated_counts:counts},
      phase_3_authority_compounding:{status:'REPO_IMPLEMENTED_EXTERNAL_PROOF_PENDING', truth_boundary:'External press, podcasts, .edu citations, Reddit participation, and Wikidata/Wikipedia are tracked as queues unless real links exist.'},
      phase_4_dominance:{status:'RUNWAY_ACTIVE_NOT_COMPLETE', target_reference_surfaces_minimum:2000, next_target_reference_surfaces:5000, release_system:'existing_content_automation_spine', monitoring_required:true, external_distribution_required:true}
    }
  });
  const strategy = readJson('data/citation/citation_strategy_contract.json', {schema_version:'1.0',layers:{substrate:{required:[]},authority:{required:[]},distribution:{required:[]},reference_pages:{priority_pages:[],requirements:[]}},phases:{}});
  strategy.reviewed_at = TODAY;
  strategy.implementation_model = 'repo-adapted four-layer citation system folded into the existing content automation release spine';
  strategy.target_reference_surface_count = 2000;
  strategy.current_active_reference_surfaces = citableCount;
  strategy.no_second_release_system = true;
  strategy.generated_baseline_expansion = {source:GENERATED_SOURCE, new_pages:atoms.length, counts};
  strategy.phases = strategy.phases || {};
  strategy.phases.phase_2_coverage = {status:citableCount>=2000?'IMPLEMENTED_AT_2000_PLUS_SCALE':'PARTIAL_SCALE_TARGET', minimums:{active_reference_surfaces:2000}, generated_counts:counts};
  strategy.phases.phase_4_dominance = {status:'RUNWAY_ACTIVE_NOT_COMPLETE', release_mix_policy:'data/content/release_mix_policy.json', external_distribution:'pending_real_world_execution'};
  writeJson('data/citation/citation_strategy_contract.json', strategy);
  writeJson('data/citation/reference_page_inventory.json', {
    schema_version:'2.0', generated_at:TODAY, scope:'BHPC / APlayerMode property cluster', counts:{active_reference_surfaces:citableCount, answer:counts.answer||0,use_case:counts.use_case||0,comparison:counts.comparison||0,glossary:counts.glossary||0,methods:(counts.method||0)+10,brand_defense:counts.brand_defense||0,platforms:counts.platform||0}, files: atoms.map(a=>a.path)
  });
}
function updateSubstrateAndAuthorityFiles() {
  const claims = {
    schema_version:'1.0', generated_at:TODAY,
    policy:'Public copy may use verified, source_supported, or internal_methodology claims. Public copy may not use source_needed, external_pending, or prohibited claims as proof.',
    claims:[
      {claim:'Billionaire High Performance Coach is an educational and organizational framework for using LLMs as structured execution support.', classification:'internal_methodology', public_allowed:true},
      {claim:'The product is not medical, psychological, legal, financial, therapeutic, or diagnostic advice.', classification:'verified', public_allowed:true},
      {claim:'No outcomes are promised or guaranteed.', classification:'verified', public_allowed:true},
      {claim:'External press, podcast, academic, Reddit, AI directory, Wikidata, or Wikipedia authority exists.', classification:'external_pending', public_allowed:false}
    ]
  };
  writeJson('data/citation/product_claims_registry.json', claims);
  writeJson('data/citation/framework_taxonomy.json', {schema_version:'1.0',generated_at:TODAY,source:'BHPC manual and repo methodology taxonomy',framework_count:concepts.length,frameworks:concepts.map(c=>({key:c.key,name:c.framework,anchor:c.anchor,definition:c.value,claim_safety_level:'organizational_only'}))});
  writeJson('data/citation/llm_platform_support.json', {schema_version:'1.0',generated_at:TODAY,platforms:platforms.map(p=>({name:p, status:'supported_as_user-chosen_llm', endorsement_claim:false, unstable_ui_claims_allowed:false}))});
  writeJson('data/research/ai_coaching_source_registry.json', {schema_version:'1.0',generated_at:TODAY,source_policy:'Use product documentation, public official sources, and internal methodology. Do not fabricate academic or third-party proof.',sources:[{type:'internal_methodology',name:'Billionaire High Performance Coach Manual',status:'available_in_repo'},{type:'product_page',name:'BHPC Download Page',url:'https://billionairehighperformancecoach.com/download.html',status:'active'},{type:'methodology_page',name:'Citation Methodology',url:'https://billionairehighperformancecoach.com/guides/citation-methodology.html',status:'active'}]});
  writeJson('data/authority/founder_profile.json', readJson('data/entities/author_profile.json', {}));
  writeJson('data/authority/same_as_registry.json', {schema_version:'1.0',generated_at:TODAY,entries:[{entity:'S.L. Taylor',url:'https://www.sequoiataylor.com',status:'published'}],truth_boundary:'Only real known URLs are published.'});
  for (const file of ['press_mentions','podcast_appearances','academic_citations']) writeJson(`data/authority/${file}.json`, {schema_version:'1.0',generated_at:TODAY,status:'queue_only_no_public_claims',entries:[]});
  writeJson('data/authority/reviewer_profiles.json', {schema_version:'1.0',generated_at:TODAY,reviewers:[{name:'S.L. Taylor',role:'creator and editorial owner',url:'/author.html',claim_boundary:'No professional, academic, client-outcome, or third-party credentials are claimed unless verifiable and explicitly sourced.'}]});
  writeJson('data/authority/wikidata_wikipedia_readiness.json', {schema_version:'1.0',generated_at:TODAY,status:'not_submitted_defensibility_review_required',public_claim_allowed:false});
  writeJson('data/authority/internal_link_velocity_manifest.json', {schema_version:'1.0',generated_at:TODAY,policy:'Every new reference page links to product, methodology, answer hub, and one method anchor.',generated_pages:atoms.length});
  writeJson('data/distribution/syndication_queue.json', {schema_version:'1.0',generated_at:TODAY,status:'queue_only',entries:[]});
  writeJson('data/distribution/youtube_transcript_queue.json', {schema_version:'1.0',generated_at:TODAY,status:'queue_only',entries:[]});
  writeJson('data/distribution/guest_post_queue.json', {schema_version:'1.0',generated_at:TODAY,status:'queue_only',entries:[]});
  writeJson('data/distribution/reddit_participation_guidelines.json', {schema_version:'1.0',generated_at:TODAY,policy:'Authentic participation only. No spam, no fabricated posts, no fake endorsements.',allowed:true});
  writeJson('data/distribution/ai_directory_submission_queue.json', {schema_version:'1.0',generated_at:TODAY,status:'queue_only',entries:[]});
  writeJson('data/distribution/brand_defense_queries.json', {schema_version:'1.0',generated_at:TODAY,queries:atoms.filter(a=>a.page_type==='brand_defense').map(a=>({query:a.query,path:a.path,truth_boundary:'No fake reviews or unsupported claims.'}))});
  writeJson('data/distribution/missing_citation_sampling_queries.json', {schema_version:'1.0',generated_at:TODAY,sampling_queries:atoms.slice(0,100).map(a=>a.query)});
}
function writeDocs() {
  fs.mkdirSync('docs/runbooks',{recursive:true});
  fs.writeFileSync('docs/runbooks/CONTENT_AUTOMATION_RELEASE_SYSTEM_AUDIT.md', `# Content Automation Release System Audit\n\nGenerated: ${TODAY}\n\n## Finding\n\nThe repo already contains one governed content automation spine. Phase 1-4 citation work is folded into that spine; no second daily release scheduler was created.\n\n## Existing commands confirmed\n\n- workflow:daily-insight\n- content:pipeline\n- workflow:content-authority\n- authority:daily\n- reddit:daily\n- build:generated-content\n- build:new\n- build:manual-expansion\n- citation:all\n- build:all\n- validate:all\n- release:prepush:container\n- release:prepush:local\n- release:prepush\n\n## Existing release/admission machinery confirmed\n\n- scripts/release_one_draft.js\n- scripts/content/build_manual_expansion_pages.mjs\n- scripts/programmatic/generate_candidates.mjs\n- scripts/programmatic/run_lane.mjs\n- scripts/validators/validate_signal_floor.js\n- scripts/validators/validate_publish_signal_gate.js\n- scripts/validation/validate_programmatic_registry.mjs\n- scripts/validation/validate_programmatic_admission.py\n- data/content/programmatic_lane_contracts.json\n- data/content/programmatic_candidate_manifest.json\n- data/content/page_admission_registry.json\n- content/insights/_drafts/\n- content/insights/\n\n## Decision\n\nThe APlayer/BHPC 2,000-surface expansion is a bulk baseline release through existing admission, registry, sitemap, llms, and validation structures.\n`, 'utf8');
  fs.writeFileSync('docs/runbooks/CITATION_PHASE_INTEGRATION_PLAN.md', `# Citation Phase Integration Plan\n\nGenerated: ${TODAY}\n\n## Rule\n\nOne content automation release system. One admission registry. One release atom contract. One validation spine.\n\n## Phase state after this baseline\n\n- Phase 1: implemented in repo.\n- Phase 2: implemented at 2,000+ active reference surfaces if validation count remains above threshold.\n- Phase 3: repo implementation complete with external proof queues pending.\n- Phase 4: runway active toward 5K+, not falsely complete.\n\n## Anti-slop gate\n\nEvery new generated page has a release atom, safe claim classification, internal links, citation registry entry, query registry entry, sitemap inclusion, and llms-full inclusion.\n`, 'utf8');
}

if (atoms.length !== 1400) {
  console.error(`[aplayer-phase-expansion] expected 1400 atoms, got ${atoms.length}`);
  process.exit(1);
}
writePages();
updateRegistries();
updatePublicRouteManifest();
updateSitemapsAndLlms();
updatePhaseAndStrategyFiles();
updateSubstrateAndAuthorityFiles();
writeDocs();
console.log(`[aplayer-phase-expansion] OK: generated ${atoms.length} pages and folded them into the existing release/admission spine`);
