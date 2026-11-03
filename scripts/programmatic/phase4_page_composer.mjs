/**
 * Composes the aplayer phase-expansion pages from authored material.
 *
 * Why this file exists
 * -------------------
 * The generator used to render every page from one template with four fixed
 * sentences and a substituted framework name. Two consequences:
 *
 *   1. Every page was 460-600 words, all of it boilerplate. Word count was
 *      the visible symptom; the cause was that no material existed.
 *   2. The concept axis never varied. The generator looped
 *      `for (verb) for (outcome) for (concept)` but the page path depends only
 *      on (verb, outcome), so `addAtom` rejected concepts 2..25 as duplicate
 *      paths and concepts[0] always won. All 600 answer pages, all 250
 *      use-case pages and all 200 comparison pages carried
 *      `data-named-framework="Never Miss Twice Continuity ..."` - a protocol
 *      about not missing two days in a row - regardless of whether the page
 *      asked about decision fatigue, low energy, or a hard decision. The 24
 *      other frameworks in the table were unreachable.
 *
 * Both are fixed here and in the caller: the framework is now selected from a
 * ranked list of frameworks that genuinely address the page's subject, indexed
 * by the page's secondary axis, and every block on the page is composed from
 * authored material in data/content/phase4_material_library.json.
 *
 * The composer refuses rather than degrades. If an axis value has no authored
 * material, or the composed page lands under its lane floor, it throws and the
 * generator exits non-zero instead of writing a thin page.
 */
import fs from 'node:fs';
import path from 'node:path';

export const LIBRARY_PATH = 'data/content/phase4_material_library.json';

