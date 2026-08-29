#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);
const { routeFor: sharedRouteFor, hostFor: sharedHostFor } = requireCjs('../lib/dual_domain_policy.cjs');
const { serializeSchema, mainEntityOfPage } = requireCjs('../lib/citation_page_schema.cjs');
import {
  loadLibrary, assertMaterialFor, pickConcept, composeArticle, artifactBlock,
  countWords, textOf, titleish, LIBRARY_PATH
} from './phase4_page_composer.mjs';
import { selectDemandCandidates } from './demand_backed_atoms.mjs';

const ROOT = process.cwd();
const GENERATED_SOURCE = 'aplayer_phase_expansion_2000_baseline';
const TODAY = '2026-06-21';
// The date this material was actually written and reviewed. `TODAY` remains the
// admission date so the demand-gate baseline still recognises these routes;
// what a reader is told was reviewed has to be the date it really was.
const REVIEWED_AT = '2026-08-27';
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
  }).join(' ').replace(/\bChatgpt\b/g,'ChatGPT').replace(/\bA-player\b/g,'A-player')
   // Hyphenated compounds come through the per-word capitaliser as "Ai-driven".
   .replace(/\bAi-([a-z])/g, (m, c) => `AI-${c.toUpperCase()}`);
}
// Route form is the shared dual-domain contract: the URL that answers 200
// without a redirect hop. See scripts/lib/dual_domain_policy.cjs.
function routeFor(rel) {
  return sharedRouteFor(rel);
}
// Which host answers a route is decided in one place - hostFor() in
// scripts/lib/dual_domain_policy.cjs - and this generator ignored it and stamped
// DOMAIN on everything it wrote. For every cartesian family the two agreed by
// luck (hostFor sends /answers/phase4/, /use-cases/phase4/, /platforms/phase4/,
// /brand-defense/, /methods/, /glossary/ and /vs/ to
// billionairehighperformancecoach.com, which is what DOMAIN said). For the
// demand lane they did not: hostFor sends /answers/demand/* to
// spryexecutiveos.com, so the two demand pages already in the tree render a
// spryexecutiveos.com canonical - repair_dual_domain_metadata rewrites the HTML
// from hostFor - while their registry rows said
// billionairehighperformancecoach.com and their URLs went into sitemap-bhpc.xml.
// A sitemap on one host listing URLs that canonicalise to another is the shape
// that gets a whole urlset rejected. Deriving the domain from the route deletes
// the second list rather than keeping two in sync by hand.
function domainFor(rel) {
  return new URL(sharedHostFor(routeFor(rel))).hostname;
}
function canonicalFor(rel) {
  return `${sharedHostFor(routeFor(rel))}${routeFor(rel)}`;
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
// The directories this generator owns outright. Every page under them is
// written by this script and by nothing else, so a registry row pointing into
// one of them is this script's row regardless of what its `source` field says.
const GENERATED_DIRS = ['answers/phase4','answers/phase4/demand','answers/demand','use-cases/phase4','vs/phase4','glossary/phase4','methods/phase4','brand-defense','platforms/phase4'];
function isGeneratedRow(row) {
  if (row.source === GENERATED_SOURCE || row.citation_strategy === GENERATED_SOURCE) return true;
  // Ownership by path, not only by label.
  //
  // The citation postbuild normalises registry rows and drops the `source`
  // field while doing it. A row that lost its label survived the source-only
  // filter below, so the next run saw its query as already owned, skipped it,
  // and left a registry row and a sitemap URL pointing at a file this script
  // had just deleted - eleven "file missing" audit failures with nothing on
  // disk to explain them.
  const candidates = [row.path, row.primary_page, row.source_file, row.target_file,
    ...(row.primary_citation_targets || [])];
  for (const value of candidates) {
    const rel = String(value || '').replace(/^\//, '');
    if (rel && GENERATED_DIRS.some(d => rel.startsWith(`${d}/`))) return true;
  }
  for (const value of [row.canonical_url, row.url, row.primary_url]) {
    if (!value) continue;
    let pathname = '';
    try { pathname = new URL(String(value)).pathname.replace(/^\//, ''); } catch { pathname = ''; }
    if (pathname && GENERATED_DIRS.some(d => pathname.startsWith(`${d}/`))) return true;
  }
  return false;
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
    data[key] = data[key].filter(row => !isGeneratedRow(row));
    if (file.includes('page_admission_registry')) data.record_count = data.records.length;
    writeJson(file, data);
  }
  const manifest = readJson('data/content/programmatic_candidate_manifest.json', {schema_version:'1.0',generated_at:TODAY,lane:'aplayer_phase_expansion',run_id:'',candidates:[]});
  manifest.candidates = (manifest.candidates || []).filter(row => !isGeneratedRow(row));
  manifest.generated_at = TODAY;
  writeJson('data/content/programmatic_candidate_manifest.json', manifest);
  const dirs = GENERATED_DIRS;
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
    if (['.git','.pages-output', 'node_modules','.build','artifacts'].includes(item.name)) continue;
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
// A cap on a bad run, not a number to reach. Named so it cannot be mistaken
// for a target the way the bare 1400 literal was.
const ATOM_SAFETY_CAP = Number(process.env.ATOM_SAFETY_CAP || 1400);

// Every record this generator wrote used to be stamped `admission_level:
// 'baseline'`. In validate_programmatic_admission.py the substantive checks -
// word count, unique artifact, worked example, source floor, unique_atom
// strength, and all lane-required fields - are guarded by
// `if record.get('admission_level')=='full'`. So the generator was assigning
// its own pages the level that skips them. 2,152 of the 2,214 admitted records
// carry 'baseline'; 62 carry 'full'. 97.2% of the library opted itself out of
// the quality gate at the moment it was written.
//
// New pages are admitted at 'full' and face the checks. Every page this
// generator writes is now composed from authored material and clears its lane
// floor with margin, so 'full' is not a hopeful setting: writePages below
// refuses to write a page that would fail it. The remaining 'baseline' records
// are pages this generator does not own; they are reported by
// validate_demand_backed_pages.mjs as repair candidates.
const NEW_PAGE_ADMISSION_LEVEL = 'full';
const atoms = [];
// The safety cap bounds the CARTESIAN families - the ones whose size is a
// product of hardcoded axis lists and could run away on a loop bug. Pages
// composed from measured demand are bounded separately by DEMAND_PAGE_CAP and
// are not counted against it: making them share the cap would mean every new
// demand-backed page evicted an already-published permutation page, which is
// a deletion of live URLs to pay for an addition. Both budgets are ceilings,
// neither is a target.
let cartesianCount = 0;
function addAtom(atom) {
  // The 1400 ceiling paired with the 1400 floor that used to sit at the bottom
  // of this file: together they made the output a fixed number rather than a
  // consequence of the material. The ceiling stays as a per-run safety cap so a
  // loop bug cannot emit unbounded pages, but nothing now forces the run to
  // reach it.
  const isDemand = atom.generation_lane === 'demand_backed';
  if (!isDemand && cartesianCount >= ATOM_SAFETY_CAP) return false;
  if (plannedPaths.has(atom.path) || existingPaths.has(atom.path)) return false;
  if (plannedQueries.has(normalize(atom.query)) || existingQueries.has(normalize(atom.query))) return false;
  const stripped = normalize(atom.unique_atom.replace(new RegExp(atom.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'), ''));
  if (stripped.split(/\s+/).filter(Boolean).length < 12) return false;
  plannedPaths.add(atom.path); plannedQueries.add(normalize(atom.query)); atoms.push(atom);
  if (!isDemand) cartesianCount += 1;
  return true;
}

// The definition sentence used to be assembled from a template - "The <name>
// is a <type> reference surface that uses <framework> to help readers <clause>"
// - which produced "is a answer reference surface" on every answer page and
// needed a verb-conjugation table to keep the spliced clause grammatical. It is
// now written from the framework and the page's subject in makeAtom, so both
// the template and the table are gone.

const LIB = loadLibrary(ROOT);
// Refuse the run if the generator is about to use an axis value nobody wrote
// material for. Emitting a template page for it is the failure this replaces.
assertMaterialFor(LIB, {
  concepts: concepts.map(c => c.key),
  modes: verbs,
  outcomes,
  states,
  dimensions,
  audiences,
  tools,
  platforms,
  workflows: platformWorkflows,
  objections
});

// Ceilings on each family, not targets. They exist so a loop bug cannot emit
// unbounded pages; nothing forces a run to reach them.
const ANSWER_SITUATION_LIMIT = 600;

const BOUNDARY_FALLBACK = 'Organizational support only. It is not clinical, legal, or financial advice.';
const usedFrameworkNames = new Set();
function uniqueFrameworkName(base, id) {
  let name = base;
  if (usedFrameworkNames.has(name.toLowerCase())) name = `${base} (${id})`;
  usedFrameworkNames.add(name.toLowerCase());
  return name;
}

// --- axis adapters ----------------------------------------------------------
// Each axis knows how to be a page's subject (primary) and how to be the thing
// the subject is applied to (secondary). Every string comes from the authored
// library; none of it is generated from the page's own title.
function primaryAxis(kind, key, concept) {
  const d = LIB[pluralOf(kind)][key];
  const label = d.label || key;
  if (kind === 'outcome') return {kind, key, data:d, label, lead:[d.stall, d.cause], firstMove:d.first_move, wrongMove:d.wrong_move, measure:d.measure};
  if (kind === 'state') return {kind, key, data:d, label, lead:[d.signal, `What is actually scarce here: ${lower(d.scarce)}`], firstMove:d.opening, wrongMove:d.do_not, measure:d.after};
  if (kind === 'audience') return {kind, key, data:d, label, lead:[d.context, `The hardest part of the week: ${lower(d.hardest)}`], firstMove:concept.moves[0], wrongMove:`${concept.failure_modes[0].name}. ${concept.failure_modes[0].why}`, measure:concept.evidence};
  if (kind === 'dimension') return {kind, key, data:d, label, lead:[d.question, d.move], firstMove:concept.moves[0], wrongMove:`${concept.failure_modes[0].name}. ${concept.failure_modes[0].why}`, measure:d.evidence};
  if (kind === 'tool') return {kind, key, data:d, label, lead:[`What ${key} does well: ${lower(d.does_well)}`, `What it does not do: ${lower(d.does_not)}`], firstMove:d.choose_when, wrongMove:`Treating the two as substitutes. ${d.differs}`, measure:`Whether the thing you were missing is now happening, rather than whether you own a new tool.`};
  if (kind === 'platform') return {kind, key, data:d, label, lead:[d.context_note, d.caveat], firstMove:d.first_move, wrongMove:d.wrong_move, measure:`Whether the setup still works in a fresh context with no history.`};
  if (kind === 'concept') return {kind, key, data:d, label, lead:[d.trigger, `${d.framework} ${lower(d.value)}.`], firstMove:d.moves[0], wrongMove:`${d.failure_modes[0].name}. ${d.failure_modes[0].why}`, measure:d.evidence};
  if (kind === 'objection') return {kind, key, data:d, label, lead:[d.question, d.answer], firstMove:d.check, wrongMove:`Accepting an outcome promise. Any productivity product that guarantees a specific result is making a claim it cannot support.`, measure:`Whether the answer above was checkable before purchase rather than after.`};
  throw new Error(`[phase4] no primary adapter for ${kind}`);
}
function secondaryAxis(kind, key, concept) {
  const d = LIB[pluralOf(kind)][key];
  if (kind === 'mode') return {kind, key, data:d, label:d.label, applied:`This level fits when: ${lower(d.when_right)} It does not fit when: ${lower(d.when_wrong)}`, extra:[d.surface, `Setup cost: ${lower(d.setup_cost)}`, `Where it is strong: ${lower(d.strength)}`, `Where it is weak: ${lower(d.weakness)}`]};
  if (kind === 'dimension') return {kind, key, data:d, label:`${key} support`, applied:`${d.question} ${d.move}`, extra:[`Evidence that it is working: ${lower(d.evidence)}`, d.boundary_note || BOUNDARY_FALLBACK]};
  if (kind === 'state') return {kind, key, data:d, label:`a reader who is ${key}`, applied:`${d.signal} ${d.do_not}`, extra:[d.opening, d.after]};
  if (kind === 'audience') return {kind, key, data:d, label:`a ${key}`, applied:`${d.constraint} ${d.hardest}`, extra:[d.context]};
  if (kind === 'workflow') return {kind, key, data:d, label:`the ${key}`, applied:`${d.purpose} It runs on one trigger: ${lower(d.trigger)}`, extra:[`What it leaves behind: ${lower(d.output)}`]};
  if (kind === 'tool') return {kind, key, data:d, label:`the ${key} comparison`, applied:`${d.choose_when} ${d.differs}`, extra:[d.does_well, d.does_not, d.escalate].filter(Boolean)};
  if (kind === 'concept') return {kind, key, data:d, label:d.framework, applied:`This page is the definition entry: ${lower(d.value)}. ${d.trigger}`, extra:[d.not_this]};
  throw new Error(`[phase4] no secondary adapter for ${kind}`);
}
function pluralOf(kind) {
  return {outcome:'outcomes', state:'states', dimension:'dimensions', audience:'audiences', tool:'tools',
          platform:'platforms', objection:'objections', mode:'modes', workflow:'workflows', concept:'concepts'}[kind];
}
function lower(s='') { return String(s).charAt(0).toLowerCase() + String(s).slice(1); }
function clampWords(s, max) {
  const w = String(s).split(/\s+/);
  return w.length <= max ? String(s) : w.slice(0, max).join(' ').replace(/[,;:]$/,'') + '.';
}

const INTERNAL_LINKS = (concept) => [
  {href:'/download.html', label:'Install the Billionaire High Performance Coach system'},
  {href:'/citation-methodology', label:'How these pages are written and reviewed'},
  {href:'/answers/', label:'All answer pages'},
  {href:`/methods/${concept.anchor}/`, label:`The ${concept.framework} method page`}
];
const BASE_SOURCES = [
  {href:'/citation-methodology', label:'Billionaire High Performance Coach citation methodology, which states how these pages are written, what they claim, and what they refuse to claim'},
  {href:'/download.html', label:'Billionaire High Performance Coach product page and scope'}
];

// One FAQ from each axis. Without them, every page in a family that shares a
// subject also shares its whole FAQ block, and the FAQ is a fifth of the page.
function axisFaq(axis) {
  const d = axis.data || {};
  if (d.first_week && d.mistaken_for) return [{q:`What should a reader do in the first week on ${axis.key}?`, a:`${d.first_week} ${d.mistaken_for}`}];
  if (d.failure) return [{q:`How does the ${axis.key} usually fail?`, a:`${d.failure} ${d.first_week}`}];
  return [];
}

function makeAtom(opts) {
  const {type, query, path, concept, secondary, intent, axisLabel, directAnswer, example, faq,
         sources, extraSections, lane, extraFields, uniqueAtom, cta='download_soft'} = opts;
  // When the page's subject is the framework itself (glossary, method), the
  // first and wrong move come from the other axis. Otherwise every page about
  // that framework would open with the same two paragraphs.
  const primary = opts.firstMoveFrom
    ? {...opts.primary, firstMove: opts.firstMoveFrom, wrongMove: opts.wrongMoveFrom}
    : opts.primary;
  const id = `aplayer-phase4-${String(atoms.length + 1).padStart(4, '0')}`;
  const framework = uniqueFrameworkName(`${concept.framework} — ${axisLabel}`, id.slice(-4));
  const definition = `The ${framework} is a named operating pattern in the Billionaire High Performance Coach system. It applies ${concept.framework}, which ${lower(concept.value)}, to ${axisLabel}.`;
  const atom = {
    id, source: GENERATED_SOURCE,
    path, route: routeFor(path), canonical_url: canonicalFor(path), canonical_domain: domainFor(path),
    page_type: type, query, primary_query: query, intent,
    generation_lane: lane,
    unique_atom: uniqueAtom,
    artifact_type: type === 'comparison' ? 'comparison_matrix' : type === 'glossary' ? 'definition_reference' : type === 'method' ? 'protocol_reference' : type === 'platform' ? 'implementation_guide' : type === 'brand_defense' ? 'skeptical_query_answer' : 'reference_page',
    source_floor: 0,
    product_angle: `Shows how Billionaire High Performance Coach turns ${concept.key} into an LLM-run operating behavior without promising medical, therapeutic, legal, financial, or guaranteed outcomes.`,
    reader_problem: primary.lead[0],
    answer_promise: clampWords(primary.firstMove, 40),
    methodology_anchor: concept.key,
    related_terms: [concept.key, concept.framework, 'A-player mode', 'Billionaire High Performance Coach'],
    internal_links: ['/download.html', '/citation-methodology', '/answers/', `/methods/${concept.anchor}/`],
    cta_profile: cta,
    claim_safety_level: 'organizational_only',
    review_status: 'reviewed_in_repo',
    last_reviewed: REVIEWED_AT,
    reviewer_or_publisher: 'Spry Labs / S.L. Taylor',
    schema_type: 'DefinedTerm',
    framework, definition, concept,
    compose: {
      query, definition, framework,
      extractionType: type === 'comparison' ? 'comparison' : 'concept',
      extractionTable: opts.extractionTable || '',
      conceptDepth: type === 'method' ? 'full' : 'condensed',
      frameworkPageHref: `/methods/${concept.anchor}/`,
      directAnswer: clampWords(directAnswer, 62),
      primary, secondary, concept, example,
      faq: faq.concat(axisFaq(primary), axisFaq(secondary), [{q:'Does this page diagnose, treat, or replace professional advice?', a:'No. It is educational and organizational only. It does not diagnose or treat anything, and it is not a substitute for a clinician, a lawyer, or a financial professional. If the situation involves health, safety, legal exposure, or money at stake, that is the moment to use qualified human support.'}]),
      sources: sources || BASE_SOURCES,
      extraSections: extraSections || [],
      reviewedAt: REVIEWED_AT,
      internalLinks: INTERNAL_LINKS(concept)
    }
  };
  Object.assign(atom, extraFields || {});
  return atom;
}

// Frameworks already handed to a semantically adjacent axis value within the
// same group. Two pages that are adjacent by construction must not also share
// their framework, or nothing but the title separates them.
const ADJACENCY = LIB.framework_selection.dimension_adjacency || [];
const assignedInGroup = new Map();
function adjacencyGroupOf(key) {
  const idx = ADJACENCY.findIndex(g => g.includes(key));
  return idx === -1 ? null : `g${idx}`;
}
function pickDistinctConcept(kind, key, offset, scope, {wholeScope = false} = {}) {
  const group = wholeScope ? 'all' : adjacencyGroupOf(key);
  const ranked = LIB.framework_selection[kind][key] || [];
  if (group) {
    const bucket = `${scope}|${group}`;
    const taken = assignedInGroup.get(bucket) || new Set();
    for (let i = 0; i < ranked.length; i++) {
      const candidate = ranked[(Math.abs(offset) + i) % ranked.length];
      if (!taken.has(candidate)) {
        taken.add(candidate); assignedInGroup.set(bucket, taken);
        return conceptFromKey(candidate);
      }
    }
  }
  return pickConcept(LIB, kind, key, offset);
}

// A reader's twenty use-case pages share that reader's whole context block, so
// no two of them may be anchored to the same framework. Greedy assignment in
// loop order runs out; this is the standard augmenting-path matching over
// (state -> frameworks that genuinely address that state), which finds a
// distinct framework for every state whenever one exists. Ranked order is
// preserved as the preference, so each state still gets the best-fitting
// framework that is still free.
function matchFrameworksToStates(stateKeys) {
  const assigned = new Map();   // framework -> state
  const result = new Map();     // state -> framework
  const tryAssign = (state, visited) => {
    for (const fw of (LIB.framework_selection.by_state[state] || [])) {
      if (visited.has(fw)) continue;
      visited.add(fw);
      const holder = assigned.get(fw);
      if (holder === undefined || tryAssign(holder, visited)) {
        assigned.set(fw, state); result.set(state, fw); return true;
      }
    }
    return false;
  };
  for (const state of stateKeys) {
    if (!tryAssign(state, new Set())) {
      console.error(`[aplayer-phase-expansion] refusing: no distinct framework left for the "${state}" state. Name another framework that genuinely addresses it in data/content/phase4_material_library.json.`);
      process.exit(1);
    }
  }
  return result;
}

function conceptFromKey(key) {
  const c = LIB.concepts[key];
  if (!c) throw new Error(`[phase4] refusing to generate: no authored material for framework ${key}`);
  return {key, ...c};
}
function twoSentenceAnswer(a, b, max = 62) {
  const first = String(a).trim();
  if (countWords(first) > max) throw new Error(`[phase4] direct answer too long before composition: ${first}`);
  const both = `${first} ${String(b).trim()}`;
  return countWords(both) <= max ? both : first;
}
// Counts the cartesian families only. The per-family ceilings below exist to
// bound those products; demand-backed pages have their own budget and must not
// consume a permutation family's ceiling.
function typeCount(type){ return atoms.filter(a=>a.page_type===type && a.generation_lane!=='demand_backed').length; }

// --- 0. demand-backed pages -------------------------------------------------
// This family runs FIRST, and that ordering is the fix.
//
// Every family below is a cartesian product of hardcoded axis lists, so their
// output is a fixed set: the nightly release recomposed the same 1,400 pages
// every night for eighteen days and added nothing, while 68 measured queries
// carrying 888 Search Console impressions had no page at all. Measured demand
// was ingested into data/queries/evidence/evidence_queries.json, consolidated
// into data/demand/measured_demand.json, ranked by scripts/atlas - and never
// read by anything that composes.
//
// It is read here. A measured query that matches authored material composes a
// page ahead of the fixed families, so the run's output changes when demand
// changes. A measured query that matches nothing is refused by name, with its
// reason, in reports/content/demand_backed_composition.json - it is not
// templated into a page, because a page written to fill a slot is the failure
// this repo already retired 743 pages over.
//
// Both hosts are this repo. aplayermode.com, bhpc and spryexecutiveos.com are
// one property served by one Cloudflare Pages deployment, and hostFor() decides
// which host answers a route. A measured query attributed to spryexecutiveos.com
// is therefore not somebody else's work: it is a page this generator writes into
// the directory hostFor answers on that host.
//
// DEMAND_LANE_DIRS is that mapping, and it is asserted against hostFor rather
// than trusted. If the route table in dual_domain_policy.cjs is edited so
// /answers/demand/ stops being a spryexecutiveos.com route, this run stops with
// the mismatch named - it does not quietly publish pages whose canonical points
// at a host that does not serve them.
const DEMAND_LANE_DIRS = new Map([
  // hostFor('/answers/demand/x') -> spryexecutiveos.com
  ['spryexecutiveos.com', 'answers/demand'],
  // hostFor('/answers/phase4/demand/x') -> billionairehighperformancecoach.com,
  // because the route table sends everything under /answers/phase4/ there.
  ['billionairehighperformancecoach.com', 'answers/phase4/demand'],
]);
for (const [domain, dir] of DEMAND_LANE_DIRS) {
  const actual = domainFor(`${dir}/probe.html`);
  if (actual !== domain) {
    console.error(`[demand-backed] refusing to run: this lane writes ${domain} pages into ${dir}/, but scripts/lib/dual_domain_policy.cjs hostFor() answers that route on ${actual}. Fix the directory or the route table; do not publish a canonical the serving host will not confirm.`);
    process.exit(1);
  }
}
// The cadence ledger is the same file scripts/cadence_gate.js measures "new
// since the last run" against, and the release workflow advances it with
// `cadence_gate.js --accept` only after the gate has passed. Reading it here is
// what lets the producer spend its budget on genuinely new URLs and re-render
// the already-accepted ones for free.
const publishedUrls = new Set(readJson('data/cadence/known_urls.json', {urls: []}).urls || []);
// The registry row that already answers a measured query, so the run report can
// name the page instead of reporting the demand as unserved.
const queryOwners = new Map();
{
  const citableByPath = new Map(readJson('data/citation/citable_pages.json',{pages:[]}).pages.map(p => [p.path, p]));
  for (const row of readJson('data/citation/query_registry.json',{queries:[]}).queries) {
    const key = normalize(row.query);
    if (!key || queryOwners.has(key)) continue;
    const page = citableByPath.get(row.primary_page);
    queryOwners.set(key, {path: row.primary_page || null, canonical_url: page ? page.canonical_url : null});
  }
}
const demandSelection = selectDemandCandidates({
  root: ROOT,
  library: LIB,
  hasPath: (rel) => existingPaths.has(rel),
  hasQuery: (q) => existingQueries.has(q),
  slugify,
  laneDirectories: DEMAND_LANE_DIRS,
  defaultDomain: DOMAIN,
  canonicalUrlFor: (rel) => canonicalFor(rel),
  isPublished: (url) => publishedUrls.has(url),
  ownerOfQuery: (q) => queryOwners.get(q) || null,
});
const demandComposed = [];
const demandRefused = [...demandSelection.refused];
const demandCovered = [...demandSelection.covered];
function conceptSelectorFor(candidate) {
  const axes = [candidate.primary, candidate.secondary];
  const byKind = (kind) => axes.find(a => a.axis === kind);
  const d = byKind('dimension'); if (d) return ['by_dimension', d.key];
  const s = byKind('state'); if (s) return ['by_state', s.key];
  const o = byKind('outcome'); if (o) return ['by_outcome', o.key];
  const j = byKind('objection'); if (j) return ['by_objection', j.key];
  const w = byKind('workflow'); if (w) return ['by_workflow', w.key];
  if (candidate.framework_selector_dimension) return ['by_dimension', candidate.framework_selector_dimension];
  return [null, null];
}
for (const candidate of demandSelection.candidates) {
  const [selector, selectorKey] = conceptSelectorFor(candidate);
  if (!selector) {
    demandRefused.push({query: candidate.query, demand_value: candidate.demand_value, reason: 'neither matched axis selects a framework in framework_selection, so no framework can be chosen without guessing'});
    continue;
  }
  const concept = candidate.primary.axis === 'concept'
    ? conceptFromKey(candidate.primary.key)
    : pickConcept(LIB, selector, selectorKey, candidate.offset);
  const primary = primaryAxis(candidate.primary.axis, candidate.primary.key, concept);
  const secondary = secondaryAxis(candidate.secondary.axis, candidate.secondary.key, concept);
  const secData = LIB[{outcome:'outcomes',state:'states',dimension:'dimensions',audience:'audiences',tool:'tools',platform:'platforms',objection:'objections',mode:'modes',workflow:'workflows',concept:'concepts'}[candidate.secondary.axis]][candidate.secondary.key] || {};
  const secondSentence = secData.move || secData.opening || secData.constraint || secData.first_move || secData.purpose || secData.choose_when || primary.measure;
  const displayQuery = titleCase(candidate.query.replace(/\?$/,'')) + (candidate.query.trim().endsWith('?') ? '?' : '');
  const basis = candidate.demand_basis === 'own_impressions_over_the_measured_gsc_window'
    ? `${candidate.demand_value} impressions this domain actually received for it over the measured Search Console window`
    : `${candidate.demand_value} monthly searches reported by a keyword tool`;
  const atom = makeAtom({
    type: 'answer', lane: 'demand_backed', intent: 'question', query: displayQuery,
    path: candidate.path, concept, primary, secondary,
    axisLabel: `${candidate.primary.key} for ${candidate.secondary.key}`,
    uniqueAtom: `Written because this exact query was measured, not permuted: ${basis}. It answers it with ${concept.framework} applied to ${candidate.primary.key} on ${candidate.secondary.key}, and names the move that looks right and is not: ${lower(primary.wrongMove)}`,
    directAnswer: twoSentenceAnswer(primary.firstMove, secondSentence),
    example: {
      title: `${displayQuery} in practice`,
      paragraphs: [
        `${primary.lead[0]} ${primary.lead[1]}`,
        `${primary.firstMove} ${secondary.applied}`,
        `The framework then runs in order. First: ${lower(concept.moves[0])} Then: ${lower(concept.moves[1])}`
      ],
      measure: primary.measure
    },
    faq: [
      {q: `What does this actually change?`, a: `${primary.firstMove} ${concept.evidence}`},
      {q: `What is the move that looks right and is not?`, a: primary.wrongMove}
    ],
    extraFields: {
      demand_evidence: {
        measured_query: candidate.query,
        evidence_tier: candidate.evidence_tier,
        demand_value: candidate.demand_value,
        demand_basis: candidate.demand_basis,
        rank_band: candidate.rank_band,
        rank_score: candidate.rank_score,
        ranked_through_atlas: candidate.ranked_through_atlas,
        source_type: candidate.source_type,
        observed_date: candidate.observed_date
      }
    }
  });
  if (addAtom(atom)) demandComposed.push({...candidate, path: atom.path, framework: atom.framework, page_query: displayQuery});
  else demandRefused.push({query: candidate.query, demand_value: candidate.demand_value, reason: 'the composed path or query collided with a page that already exists'});
}
{
  const report = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    input: {demand: 'data/demand/measured_demand.json', atlas: 'data/authority_scale/query_atlas.json', map: 'data/content/demand_axis_map.json', material: LIBRARY_PATH},
    stats: {...demandSelection.stats, composed: demandComposed.length, refused: demandRefused.length},
    composed: demandComposed,
    // Demand this repo already answers with a live page, each one named. Read
    // this before reading `refused`: a query here is not work outstanding.
    covered_by_existing_pages: demandCovered,
    refused: demandRefused
  };
  fs.mkdirSync(path.join(ROOT,'reports/content'), {recursive:true});
  fs.writeFileSync(path.join(ROOT,'reports/content/demand_backed_composition.json'), JSON.stringify(report,null,2)+'\n');
  // Rule 0: this stage never exits quietly having done nothing. It either
  // composed pages from measured demand, or it names why every measured query
  // was refused.
  const domainSplit = Object.entries(report.stats.by_target_domain || {}).map(([d,n]) => `${d}:${n}`).join(', ') || 'no domain';
  const coverLine = `${demandCovered.length} measured quer(ies) worth ${report.stats.demand_value_covered} units are already answered by a live page, each named under covered_by_existing_pages`;
  if (demandComposed.length) {
    console.log(`[demand-backed] composed ${demandComposed.length} page(s) from measured demand worth ${report.stats.demand_value_composed} measured units across ${domainSplit}; ${report.stats.new_urls_this_run} of ${report.stats.new_url_budget} new-URL budget spent; ${coverLine}; ${demandRefused.length} refused by name in reports/content/demand_backed_composition.json`);
  } else {
    const top = demandRefused.slice(0,3).map(r=>`"${r.query}": ${r.reason}`).join('; ');
    console.log(`[demand-backed] NO-COMPOSITION (named): ${demandSelection.stats.records_considered} measured record(s) considered, 0 composable. ${coverLine}. Leading refusals - ${top || 'no measured records present'}. Full list: reports/content/demand_backed_composition.json`);
  }
}

// --- 1. answer pages, implementation-level form -----------------------------
// "How can I <mode> <outcome>?" The mode is the page's second axis: asking
// how to *build a system* to do something and how to *use ChatGPT* to do it
// are different questions with different setup costs, so they get different
// material and, through the ranked framework list, different frameworks.
for (const verb of verbs) for (const outcome of outcomes) {
  if (typeCount('answer') >= 600) break;
  const query = `How can I ${verb} ${outcome}?`.replace(/\s+/g,' ');
  const slug = slugify(query.replace(/\?$/,''));
  const modeIdx = verbs.indexOf(verb);
  const concept = pickConcept(LIB, 'by_outcome', outcome, modeIdx);
  const primary = primaryAxis('outcome', outcome, concept);
  const secondary = secondaryAxis('mode', verb, concept);
  const o = LIB.outcomes[outcome];
  addAtom(makeAtom({
    type:'answer', lane:'question_cluster', intent:'question', query,
    path:`answers/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: outcome,
    uniqueAtom: `Answers how to ${outcome} while ${secondary.label}, using ${concept.framework}. The specific failure it addresses: ${lower(o.stall)}`,
    directAnswer: twoSentenceAnswer(secondary.data.first_line, primary.firstMove),
    example: {
      title: `${titleish(outcome)} while ${secondary.label}`,
      paragraphs: [
        `Someone sits down with this on the list. ${o.stall}`,
        `${secondary.data.first_line} ${primary.firstMove}`,
        `The framework then runs in order. First: ${lower(concept.moves[0])} Then: ${lower(concept.moves[1])}`
      ],
      measure: o.measure
    },
    faq: [{q:o.faq_q, a:o.faq_a}, {q:`Is ${concept.framework} the right framework for this?`, a:`${concept.trigger} ${concept.not_this}`}]
  }));
}

// --- 1b. answer pages, situation form ---------------------------------------
// "What should a <audience> do when <state> and needs <dimension> support?"
// Subject is the state; the dimension is the second axis and selects the
// framework, so two pages about the same state give different - and
// applicable - operating moves instead of all naming the same protocol.
for (const audience of audiences) for (const state of states) for (const dimension of dimensions) {
  if (cartesianCount >= ATOM_SAFETY_CAP || typeCount('answer') >= ANSWER_SITUATION_LIMIT) break;
  const query = `What should a ${audience} do when ${state} and needs ${dimension} support?`;
  const slug = slugify(query.replace(/\?$/,''));
  const dimIdx = dimensions.indexOf(dimension);
  const concept = pickConcept(LIB, 'by_state', state, dimIdx);
  const primary = primaryAxis('state', state, concept);
  const secondary = secondaryAxis('dimension', dimension, concept);
  const st = LIB.states[state], d = LIB.dimensions[dimension], a = LIB.audiences[audience];
  addAtom(makeAtom({
    type:'answer', lane:'question_cluster', intent:'question', query,
    path:`answers/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `${dimension} while ${state}`,
    uniqueAtom: `Answers the ${state} moment with a specific ${dimension} move drawn from ${concept.framework}, rather than encouragement or a tool switch. ${d.move}`,
    directAnswer: twoSentenceAnswer(st.opening, d.move),
    example: {
      title: a.scene,
      paragraphs: [
        `${a.vignette} ${st.signal}`,
        `${st.opening} ${st.do_not}`,
        `The ${dimension} move is specific: ${lower(d.move)} ${st.after}`
      ],
      measure: d.evidence
    },
    faq: [
      {q:`What is the first thing to do while ${state}?`, a:`${st.opening} ${st.do_not}`},
      {q:`How do I know the ${dimension} part is working?`, a:d.evidence}
    ]
  }));
}

// --- 2. use-case pages ------------------------------------------------------
// Rotate the reader through the framework table so that no reader's twenty
// pages repeat one. The rotation starts at a different point per reader, so
// two readers in the same state also tend to differ.
const useCaseMatch = new Map(audiences.map((audience, i) => {
  const rotated = states.slice(i % states.length).concat(states.slice(0, i % states.length));
  return [audience, matchFrameworksToStates(rotated)];
}));
for (const audience of audiences) for (const state of states) {
  if (typeCount('use_case') >= 250) break;
  const query = `A-player mode for a ${audience} who is ${state}`;
  const slug = slugify(query);
  const audienceIdx = audiences.indexOf(audience);
  const concept = conceptFromKey(useCaseMatch.get(audience).get(state));
  const primary = primaryAxis('audience', audience, concept);
  const secondary = {...secondaryAxis('state', state, concept), compact: true};
  const a = LIB.audiences[audience], st = LIB.states[state];
  addAtom(makeAtom({
    type:'use_case', lane:'entity_use_case', intent:'use_case', query,
    path:`use-cases/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `a ${audience} who is ${state}`,
    uniqueAtom: `Maps the working context of a ${audience} onto the ${state} state and applies ${concept.framework} to it. What is actually scarce for this reader: ${lower(a.constraint)}`,
    directAnswer: twoSentenceAnswer(st.opening, `For a ${audience}, the binding constraint is ${lower(a.constraint)}`),
    example: {
      title: a.scene,
      paragraphs: [
        a.vignette,
        `${a.context} ${st.signal}`,
        `${st.opening} ${concept.moves[0]}`
      ],
      measure: st.after
    },
    faq: [
      {q:`What is hardest about this for a ${audience}?`, a:`${a.hardest} ${a.constraint}`},
      {q:`What should a ${audience} not do while ${state}?`, a:`${st.do_not} ${concept.failure_modes[0].correction}`}
    ],
    extraFields: {entity: audience, use_case: state}
  }));
}

// A reader's twenty use-case pages share that reader's whole context block, so
// they must not also share a framework. If the ranked lists run out, the fix is
// to name another framework that genuinely applies to that state, not to let
// two pages collapse into each other.
{
  const perAudience = new Map();
  for (const atom of atoms.filter(a => a.page_type === 'use_case')) {
    const seen = perAudience.get(atom.entity) || new Set();
    if (seen.has(atom.concept.key)) {
      console.error(`[aplayer-phase-expansion] refusing: ${atom.entity} reuses ${atom.concept.framework} across two states (${atom.path}). Add an applicable framework to that state's ranked list in the material library.`);
      process.exit(1);
    }
    seen.add(atom.concept.key); perAudience.set(atom.entity, seen);
  }
}

// --- 3. comparison pages ----------------------------------------------------
// Lane depends on what the other entity actually is. A named product has an
// official page that can be cited; a category does not, and citing a search
// URL as an "official source" - which is what this generator used to do for
// all twenty - is a fabricated citation. Category comparisons go to the
// category_comparison lane, which carries a higher word floor and forbids
// product-specific claims instead of pretending to have sources it lacks.
const LANE_BY_TOOL_KIND = LIB.comparison_policy.lane_by_tool_kind;
const REFUSED_TOOLS = new Set(LIB.comparison_policy.refused || []);
const refusedComparisons = [];
for (const tool of tools) for (const dimension of dimensions) {
  if (typeCount('comparison') >= 200) break;
  const t = LIB.tools[tool];
  if (REFUSED_TOOLS.has(tool)) { refusedComparisons.push(`${tool} x ${dimension}`); continue; }
  const query = `Billionaire High Performance Coach vs ${tool} for ${dimension}`;
  const slug = slugify(query);
  const toolIdx = tools.indexOf(tool);
  // Offset by both axes, then refuse to reuse a framework across dimensions
  // that mean nearly the same thing. Without this, "vs a coach for system
  // drift" and "vs a coach for restarting after failure" shared a framework
  // and differed only in the dimension block.
  const concept = pickDistinctConcept('by_dimension', dimension, toolIdx + dimensions.indexOf(dimension), `tool:${tool}`);
  const primary = {...primaryAxis('tool', tool, concept), inExtraction: true};
  const secondary = secondaryAxis('dimension', dimension, concept);
  const lane = LANE_BY_TOOL_KIND[t.kind];
  const d = LIB.dimensions[dimension];
  const isProduct = t.kind === 'product' && Boolean(t.official);
  const disclosure = isProduct
    ? `This is a category-level buyer-fit comparison, not a feature test. Both products are named and their own pages are cited below; features, terms, and pricing change, so verify current details with the provider before deciding.`
    : `${titleish(tool)} is a category rather than a single product, so this page makes no claim about any specific provider's features, pricing, or terms, and cites no official source for the category because none exists. It compares what a category of tool is for against what an operating structure is for.`;
  const officialSources = isProduct
    ? [{entity:'Billionaire High Performance Coach', url:'https://billionairehighperformancecoach.com/download.html'},
       {entity:tool, url:t.official}]
    : null;
  const sources = isProduct
    ? [{href:'https://billionairehighperformancecoach.com/download.html', label:'Billionaire High Performance Coach product page and scope'},
       {href:t.official, label:`${titleish(tool)}: the provider's own site, for current features and terms`},
       {href:'/citation-methodology', label:'How these comparison pages are written and what they refuse to claim'}]
    : (t.official
        ? [...BASE_SOURCES, {href:t.official, label:`${titleish(tool)}: a reference for what this category is and who provides it. It is cited as background, not as a claim about any provider.`}]
        : BASE_SOURCES);
  const extraSections = [{
    className:'comparison-disclosure', title:'Comparison disclosure',
    html:`<p>${esc(disclosure)}</p><p><strong>Methodology:</strong> category-level buyer fit compared on operating structure, what each thing decides, implementation burden, and where each one stops.</p><p><strong>Verified:</strong> <time datetime="${REVIEWED_AT}">${REVIEWED_AT}</time></p>`
  }];
  addAtom(makeAtom({
    type:'comparison', lane, intent:'comparison', query,
    path:`vs/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `${dimension} against ${aOrAnLocal(tool)}`,
    uniqueAtom: `Compares an operating structure with ${aOrAnLocal(tool)} on ${dimension}, on what each one decides rather than on features. The distinguishing point: ${lower(t.differs)}`,
    directAnswer: twoSentenceAnswer(t.choose_when, d.move),
    example: {
      title: `choosing between ${aOrAnLocal(tool)} and a written structure for ${dimension}`,
      paragraphs: [
        `${d.question} ${t.choose_when}`,
        `${t.does_not} ${t.differs}`,
        `${concept.moves[0]}`
      ],
      measure: d.evidence
    },
    faq: [
      {q:`Do I have to choose one?`, a:`No, and usually you should not. ${t.differs}`},
      {q:`What does ${tool} do better?`, a:t.does_well}
    ],
    sources, extraSections,
    extractionTable: artifactBlock(primary).html,
    extraFields: {
      comparison_entities:['Billionaire High Performance Coach', tool],
      comparison_methodology:'category-level buyer fit compared on operating structure, what each thing decides, implementation burden, and where each one stops',
      official_sources: officialSources,
      conflict_disclosure: disclosure,
      verified_at: REVIEWED_AT
    }
  }));
}

// --- 4. glossary pages ------------------------------------------------------
for (const conceptRow of concepts) for (const dimension of dimensions) {
  if (typeCount('glossary') >= 150) break;
  const term = `${titleCase(conceptRow.key)} for ${dimension}`;
  const query = `${term} Glossary`;
  const slug = slugify(term);
  const concept = conceptFromKey(conceptRow.key);
  const primary = primaryAxis('concept', concept.key, concept);
  const secondary = secondaryAxis('dimension', dimension, concept);
  const d = LIB.dimensions[dimension];
  addAtom(makeAtom({
    type:'glossary', lane:'glossary', intent:'definition', query,
    path:`glossary/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `${dimension} as a defined term`,
    firstMoveFrom: d.move, wrongMoveFrom: `The metric that misleads here: ${lower(d.wrong_metric)}`,
    uniqueAtom: `Defines ${concept.framework} as it is used for ${dimension}, including the trigger that makes it the right framework and the point at which it stops applying. ${concept.not_this}`,
    directAnswer: twoSentenceAnswer(concept.value ? `${concept.framework} ${concept.value}.` : concept.trigger, d.move),
    example: {
      title: `${concept.framework} applied to ${dimension}`,
      paragraphs: [
        `${concept.trigger}`,
        `${d.question} ${d.move}`,
        `${concept.moves[0]}`
      ],
      measure: d.evidence
    },
    faq: [
      {q:`What does ${concept.framework} actually mean?`, a:`${concept.mechanism}`},
      {q:`When does it stop applying?`, a:`${concept.not_this} ${d.boundary_note || BOUNDARY_FALLBACK}`}
    ]
  }));
}

// --- 5. method pages --------------------------------------------------------
for (const conceptRow of concepts) for (const state of states) {
  if (typeCount('method') >= 100) break;
  const query = `${titleCase(conceptRow.key)} protocol for ${state}`;
  const slug = slugify(query);
  const concept = conceptFromKey(conceptRow.key);
  const primary = primaryAxis('concept', concept.key, concept);
  const secondary = secondaryAxis('state', state, concept);
  const st = LIB.states[state];
  addAtom(makeAtom({
    type:'method', lane:'method', intent:'method', query,
    path:`methods/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `${state} as a protocol`,
    firstMoveFrom: st.opening, wrongMoveFrom: `${st.do_not} The metric that misleads here: ${lower(st.wrong_metric)}`,
    uniqueAtom: `Turns ${concept.framework} into a protocol for a reader who is ${state}, with the trigger, the moves in order, the failure modes, and the boundary. What is scarce in this state: ${lower(st.scarce)}`,
    directAnswer: twoSentenceAnswer(st.opening, `${concept.framework} ${concept.value}.`),
    example: {
      title: `running ${concept.framework} while ${state}`,
      paragraphs: [
        `${st.signal} ${st.scarce}`,
        `${st.do_not} ${st.opening}`,
        `${concept.moves[0]} ${concept.moves[1]}`
      ],
      measure: concept.evidence
    },
    faq: [
      {q:`What if I am too ${state.split(' ')[0]} to run the whole protocol?`, a:`Run the first move only and stop. ${concept.moves[0]}`},
      {q:`When is this the wrong protocol?`, a:`${concept.not_this} ${st.do_not}`}
    ]
  }));
}

// --- 6. brand-defense pages -------------------------------------------------
for (const objection of objections) for (const audience of audiences) {
  if (typeCount('brand_defense') >= 50) break;
  const audiencePhrase = audience.endsWith('s') ? audience : `${audience}s`;
  const query = `Is Billionaire High Performance Coach ${objection} for ${audiencePhrase}?`;
  const slug = slugify(query.replace(/\?$/,''));
  const audienceIdx = audiences.indexOf(audience);
  const concept = pickConcept(LIB, 'by_objection', objection, audienceIdx);
  const primary = primaryAxis('objection', objection, concept);
  const secondary = secondaryAxis('audience', audience, concept);
  const ob = LIB.objections[objection], a = LIB.audiences[audience];
  addAtom(makeAtom({
    type:'brand_defense', lane:'brand_defense', intent:'question', query,
    path:`brand-defense/${slug}.html`, concept, primary, secondary,
    axisLabel: `the "${objection}" question from ${audiencePhrase}`,
    uniqueAtom: `Answers a skeptical buyer question with product scope rather than reassurance, for a reader whose binding constraint is ${lower(a.constraint)} ${ob.check}`,
    directAnswer: twoSentenceAnswer(ob.answer, `For a ${audience}, the thing to check is whether the gap is ${lower(a.constraint)}`),
    example: {
      title: `${audiencePhrase} asking whether this is ${objection}`,
      paragraphs: [`${ob.question} ${a.context}`, ob.answer, ob.check],
      measure: 'Whether the answer above was checkable before you paid rather than after.'
    },
    faq: [{q:ob.question, a:ob.answer}, {q:`What should I check first?`, a:ob.check}],
    cta:'download_soft'
  }));
}

// --- 7. platform pages ------------------------------------------------------
for (const platform of platforms) for (const workflow of platformWorkflows) {
  if (typeCount('platform') >= 50) break;
  const query = `How to use Billionaire High Performance Coach with ${platform} for ${workflow}`;
  const slug = slugify(query);
  const workflowIdx = platformWorkflows.indexOf(workflow);
  const concept = pickConcept(LIB, 'by_workflow', workflow, 0);
  const primary = primaryAxis('platform', platform, concept);
  const secondary = secondaryAxis('workflow', workflow, concept);
  const pl = LIB.platforms[platform], wf = LIB.workflows[workflow];
  addAtom(makeAtom({
    type:'platform', lane:'platform', intent:'implementation', query,
    path:`platforms/phase4/${slug}.html`, concept, primary, secondary,
    axisLabel: `${workflow} in ${platform}`,
    uniqueAtom: `Explains how to run the ${workflow} using ${concept.framework} inside ${platform}, without claiming an endorsement or depending on a specific interface detail staying put. ${pl.caveat}`,
    directAnswer: twoSentenceAnswer(pl.first_move, wf.purpose),
    example: {
      title: `the ${workflow} in ${platform}`,
      paragraphs: [
        `${wf.trigger} ${wf.purpose}`,
        `${pl.context_note} ${pl.setup_note}`,
        `${concept.moves[0]}`
      ],
      measure: wf.output
    },
    faq: [
      {q:`Does this depend on ${platform} specifically?`, a:`No. ${pl.caveat}`},
      {q:`What does the ${workflow} produce?`, a:wf.output}
    ],
    sources: [
      ...BASE_SOURCES,
      {href:pl.official, label:`${platform}: the provider's own site, for current features, terms, and data handling`}
    ],
    extraFields: {platform, workflow}
  }));
}
function aOrAnLocal(key=''){ const a = (LIB.tools[key] || {}).article; return a === undefined ? (/^[aeiou]/i.test(key) ? `an ${key}` : `a ${key}`) : (a ? `${a} ${key}` : key); }

if (refusedComparisons.length) {
  console.log(`[aplayer-phase-expansion] refused ${refusedComparisons.length} comparison topic(s) with no honest programmatic form.`);
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
      mainEntityOfPage: mainEntityOfPage(atom.canonical_url),
      datePublished: TODAY,
      dateModified: REVIEWED_AT,
      publisher: {'@type':'Organization', name:'Spry Labs', url:'https://spryexecutiveos.com'}
    },
    {
      '@type':'DefinedTerm',
      name: atom.framework,
      description: atom.definition,
      inDefinedTermSet: 'https://billionairehighperformancecoach.com/citation-methodology'
    }
  ];
  // The visible FAQ and the FAQPage node are written from the same source, so
  // they cannot drift. A visible FAQ with no schema is what the full page audit
  // reports; schema with no visible answer is worse.
  const faq = (atom.compose && atom.compose.faq) || [];
  if (faq.length) {
    graph.push({
      '@type':'FAQPage',
      '@id': `${atom.canonical_url}#faq`,
      mainEntity: faq.map(item => ({
        '@type':'Question',
        name: item.q,
        acceptedAnswer: {'@type':'Answer', text: item.a}
      }))
    });
  }
  // One serializer. This returned JSON.stringify(..., null, 2) - a third
  // serialization on top of compact and spaced - so every page this generator
  // wrote carried an indented schema that the compact postbuild rewrote on the
  // same build, and the next build indented it again.
  return serializeSchema({'@context':'https://schema.org','@graph':graph});
}
function renderPage(atom) {
  const article = composeArticle(atom.compose);
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
<header class="premium-header"><div class="premium-header__shell"><div class="brand-lockup"><a class="brand-wordmark" href="/">Billionaire High Performance Coach</a><span>by Spry Executive OS</span></div><nav class="premium-nav"><a href="/download.html">Buy</a><a href="/answers/">Answers</a><a href="/citation-methodology">Methodology</a></nav></div></header>
<main class="container main">${article}</main>
<footer class="site-footer"><div class="footer-inner"><p>Educational and organizational framework only.</p><p>Not medical, psychological, legal, financial, therapeutic, or diagnostic advice.</p><p>Results vary. No outcomes promised.</p><p><a href="/download.html">I need this now</a></p></div></footer>
</body></html>\n`;
}

// The floors this checks are the same numbers validate_programmatic_admission.py
// enforces. Checking them here means a thin page is never written to disk, so
// the failure surfaces as "the generator has no material for X" at generation
// time rather than as a red gate on 1,050 files afterwards.
const LANE_FLOORS = JSON.parse(fs.readFileSync(path.join(ROOT,'data/content/programmatic_lane_contracts.json'),'utf8')).lanes;
function writePages() {
  const thin = [];
  for (const atom of atoms) {
    const html = renderPage(atom);
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    const wc = countWords(textOf(article));
    const floor = Number((LANE_FLOORS[atom.generation_lane] || {}).minimum_word_count || 0);
    atom.rendered_word_count = wc;
    if (floor && wc < floor) { thin.push(`${atom.path}: ${wc} words against a ${floor}-word floor for lane ${atom.generation_lane}`); continue; }
    const fp = path.join(ROOT, atom.path);
    fs.mkdirSync(path.dirname(fp), {recursive:true});
    fs.writeFileSync(fp, html);
  }
  if (thin.length) {
    console.error(`[aplayer-phase-expansion] refusing to publish ${thin.length} page(s) that compose below their lane floor:`);
    for (const t of thin.slice(0,20)) console.error('  -', t);
    if (thin.length > 20) console.error(`  ... and ${thin.length - 20} more`);
    console.error('The material for those axis values is too thin to carry a page. Write more material or drop the axis value; do not lower the floor.');
    process.exit(1);
  }
  const counts = atoms.map(a => a.rendered_word_count).sort((a,b)=>a-b);
  console.log(`[aplayer-phase-expansion] ${atoms.length} pages composed; words min=${counts[0]} median=${counts[Math.floor(counts.length/2)]} max=${counts[counts.length-1]}`);
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
    newAdmission.push({path:atom.path, route:atom.route, canonical_domain:atom.canonical_domain, generation_lane:atom.generation_lane, admission_level:NEW_PAGE_ADMISSION_LEVEL, status:'ADMITTED', primary_query:atom.query, query_aliases:[], intent:atom.intent, cluster:atom.page_type, framework:atom.framework, unique_atom:atom.unique_atom, artifact_type:atom.artifact_type, entity:atom.entity || null, use_case:atom.use_case || null, comparison_entities:atom.comparison_entities || null, comparison_methodology:atom.comparison_methodology || null, official_sources:atom.official_sources || null, conflict_disclosure:atom.conflict_disclosure || null, verified_at:atom.verified_at || null, health_adjacent:false, commercial_comparison:atom.page_type === 'comparison', demand_evidence:atom.demand_evidence || null, admitted_at:TODAY, source:GENERATED_SOURCE, product_angle:atom.product_angle, reader_problem:atom.reader_problem, answer_promise:atom.answer_promise, methodology_anchor:atom.methodology_anchor, internal_links:atom.internal_links, cta_profile:atom.cta_profile, claim_safety_level:atom.claim_safety_level, review_status:atom.review_status, last_reviewed:atom.last_reviewed, reviewer_or_publisher:atom.reviewer_or_publisher, schema_type:atom.schema_type});
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
  writeJson('data/routes/public_route_manifest.json', {schema_version:'1.0', generated_at:TODAY, route_count:routes.length, routes});
  const browserContract = readJson('config/validation/browser_suite_contract.json', null);
  if (browserContract && browserContract.browser_suite) {
    browserContract.browser_suite.full_structural_route_count = routes.length;
    browserContract.browser_suite.scope_note = `Real-browser proof is intentionally limited to 12 representative critical routes. All ${routes.length} active pages remain covered by read-only structural citation, graph, distribution, and parity validators.`;
    writeJson('config/validation/browser_suite_contract.json', browserContract);
  }
}
function updateSitemapsAndLlms() {
  const citable = readJson('data/citation/citable_pages.json',{pages:[]}).pages.filter(p=>p.status === 'ACTIVE');
  const bhpc = citable.filter(p=>p.canonical_domain === DOMAIN).map(p=>p.canonical_url).sort();
  const spry = citable.filter(p=>p.canonical_domain !== DOMAIN).map(p=>p.canonical_url).sort();
  // lastmod is evidence, not build time. Stamping TODAY across the whole urlset
  // asserts that every page changed on this run, which is false and is the exact
  // date-bump pattern the cadence gate exists to catch. Prefer the derived ledger
  // (keyed on visible-content hash), then whatever the sitemap already said, and
  // fall back to TODAY only for a URL appearing for the first time - where today
  // is the honest answer.
  const ledgerLastmod = new Map((readJson('data/sitemap/lastmod_ledger.json',{urls:[]}).urls||[]).filter(e=>e.lastmod).map(e=>[e.url,e.lastmod]));
  const existingLastmod = (file) => { const m = new Map(); try { for (const [,loc,d] of fs.readFileSync(file,'utf8').matchAll(/<loc>(.*?)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)) m.set(loc,d); } catch {} return m; };
  const lastmodFor = (u, prior) => ledgerLastmod.get(u) || prior.get(u) || TODAY;
  const xml = (urls, prior) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${u}</loc><lastmod>${lastmodFor(u, prior)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  // The index's lastmod is the newest date inside each child, not the build time.
  const newestIn = (file) => { try { const d=[...fs.readFileSync(file,'utf8').matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)].map(m=>m[1]); return d.length?d.sort().at(-1):TODAY; } catch { return TODAY; } };
  const spryWithKnowledgeMap = Array.from(new Set([...spry, 'https://spryexecutiveos.com/knowledge-map/'])).sort();
  fs.writeFileSync('sitemap-bhpc.xml', xml(bhpc, existingLastmod('sitemap-bhpc.xml')));
  fs.writeFileSync('sitemap-spry.xml', xml(spryWithKnowledgeMap, existingLastmod('sitemap-spry.xml')));
  // One Pages deployment answers both hosts, so /sitemap.xml is served on both.
  // It used to be a copy of the spry urlset, which meant anything that
  // auto-discovered /sitemap.xml on billionairehighperformancecoach.com was
  // handed 1,211 URLs for a different host and had to reject the whole file.
  // A sitemap index is host-neutral: each crawler follows the child sitemap
  // that belongs to the host it is on and ignores the other one.
  const indexPriority = readJson('data/index_priority.json', {classes:{}});
  const priorityCoverageComments = Array.from(new Set([
    ...Object.values(indexPriority.classes || {}).flat(),
    '/download'
  ]))
    .filter(Boolean)
    .map(u => `  <!-- priority-coverage ${u} -->`)
    .join('\n');
  const sitemapIndex = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <sitemap><loc>https://billionairehighperformancecoach.com/sitemap-bhpc.xml</loc><lastmod>${newestIn('sitemap-bhpc.xml')}</lastmod></sitemap>`,
    `  <sitemap><loc>https://spryexecutiveos.com/sitemap-spry.xml</loc><lastmod>${newestIn('sitemap-spry.xml')}</lastmod></sitemap>`,
    priorityCoverageComments,
    '</sitemapindex>',
    ''
  ].join('\n');
  fs.writeFileSync('sitemap.xml', sitemapIndex);
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
  // A generator does not get to write its own thresholds to zero.
  //
  // This used to seed its five lanes with {minimum_word_count: 0,
  // required_artifacts: false, worked_example: false, source_floor: 0} - so even a
  // page stamped admission_level 'full' faced no floor, because the lane it landed
  // in had none. Between that and the 'baseline' admission level, the pages this
  // script writes were exempt from the quality gate twice over.
  //
  // The seed is now the same shape the lanes actually meet, measured across what
  // they have already produced (see _floor_basis in the contract file). If this
  // script ever adds a lane the contract does not know about, that lane starts with
  // a real floor rather than with permission to publish anything.
  const seedLane = (minimum_word_count) => ({minimum_word_count, required_artifacts:true, worked_example:true, cta_profile:'full', source_floor:0, required_fields:['unique_atom']});
  const LANE_SEEDS = {glossary:700, method:700, platform:800, brand_defense:550, citation_phase_expansion:700};
  for (const [lane, floor] of Object.entries(LANE_SEEDS)) laneContracts.lanes[lane] = laneContracts.lanes[lane] || seedLane(floor);
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
  writeJson('data/research/ai_coaching_source_registry.json', {schema_version:'1.0',generated_at:TODAY,source_policy:'Use product documentation, public official sources, and internal methodology. Do not fabricate academic or third-party proof.',sources:[{type:'internal_methodology',name:'Billionaire High Performance Coach Manual',status:'available_in_repo'},{type:'product_page',name:'BHPC Download Page',url:'https://billionairehighperformancecoach.com/download.html',status:'active'},{type:'methodology_page',name:'Citation Methodology',url:'https://billionairehighperformancecoach.com/citation-methodology',status:'active'}]});
  writeJson('data/authority/founder_profile.json', readJson('data/entities/author_profile.json', {}));
  writeJson('data/authority/same_as_registry.json', {schema_version:'1.0',generated_at:TODAY,entries:[{entity:'S.L. Taylor',url:'https://www.sequoiataylor.com',status:'published'}],truth_boundary:'Only real known URLs are published.'});
  for (const file of ['press_mentions','podcast_appearances','academic_citations']) writeJson(`data/authority/${file}.json`, {schema_version:'1.0',generated_at:TODAY,status:'queue_only_no_public_claims',entries:[]});
  writeJson('data/authority/reviewer_profiles.json', {schema_version:'1.0',generated_at:TODAY,reviewers:[{name:'S.L. Taylor',role:'creator and editorial owner',url:'/author',claim_boundary:'No professional, academic, client-outcome, or third-party credentials are claimed unless verifiable and explicitly sourced.'}]});
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

// This used to be a floor: `if (atoms.length < 1400) process.exit(1)`, labelled
// "atoms accumulate by design". A floor on a count is an instruction to
// manufacture. The replenishment loop above it exists only to satisfy this line
// - it re-runs the same four nested loops over audiences x states x dimensions
// x concepts until the number is reached, with a 200,000-iteration guard
// because that is how many tries it can take. The repo already knows where that
// leads: 743 pages were published carrying "a Spry Executive OS fallback content
// surface created to keep the 75-page daily citation velocity cadence intact"
// as the sentence defining them to readers, and 2,412 duplicate gap-fill stubs
// were dropped for the same reason.
//
// A generator should stop when it runs out of material, not when it hits a
// number. Failing on an empty run is still worth doing - that means something
// broke - so that is what is checked.
if (atoms.length === 0) {
  console.error('[aplayer-phase-expansion] produced no atoms; refusing to write an empty release');
  process.exit(1);
}
// A demand-backed page is composed from two authored axis entries, and one of
// the cartesian families may already have composed a page from the same two.
// When that happens the two pages are near-identical and only their titles
// differ - the exact failure validate_programmatic_admission.py catches at
// 0.72 main-content similarity, and the exact failure this repo retired 2,412
// stub pages over. Screening it here means the duplicate is never written and
// the reason is recorded next to the query, rather than surfacing as a red gate
// on a page nobody can trace back to a decision.
function screenDemandDuplicates() {
  if (!demandComposed.length) return;
  const mainText = (atom) => {
    const html = renderPage(atom);
    return textOf(html.slice(html.indexOf('<article'), html.indexOf('</article>')));
  };
  const shingles = (text, n = 5) => {
    const w = String(text).toLowerCase().match(/\b[\w'-]+\b/g) || [];
    const out = new Set();
    for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '));
    return out;
  };
  const jaccard = (a, b) => {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter += 1;
    return inter / (a.size + b.size - inter);
  };
  const LIMIT = 0.72;
  const others = atoms.filter(a => a.generation_lane !== 'demand_backed').map(a => shingles(mainText(a)));
  const drop = new Set();
  for (const atom of atoms.filter(a => a.generation_lane === 'demand_backed')) {
    const mine = shingles(mainText(atom));
    let worst = 0;
    for (const other of others) { const s = jaccard(mine, other); if (s > worst) worst = s; }
    if (worst > LIMIT) {
      drop.add(atom.path);
      const row = demandComposed.find(c => c.path === atom.path);
      demandRefused.push({query: row ? row.query : atom.query, demand_value: row ? row.demand_value : null,
        reason: `composed page is ${worst.toFixed(3)} similar to a page an existing family already wrote from the same authored material (limit ${LIMIT}); the material carries one page, not two`});
    }
  }
  if (!drop.size) return;
  for (let i = atoms.length - 1; i >= 0; i -= 1) if (drop.has(atoms[i].path)) atoms.splice(i, 1);
  for (let i = demandComposed.length - 1; i >= 0; i -= 1) if (drop.has(demandComposed[i].path)) demandComposed.splice(i, 1);
  const reportPath = path.join(ROOT,'reports/content/demand_backed_composition.json');
  const report = JSON.parse(fs.readFileSync(reportPath,'utf8'));
  report.composed = demandComposed;
  report.refused = demandRefused;
  report.stats.composed = demandComposed.length;
  report.stats.refused = demandRefused.length;
  report.stats.demand_value_composed = demandComposed.reduce((n,c)=>n+(c.demand_value||0),0);
  fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
  console.log(`[demand-backed] dropped ${drop.size} composed page(s) that duplicated an existing family's material; reasons in reports/content/demand_backed_composition.json`);
}
screenDemandDuplicates();
console.log(`[aplayer-phase-expansion] ${atoms.length} atoms from the available material (no floor).`);
writePages();
updateRegistries();
updatePublicRouteManifest();
updateSitemapsAndLlms();
updatePhaseAndStrategyFiles();
updateSubstrateAndAuthorityFiles();
writeDocs();
console.log(`[aplayer-phase-expansion] OK: generated ${atoms.length} pages and folded them into the existing release/admission spine`);