export function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mirrors the word regex in scripts/validation/validate_programmatic_admission.py
// so a page that passes the check here passes it there.
const WORD_RE = /[0-9A-Za-z_’'-]+/g;
export function countWords(text = '') {
  const m = String(text).match(WORD_RE);
  return m ? m.length : 0;
}
export function textOf(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function loadLibrary(root) {
  const fp = path.join(root, LIBRARY_PATH);
  if (!fs.existsSync(fp)) {
    throw new Error(`[phase4] authored material library missing at ${LIBRARY_PATH}; refusing to generate pages without it`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

/**
 * Refuse the whole run if any axis value the generator is about to use has no
 * authored material. A missing entry is not a reason to fall back to a
 * template; it is a reason to stop and write the material.
 */
export function assertMaterialFor(lib, requirements) {
  const missing = [];
  for (const [section, keys] of Object.entries(requirements)) {
    const table = lib[section] || {};
    for (const key of keys) if (!table[key]) missing.push(`${section}.${key}`);
  }
  if (missing.length) {
    throw new Error(
      `[phase4] refusing to generate: no authored material for ${missing.length} axis value(s):\n  ` +
      missing.join('\n  ') +
      `\nAdd them to ${LIBRARY_PATH} or remove the axis value from the generator.`
    );
  }
}

/**
 * Pick the framework for a page from the ranked list of frameworks that
 * address its subject. The secondary axis chooses the position, which is what
 * stops every page in a subject group inheriting the same concept.
 */
export function pickConcept(lib, kind, key, offset) {
  const table = lib.framework_selection[kind];
  const ranked = table && table[key];
  if (!ranked || !ranked.length) {
    throw new Error(`[phase4] refusing to generate: no framework mapping for ${kind} ${key}`);
  }
  const conceptKey = ranked[Math.abs(offset) % ranked.length];
  const concept = lib.concepts[conceptKey];
  if (!concept) throw new Error(`[phase4] refusing to generate: framework ${conceptKey} has no authored material`);
  return { key: conceptKey, ...concept };
}

// --- say it once ------------------------------------------------------------
/**
 * One authored sentence, one place on the page.
 *
 * Several slots were wired to the same library field, so a page restated one
 * sentence five to eight times. On
 * `/answers/phase4/what-should-a-founder-do-when-behind-on-commitments-and-needs-priority-selection-support`,
 * `states.behind on commitments.opening` was printed by the TL;DR, by the
 * extraction block's "Do this first.", by the state artifact table's opening-move
 * row, by the worked example's second paragraph and by the first FAQ answer -
 * seven copies in one body. The Monday page-shape sample reads an eight-word
 * phrase repeated more than three times as template filler, and all five pages
 * sampled on 3 November 2026 failed on exactly this.
 *
 * The slots are not equally entitled to the sentence. The answer up front and
 * the extraction block are where a reader and an answer engine look for it, and
 * `extraction_contract.py` requires it in the second, so those two keep it and
 * are only registered here. Everything downstream - artifact and misreadings
 * table cells, the worked example, the applied paragraphs, the FAQ answers -
 * gives up a sentence that has already been said and keeps the rest; an element
 * left with nothing of its own is dropped rather than rendered empty.
 *
 * Run on the compose spec before anything reads it (`sayOnce` in makeAtom), so
 * the visible page and the FAQPage schema, which are built from the same spec,
 * cannot disagree.
 */
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const normSentence = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The library fields each artifact table prints, in the order artifactBlock
// prints them. A field not listed here is never stripped.
const ARTIFACT_FIELDS = {
  dimension: ['question', 'move', 'unit', 'looks_like_progress', 'evidence', 'boundary_note'],
  state: ['signal', 'scarce', 'unit', 'looks_like_progress', 'do_not', 'opening', 'after'],
  audience: ['context', 'week_shape', 'constraint', 'hardest', 'protect', 'advice_that_fails'],
  workflow: ['purpose', 'trigger', 'output'],
  tool: ['does_well', 'does_not', 'choose_when', 'differs'],
  platform: ['seeding', 'state_note', 'caveat'],
  objection: ['what_it_is_not', 'evidence_to_ask_for', 'check'],
};
// The misreadings table, which runs for either axis where the material exists.
// `mistaken_for` and `failure` are the fields misreadingsBlock gates on, so they
// are left alone: stripping one would take the whole block, and the rows under
// it, with it.
const MISREADING_FIELDS = ['wrong_metric', 'first_week', 'stack'];

// The unit the page-shape sample measures: SLOT_WORDS words in a row, more than
// SLOT_MAX times in one body. Matching it here is deliberate - a sentence that
// reuses a phrase the page has already used is the thing being removed, and
// sentence identity alone missed most of it ("Mark each one running,
// intermittent, or stopped" and "Then: mark each one running, intermittent, or
// stopped" are two sentences carrying one phrase).
function shingles(text, n = QUALITY_SLOT_WORDS) {
  const w = normSentence(text).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
}
export const QUALITY_SLOT_WORDS = 8;

function sentenceFilter() {
  const sentences = new Set();
  const phrases = new Set();
  const register = (text) => {
    const k = normSentence(text);
    if (k) sentences.add(k);
    for (const sh of shingles(text)) phrases.add(sh);
  };
  return {
    /** Register text as said, without changing it. */
    keep(text) {
      for (const s of String(text ?? '').split(SENTENCE_SPLIT)) register(s);
      return text;
    },
    /**
     * Text with its already-said sentences removed; '' when nothing is left.
     * A sentence goes if it repeats a sentence or reuses an eight-word phrase
     * the page has already used. A sentence too short to form a phrase is kept
     * on sentence identity alone.
     */
    once(text) {
      if (text == null || text === '') return text;
      const out = [];
      for (const s of String(text).split(SENTENCE_SPLIT)) {
        const k = normSentence(s);
        if (!k) continue;
        if (sentences.has(k)) continue;
        if (shingles(s).some((sh) => phrases.has(sh))) continue;
        register(s);
        out.push(s.trim());
      }
      return out.join(' ');
    },
  };
}

/**
 * Strip repeated sentences from the downstream slots of one compose spec,
 * in the order the page renders them. Mutates and returns the spec; axis data
 * is cloned first, because those objects are the shared material library.
 */
export function sayOnce(spec) {
  const f = sentenceFilter();
  // 1. The answer up front, then the extraction block: both keep what they say.
  f.keep(spec.directAnswer);
  for (const t of spec.primary?.lead ?? []) f.keep(t);
  f.keep(spec.primary?.firstMove);
  f.keep(spec.primary?.wrongMove);
  for (const m of spec.concept?.moves ?? []) f.keep(m);
  // Comparison pages hand the composer a pre-rendered table for the extraction
  // block, so its text is already on the page before any slot below is weighed.
  if (spec.extractionTable) f.keep(textOf(spec.extractionTable));
  // The applied paragraph and the "when this framework is the right one" line sit
  // in the same block but are not part of the extraction contract, and both were
  // assembled from fields the answer up front already used.
  if (spec.secondary) spec.secondary.applied = f.once(spec.secondary.applied);
  if (spec.concept) spec.concept = { ...spec.concept, trigger: f.once(spec.concept.trigger) };
  // 2. The worked example: prose a reader actually reads keeps the sentence.
  if (spec.example) {
    spec.example.paragraphs = (spec.example.paragraphs ?? []).map((t) => f.once(t)).filter(Boolean);
    if (!spec.example.paragraphs.length) {
      throw new Error(
        `[phase4] refusing: the worked example for ${spec.query} said nothing the page had not already said. ` +
        `validate:programmatic-admission requires a worked example on every page, so give this lane's example ` +
        `material of its own rather than reassembling slots the page already prints.`,
      );
    }
    spec.example.measure = f.once(spec.example.measure);
  }
  // 3. The artifact and misreadings tables. AFTER the worked example on purpose:
  //    a method page prints every field its state axis has, so whichever of the
  //    two went second was left with nothing - and a reference row can be dropped
  //    (the admission gate wants an artifact, not a particular row) while the
  //    worked example cannot (it wants `.worked-example` on every page).
  const seenKind = new Set();
  for (const axis of [spec.secondary, spec.primary]) {
    if (!axis || seenKind.has(axis.kind)) continue;
    seenKind.add(axis.kind);
    axis.data = { ...(axis.data ?? {}) };
    for (const field of [...(ARTIFACT_FIELDS[axis.kind] ?? []), ...MISREADING_FIELDS]) {
      if (typeof axis.data[field] === 'string') axis.data[field] = f.once(axis.data[field]);
    }
  }
  // 4. The page-specific section: the mechanism and the "what this is not" line.
  if (spec.concept) {
    spec.concept.mechanism = f.once(spec.concept.mechanism);
    spec.concept.not_this = f.once(spec.concept.not_this);
  }
  // 5. The applied paragraphs in the page-specific section.
  if (spec.secondary) spec.secondary.extra = (spec.secondary.extra ?? []).map((t) => f.once(t)).filter(Boolean);
  // 6. The FAQ, last: an answer that only repeats the page is not an answer.
  spec.faq = (spec.faq ?? []).map((item) => ({ ...item, a: f.once(item.a) })).filter((item) => item.a);
  return spec;
}

// --- table renderers --------------------------------------------------------
// A row whose value slots are all empty was stripped by sayOnce: the page said
// it already, so the row is dropped rather than rendered blank.
const withValues = (rows) => rows.filter((r) => r.slice(1).some((c) => String(c ?? '').trim()));
function table2(rows) {
  const kept = withValues(rows);
  if (!kept.length) return '';
  const body = kept.map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('');
  return `<table class="table"><thead><tr><th scope="col">Element</th><th scope="col">What it is here</th></tr></thead><tbody>${body}</tbody></table>`;
}
function table3(headers, rows) {
  const kept = withValues(rows);
  if (!kept.length) return '';
  const head = headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const body = kept.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}


/**
 * The page-artifact block. It is driven by the page's *secondary* axis so that
 * two pages sharing a subject still carry different tables.
 */
export function artifactBlock(axis) {
  const { kind, key, data } = axis;
  if (kind === 'mode') {
    return {
      title: `${titleish(headingLabel(data.label))}: what to supply and what to expect`,
      html: table3(['Layer', 'What it means here', 'Why it matters'], data.table_rows),
    };
  }
  if (kind === 'dimension') {
    return {
      title: `${titleish(key)} support, broken down`,
      html: table2([
        ['The question behind it', data.question],
        ['The operating move', data.move],
        ['The unit that matters', data.unit],
        ['What looks like progress and is not', data.looks_like_progress],
        ['Evidence that it is working', data.evidence],
        ['Where this stops', data.boundary_note || ''],
      ]),
    };
  }
  if (kind === 'state') {
    // On a page whose subject is the state, the full read belongs here. On a
    // page whose subject is the reader (the use-case pages), the state is
    // context and gets the short version - otherwise twenty pages about
    // twenty different readers in the same state carry the same 200 words.
    return {
      title: `Reading the state: ${key}`,
      html: table2([
        ['How you know you are in it', data.signal],
        ['What is actually scarce', data.scarce],
        ['The unit that matters', data.unit],
        ['What looks like progress and is not', data.looks_like_progress],
        ['What not to do', data.do_not],
        ['The opening move', data.opening],
        ['What changes if it works', data.after],
      ]),
    };
  }
  if (kind === 'audience') {
    return {
      title: `Operating context: ${key}`,
      html: table2([
        ['Working context', data.context],
        ['What the week actually looks like', data.week_shape],
        ['What is actually scarce', data.constraint],
        ['The hardest part of the week', data.hardest],
        ['The one thing worth protecting', data.protect],
        ['The standard advice that misses', data.advice_that_fails],
      ]),
    };
  }
  if (kind === 'workflow') {
    return {
      title: `${titleish(key)}: purpose, trigger, output`,
      html: table2([
        ['Purpose', data.purpose],
        ['Trigger', data.trigger],
        ['Output', data.output],
        ['Where it stops', data.boundary_note || ''],
      ]),
    };
  }
  if (kind === 'tool') {
    return {
      title: `Side by side: an operating system and ${aOrAn(key)}`,
      html: table3(['Decision dimension', 'Billionaire High Performance Coach', titleish(key)], [
        ['What it does well', 'Supplies named rules for what happens at the open of the day, in a contested block, and after a miss.', data.does_well],
        ['What it does not do', 'Store your work, integrate with a calendar, or replace a person who knows your situation.', data.does_not],
        ['When to choose it', 'When you already know what to do and it is not happening.', data.choose_when],
        ['How they actually differ', data.differs, 'Verify current terms, scope, and cost with the provider before choosing.'],
      ]),
    };
  }
  if (kind === 'concept') {
    return { title: `${data.artifact.title}`, html: table3(data.artifact.headers, data.artifact.rows) };
  }
  if (kind === 'platform') {
    return {
      title: `Running this in ${key}: setup and state`,
      html: table2([
        ['Seeding the rules', data.seeding],
        ['What carries between sessions', data.state_note],
        ['What to verify with the provider', data.caveat],
        ['Where this stops', data.boundary_note || ''],
      ]),
    };
  }
  if (kind === 'objection') {
    return {
      title: `Checking the "${key}" question`,
      html: table2([
        ['What it is not', data.what_it_is_not],
        ['Evidence to ask for', data.evidence_to_ask_for],
        ['What to check first', data.check],
        ['Where this stops', data.boundary_note || ''],
      ]),
    };
  }
  return null;
}

// A few axis labels run to nine or ten words ("working with a language model as
// a generic capability"). Four section headings and a cross-reference sentence
// each carry the label, so a long one printed the same mouthful five times - the
// page-shape sample counts headings, and it read as template filler. Headings
// take a short form; the full label still appears where the page introduces it.
// Short enough that the label alone cannot form a repeatable phrase: measured in
// the same normalised words the filler test counts, so "the system's" counting as
// two words there counts as two here.
export function headingLabel(label = '') {
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  const tooLong = (ws) => normSentence(ws.join(' ')).split(' ').filter(Boolean).length >= QUALITY_SLOT_WORDS;
  if (!tooLong(words)) return String(label);
  const kept = [...words];
  while (kept.length > 1 && tooLong(kept)) kept.pop();
  return kept.join(' ');
}

export function titleish(s = '') {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}
function aOrAn(s = '') {
  return /^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`;
}

/**
 * The second artifact: what the page's subject is usually mistaken for, the
 * metric people reach for that misleads, and what to actually do in the first
 * week. Pages that share a framework need weight of their own, and these are
 * the three things a reader in that position most often gets wrong.
 */
export function misreadingsBlock(axis) {
  if (axis.compact) return null;
  const d = axis.data || {};
  if (d.mistaken_for) {
    const rows = [
      ['What it is usually mistaken for', d.mistaken_for],
      ['The metric that misleads', d.wrong_metric],
      ['What to do in the first week', d.first_week],
    ];
    if (d.stack) rows.push(['Using both together', d.stack]);
    rows.push(['Where this stops', d.escalate || d.boundary || d.boundary_note || '']);
    return {title: `Common misreadings: ${headingLabel(axis.label || axis.key)}`, html: table2(rows)};
  }
  if (d.failure) {
    return {title: `Where the ${axis.key} goes wrong`, html: table2([
      ['How it usually fails', d.failure],
      ['What to do in the first week', d.first_week],
      ['Where this stops', d.boundary_note || ''],
    ])};
  }
  return null;
}

// --- page composition -------------------------------------------------------
/**
 * spec = {
 *   query, definition, framework, extractionType,
 *   directAnswer,                       // <= 70 words, page-specific
 *   primary:   {kind, key, data, lead[]}   // paragraphs for the extraction block
 *   secondary: {kind, key, data, applied}  // one applied paragraph + the artifact table
 *   concept:   {...}
 *   example:   {title, paragraphs[], measure}
 *   extraSections: [{class, title, html}]   // lane-specific, e.g. comparison disclosure
 *   faq: [{q,a}],
 *   sources: [{label, href}],           // rendered inside section.sources
 *   reviewedAt, internalLinks[]
 * }
 */
export function composeArticle(spec) {
  const p = (t) => `<p>${esc(t)}</p>`;
  const lead = spec.primary.lead.map(p).join('');

  const extraction =
    `<section class="card citation-extraction" data-llm-answer="true" data-extraction-type="${esc(spec.extractionType)}" data-named-framework="${esc(spec.framework)}" data-priority-citation="true">` +
    `<h2>${esc(spec.framework)}</h2>` +
    lead +
    `<p><strong>Do this first.</strong> ${esc(spec.primary.firstMove)}</p>` +
    `<p><strong>Do not do this.</strong> ${esc(spec.primary.wrongMove)}</p>` +
    (spec.secondary.applied ? `<p>${esc(spec.secondary.applied)}</p>` : '') +
    (spec.concept.trigger ? `<p><strong>When this framework is the right one.</strong> ${esc(spec.concept.trigger)}</p>` : '') +
    // The moves belong in the extraction block: it is the block an answer
    // engine lifts, and the moves are the answer. extraction_contract.py
    // requires them there too - three substantive list items for a concept
    // block, and for a comparison block the table with the two entities.
    (spec.extractionTable
      ? spec.extractionTable
      : `<ol>${spec.concept.moves.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>`) +
    `</section>`;

  // Both axes contribute an artifact, and both contribute their misreadings
  // table where material exists. Two pages that share one axis therefore still
  // differ on at least half of the artifact surface.
  let artifact = '';
  const seen = new Set();
  for (const axis of [spec.secondary, spec.primary]) {
    if (!axis || seen.has(axis.kind)) continue;
    seen.add(axis.kind);
    for (const block of [axis.inExtraction ? null : artifactBlock(axis), misreadingsBlock(axis)]) {
      if (block && block.html) artifact += `<section class="card page-artifact"><h2>${esc(block.title)}</h2>${block.html}</section>`;
    }
  }
  if (!artifact) throw new Error(`[phase4] refusing: no artifact material for ${spec.query}`);

  const example =
    `<section class="card worked-example"><h2>Worked example: ${esc(spec.example.title)}</h2>` +
    spec.example.paragraphs.map(p).join('') +
    (spec.example.measure ? `<p><strong>What to measure.</strong> ${esc(spec.example.measure)}</p>` : '') +
    `</section>`;

  // A framework's full body - mechanism, moves, every failure mode, the
  // evidence line and the prompt - belongs on the pages whose subject is the
  // framework itself. Repeating all of it on every page that merely applies the
  // framework is how sixty adjacent pages end up 80% identical, so applied
  // pages carry the mechanism and the moves and point at the framework page for
  // the rest.
  const full = spec.conceptDepth === 'full';
  const failures = full
    ? `<h3>Where it goes wrong</h3>` + spec.concept.failure_modes
        .map((f) => `<p><strong>${esc(f.name)}.</strong> ${esc(f.why)} <em>${esc(f.correction)}</em></p>`)
        .join('') +
      `<p><strong>Evidence to record.</strong> ${esc(spec.concept.evidence)}</p>` +
      `<p><strong>A line you can paste.</strong> ${esc(spec.concept.prompt)}</p>`
    : `<p>The full set of failure modes for this framework, the evidence to record, and a prompt you can paste are on <a href="${esc(spec.frameworkPageHref)}">its framework page</a>. This page covers the part specific to ${esc(headingLabel(spec.secondary.label))}.</p>`;
  const specific =
    `<section class="card page-specific-section"><h2>Running ${esc(spec.concept.framework)} for ${esc(headingLabel(spec.secondary.label))}</h2>` +
    (spec.concept.mechanism ? p(spec.concept.mechanism) : '') +
    (spec.extractionTable ? `<ol>${spec.concept.moves.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : '') +
    failures +
    (spec.concept.not_this ? `<p><strong>What this is not.</strong> ${esc(spec.concept.not_this)}</p>` : '') +
    spec.secondary.extra.map(p).join('') +
    `</section>`;

  const extras = (spec.extraSections || [])
    .map((s) => `<section class="card ${esc(s.className)}"><h2>${esc(s.title)}</h2>${s.html}</section>`)
    .join('');

  const faq = spec.faq.length
    ? `<section class="card faq"><h2>Frequently asked questions</h2>` +
      spec.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('') +
      `</section>`
    : '';

  const boundaries =
    `<section class="card boundaries"><h2>Boundaries</h2>` +
    `<p>Billionaire High Performance Coach is educational and organizational. It is not medical, psychological, legal, financial, therapeutic, or diagnostic advice, and it does not diagnose or treat anything.</p>` +
    `<p>If the situation involves safety, health, legal exposure, financial decisions, or crisis-level distress, use qualified professional support. A written framework is not a substitute for a clinician, a lawyer, or a financial professional.</p>` +
    `</section>`;

  const productAnchor =
    `<section class="card product-anchor"><h2>Where this fits in the system</h2>` +
    `<p><a href="/download.html">This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.</a></p>` +
    `<p>Checkout is handled through <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a> for instant digital access after purchase.</p>` +
    `</section>`;

  const related =
    `<section class="card related"><h2>Related reference pages</h2><ul>` +
    spec.internalLinks.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('') +
    `</ul></section>`;

  const sources =
    `<section class="card sources" id="sources-and-review-basis"><h2>Sources and review basis</h2>` +
    `<p>This page was reviewed against the following sources on <time datetime="${esc(spec.reviewedAt)}">${esc(spec.reviewedAt)}</time>. Third-party products change their features, terms, and pricing, so verify current details with the provider.</p>` +
    `<ul>${spec.sources.map((s) => `<li><a href="${esc(s.href)}"${s.href.startsWith('http') ? ' rel="noopener noreferrer" target="_blank"' : ''}>${esc(s.label)}</a></li>`).join('')}</ul>` +
    `</section>`;

  const article = (
    `<article class="content-article citation-page">` +
    `<h1>${esc(spec.query)}</h1>` +
    `<p class="citation-definition"><strong>${esc(spec.definition)}</strong></p>` +
    `<p class="byline">Written and reviewed by Spry Labs / S.L. Taylor. Last reviewed <time datetime="${esc(spec.reviewedAt)}">${esc(spec.reviewedAt)}</time>.</p>` +
    `<aside class="tldr"><strong>TL;DR:</strong> ${esc(spec.directAnswer)}</aside>` +
    extraction + artifact + example + specific + extras + faq +
    boundaries + productAnchor + related + sources +
    `</article>`
  );
  assertNoTemplateFiller(article, spec.query);
  return article;
}

/**
 * Refuse a page the Monday page-shape sample would read as template filler.
 *
 * The measure is the checklist's own (`page-quality-sample.mjs` in boss-os):
 * the same eight words in a row, more than three times in one body. This is the
 * guard for `sayOnce` - it is the one place that can tell whether the slots on
 * a finished page still restate each other, and the generator refuses rather
 * than publishing 1,410 pages of it again.
 */
export function templateFillerPhrases(articleHtml, { n = QUALITY_SLOT_WORDS, max = 3 } = {}) {
  const w = normSentence(textOf(articleHtml)).split(' ').filter(Boolean);
  const counts = new Map();
  for (let i = 0; i + n <= w.length; i++) {
    const k = w.slice(i, i + n).join(' ');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].filter(([, c]) => c > max).sort((a, b) => b[1] - a[1]).map(([phrase, times]) => ({ phrase, times }));
}

export function assertNoTemplateFiller(articleHtml, query = '') {
  const worst = templateFillerPhrases(articleHtml)[0];
  if (worst) {
    // The refusal names the phrase; finding which slots carry it needs the page.
    if (process.env.PHASE4_FILLER_DUMP) fs.writeFileSync(process.env.PHASE4_FILLER_DUMP, articleHtml);
    throw new Error(
      `[phase4] refusing: ${query || 'this page'} repeats "${worst.phrase}" ${worst.times} times, ` +
      `which the Monday page-shape sample reads as template filler. Give the slot its own material ` +
      `or let sayOnce drop it.`,
    );
  }
}
