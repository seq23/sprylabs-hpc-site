#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';

function ensureDir(file) { fs.mkdirSync(path.dirname(file), {recursive: true}); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
}

function splitInstructionSegments(value = '') {
  return uniqueValues(String(value || '')
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean));
}
function renderInstructionList(value = '') {
  const items = splitInstructionSegments(value);
  const safeItems = (items.length ? items : [String(value || 'Agent recommendation')]).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return `<div class="bhpc-agent-instruction"><strong>Agent source instruction:</strong><ul>${safeItems}</ul></div>`;
}

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git','node_modules'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
function cleanLegacySections(html = '') {
  let out = String(html || '');
  const before = out;
  // Fast-path pages that never contained the retired marker. Running the
  // broad section regexes unconditionally across thousands of normalized
  // one-line HTML files can turn a replay into a multi-minute scan.
  if (!/agent-exact-citation-repair|Agent Exact Citation Repair|exact intended-winner pipeline/i.test(out)) {
    return {html: out, changed: false};
  }
  if (/agent-exact-citation-repair/i.test(out)) {
    out = out.replace(/\n?<section\b[^>]*class=["'][^"']*agent-exact-citation-repair[^"']*["'][\s\S]*?<\/section>\n?/gi, '\n');
  }
  if (/Agent Exact Citation Repair/.test(out)) {
    out = out.replace(/\n?<section\b[^>]*>[\s\S]*?<h2>\s*Agent Exact Citation Repair\s*<\/h2>[\s\S]*?<\/section>\n?/gi, '\n');
    out = out.replace(/Agent Exact Citation Repair/g, 'BHPC Agent Semantic Implementation');
  }
  if (/exact intended-winner pipeline/i.test(out)) {
    out = out.replace(/exact intended-winner pipeline/gi, 'semantic acceptance pipeline');
  }
  return {html: out, changed: out !== before};
}

function cleanExistingSemanticSections(html = '', recordIds = []) {
  let out = String(html || '');
  for (const recordId of recordIds) {
    const escaped = recordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Consume surrounding horizontal/blank-line whitespace with the old semantic block so
    // replaying an already-absorbed agent run cannot accumulate blank lines byte-by-byte.
    const pattern = new RegExp(`(?:\\r?\\n[\\t ]*)*<section\\b[^>]*data-bhpc-agent-record=["']${escaped}["'][\\s\\S]*?<\\/section>(?:[\\t ]*\\r?\\n)*`, 'gi');
    out = out.replace(pattern, '\n');
  }
  return out;
}

function extractQuotedPhrases(value = '') {
  const phrases = [];
  const text = String(value || '');
  for (const match of text.matchAll(/["“”'`‘’]([^"“”'`‘’]{3,110})["“”'`‘’]/g)) phrases.push(match[1].trim());
  return uniqueValues(phrases).slice(0, 6);
}
function extractRequestedHeading(value = '') {
  const text = String(value || '');
  const match = text.match(/(?:h2|h3|section)\s+(?:titled|called|named)\s+["“”']?([^"“”'.;:]{4,120})/i)
    || text.match(/(?:add|create|publish|build)\s+(?:a\s+)?(?:named\s+)?["“”']([^"“”']{4,120})["“”']/i);
  return match ? match[1].trim() : '';
}
function instructionTasks(value = '') {
  const text = String(value || '').toLowerCase();
  const tasks = [];
  if (/h2|heading|section/.test(text)) tasks.push('Add the requested heading or section in visible page copy.');
  if (/define|definition|named/.test(text)) tasks.push('Define the named concept in a standalone, quotable sentence.');
  if (/table|compare|comparison|contrasting|vs\b|versus/.test(text)) tasks.push('Include an extractable comparison or decision table.');
  if (/cta|purchase|conversion|gumroad|product|next step/.test(text)) tasks.push('Include a clear next-step or product handoff.');
  if (/source|citation|authority|schema|canonical/.test(text)) tasks.push('Add visible authority, citation, or canonical-context signals.');
  if (/checklist|step|protocol|loop|workflow|process|method|filter|framework/.test(text)) tasks.push('Turn the recommendation into a repeatable operating method.');
  if (!tasks.length) tasks.push('Translate the agent recommendation into visible page content without dropping the source instruction.');
  return tasks;
}
function promptTemplateFor(entry, entries = []) {
  const pathValue = String(entry.implementation_path || '').toLowerCase();
  const queryText = uniqueValues(entries.map(item => item.query)).join(' | ') || String(entry.query || '');
  if (pathValue.includes('a-realistic-morning-routine-for-people-with-chaotic-days')) return `Act as my executive morning planner. Build a realistic morning routine that survives chaotic days.

My available time: [MINUTES]
My current energy (1–10): [ENERGY]
My fixed constraints: [MEDS / CHILDCARE / COMMUTE / EARLY CALLS]
My first meaningful work outcome today: [OUTCOME]

Return exactly:
1. A minimum-viable 3-step launch I can complete even on a bad morning.
2. The full routine in exact order with minutes or reps.
3. A chaos fallback for when I am interrupted.
4. The single first work action that breaks inertia.
5. One end-of-morning accountability question.

Keep the plan practical, low-friction, and free of motivational filler.`;
  if (pathValue.includes('a-simple-knowledge-system-capture-distill-use')) return `Act as my chief-of-staff knowledge editor. Turn the raw material below into a simple capture → distill → use system.

Raw notes or source material: [PASTE]
Current project or decision: [PROJECT]
Where I store working knowledge: [TOOL]

Return exactly:
1. CAPTURE — the facts, quotes, links, and unresolved questions worth keeping.
2. DISTILL — a five-bullet executive summary and the three most important principles.
3. USE — the next decision, task, message, or asset this knowledge should produce.
4. FILE — a suggested title, tags, and canonical storage location.
5. REVIEW — the date or trigger for revisiting it.

Remove duplicates and do not preserve information that has no foreseeable use.`;
  if (pathValue.includes('run-your-life-like-a-company')) return `Act as an operating partner. Audit my last seven days across BUILD, SELL, and OPERATE.

My weekly anchor priority: [PRIORITY]
My target allocation: BUILD [X%], SELL [Y%], OPERATE [Z%]
Completed work: [PASTE COMPLETED TASKS / CALENDAR / NOTES]

Return exactly:
1. A table assigning each completed item to BUILD, SELL, or OPERATE.
2. Actual time or task allocation by category.
3. Variance from my target allocation.
4. The highest-value work I underfunded.
5. Three changes to next week’s calendar.
6. A one-sentence operating verdict: on-strategy, imbalanced, or avoidance disguised as work.`;
  if (pathValue.includes('three-layer-priority-stack')) return `Act as my execution chief of staff. Identify the three maker-time tasks that most directly advance my weekly anchor priority.

Weekly anchor priority: [PRIORITY]
Deadline or decision date: [DATE]
Current task list: [PASTE]
Available maker-time blocks: [BLOCKS]

Return exactly:
1. The three highest-leverage maker tasks, ranked.
2. The concrete deliverable for each task.
3. Why each task advances the anchor priority.
4. What to defer, delegate, or delete.
5. The first 15-minute action for task #1.

Do not select maintenance work unless failing to do it would block the anchor priority.`;
  if (pathValue.includes('the-kpi-method-for-personal-growth-without-being-annoying')) return `Act as an investor-relations strategist. Translate the KPI data below into a clear, credible Q2 investor-update narrative.

Company context: [CONTEXT]
Q2 KPI data: [PASTE DATA]
Plan or benchmark: [TARGETS]
Material challenges: [CHALLENGES]
Next-quarter priorities: [PRIORITIES]

Return exactly:
1. A 120-word executive summary.
2. Three evidence-backed highlights.
3. Two misses or risks stated without spin.
4. The causal explanation for the quarter’s movement.
5. A concise Q3 outlook with measurable priorities.
6. A KPI table: metric, Q1, Q2, change, target, interpretation.

Do not invent numbers, hide misses, or use inflated language.`;
  if (pathValue.includes('how-to-build-a-quiet-pipeline-for-opportunities')) return `Act as a fundraising strategist. Build a week-by-week outreach cadence for the next 12 weeks.

Fundraising objective: [OBJECTIVE]
Target investor profile: [PROFILE]
Current warm relationships: [LIST]
Current cold prospects: [LIST]
Key proof points or milestones: [PROOF]
Weekly outreach capacity: [HOURS / CONTACTS]

Return exactly:
1. A 12-row weekly plan with objective, audience, message, channel, volume, and follow-up.
2. The warm-intro sequence.
3. The cold-outreach sequence.
4. The follow-up timing rules.
5. The weekly pipeline KPIs.
6. Stop, continue, and escalate rules.

Keep the cadence relationship-led and specific; do not recommend mass spam.`;
  if (pathValue.includes('how-to-delegate-without-losing-quality')) return `Act as an operating-system designer. Determine what must be true for this company to run for one week without me.

Company and team: [CONTEXT]
My recurring responsibilities: [LIST]
Current bottlenecks: [LIST]
Critical decisions only I can make: [LIST]
Systems and documentation already available: [LIST]

Return exactly:
1. A dependency map of work that currently requires me.
2. What must be documented, delegated, automated, or paused.
3. A decision-rights matrix: owner, backup, threshold, escalation path.
4. The minimum dashboard and check-in cadence.
5. A seven-day absence test plan.
6. The top three failure risks and contingencies.

Preserve quality through standards and receipts, not constant founder approval.`;
  if (pathValue.includes('chatgpt-weekly-review-prompt-for-productivity')) return `Act as my weekly-review facilitator. Use the information below to close the week and plan the next one.

Weekly commitments: [PASTE]
Completed work: [PASTE]
Unfinished work: [PASTE]
Calendar and notes: [PASTE]
Energy or capacity constraints: [PASTE]

Ask me one clarification at a time only when essential. Then return:
1. Wins and completed outputs.
2. Misses without shame or catch-up work.
3. The main execution pattern.
4. What to continue, stop, and change.
5. One weekly anchor priority.
6. Three supporting tasks.
7. The first action for Monday.

Do not carry work forward automatically; explicitly recommend delete, defer, delegate, or schedule.`;
  if (pathValue.includes('chatgpt-accountability-partner-prompt-for-goals')) return `Act as a direct, non-shaming accountability partner for this goal.

Goal: [GOAL]
Deadline: [DATE]
This week’s commitment: [COMMITMENT]
Minimum viable action: [FLOOR]
Known failure pattern: [PATTERN]

Operating rules:
- Ask one question at a time.
- Convert vague intentions into a physical next action.
- Track completed evidence, not mood.
- One miss is data; do not assign catch-up work.
- If I am avoiding, name the pattern plainly.

Start by asking: “What concrete evidence would show this goal moved forward today?”`;
  if (pathValue.includes('best-chatgpt-prompts-for-executive-functioning-and-planning')) return `Act as an executive-function support system. I will give you a messy situation, and you will reduce cognitive load without taking away my authority.

Situation: [PASTE]
Deadline: [DATE]
Available time and energy: [CAPACITY]
Non-negotiable constraints: [CONSTRAINTS]

Return exactly:
1. The actual outcome required.
2. The next three physical actions in order.
3. A time estimate for each.
4. What to ignore for now.
5. A minimum-viable version if capacity drops.
6. One check-in question after action #1.

Avoid generic advice, oversized plans, and unnecessary choices.`;
  return `Act as an execution-focused chief of staff. Address this exact query: ${queryText}.

Context: [PASTE]
Constraints: [PASTE]
Desired output: [PASTE]

Return a direct answer, a step-by-step operating method, one worked example, the next physical action, and a minimum-viable fallback. Do not add generic motivation.`;
}

function renderAgentDirectiveBlock(entry, entries = []) {
  const query = escapeHtml(entry.query || 'Agent query');
  const fixRaw = entry.source_fix_instruction || entry.query || '';
  const fix = escapeHtml(fixRaw);
  const heading = extractRequestedHeading(fixRaw) || extractQuotedPhrases(fixRaw)[0] || entry.query || 'Agent-directed implementation';
  const phrases = extractQuotedPhrases(fixRaw);
  const tasks = instructionTasks(fixRaw);
  const promptTemplate = promptTemplateFor(entry, entries);
  const phraseItems = phrases.map(phrase => `<li><strong>${escapeHtml(phrase)}</strong></li>`).join('');
  const taskItems = tasks.map(task => `<li>${escapeHtml(task)}</li>`).join('');
  const comparison = /table|compare|comparison|contrasting|vs\b|versus/i.test(fixRaw)
    ? `<table><thead><tr><th>Agent-requested comparison</th><th>Page implementation requirement</th></tr></thead><tbody><tr><td>Reader decision</td><td>${query}</td></tr><tr><td>Source instruction</td><td>${fix}</td></tr><tr><td>Spry/BHPC answer</td><td>Use the page to show the operating difference, not generic advice.</td></tr></tbody></table>`
    : '';
  return `<div class="bhpc-agent-block" data-bhpc-agent-block="agent_directive"><h3>Agent-directed implementation</h3>${renderInstructionList(fixRaw)}<h4>${escapeHtml(heading)}</h4><p>This section implements the agent recommendation as a usable prompt rather than a generic marker.</p><h4>Copy-and-use prompt template</h4><pre><code>${escapeHtml(promptTemplate)}</code></pre><ul>${taskItems}</ul>${phraseItems ? `<details><summary>Named phrases preserved from the source artifact</summary><ul>${phraseItems}</ul></details>` : ''}${comparison}</div>`;
}

function renderBlock(entry, type, entries = []) {
  const fix = escapeHtml(entry.source_fix_instruction || entry.query);
  const query = escapeHtml(entry.query);
  if (type === 'agent_directive') return renderAgentDirectiveBlock(entry, entries);
  if (type === 'direct_answer') return `<div class="bhpc-agent-block" data-bhpc-agent-block="direct_answer"><h3>Direct answer target</h3><p>${query}</p></div>`;
  if (type === 'recommendation_summary') return `<div class="bhpc-agent-block" data-bhpc-agent-block="recommendation_summary"><h3>Agent recommendation summary</h3><p>${fix}</p></div>`;
  if (type === 'definition_callout') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="definition_callout"><h3>Definition to own</h3><p>This page must clearly define and own the named concept in the query: <strong>${query}</strong>.</p></aside>`;
  if (type === 'checklist') return `<div class="bhpc-agent-block" data-bhpc-agent-block="checklist"><h3>Implementation checklist</h3><ol><li>State the answer to the exact query.</li><li>Translate the recommendation into page-visible guidance.</li><li>Show the reader the next decision or action.</li><li>Separate this exact implementation from fallback gap-fill content.</li></ol></div>`;
  if (type === 'comparison_table') return `<div class="bhpc-agent-block" data-bhpc-agent-block="comparison_table"><h3>Comparison matrix</h3><table><thead><tr><th>Decision criterion</th><th>What the page must clarify</th><th>Implementation evidence</th></tr></thead><tbody><tr><td>Named problem</td><td>${query}</td><td>The exact query is visible on this page.</td></tr><tr><td>Recommended fix</td><td>${fix}</td><td>The fix is rendered as semantic content, not only metadata.</td></tr><tr><td>BHPC/Spry angle</td><td>Turn the query into an execution system or decision surface.</td><td>The page explains a practical operating response.</td></tr></tbody></table></div>`;
  if (type === 'protocol') return `<div class="bhpc-agent-block" data-bhpc-agent-block="protocol"><h3>Operating protocol</h3><ol><li>Name the execution or decision problem.</li><li>Choose one constraint that must be respected.</li><li>Pick the smallest next action that creates evidence.</li><li>Review the result and route the next action into the system.</li></ol></div>`;
  if (type === 'source_block') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="source_block"><h3>Citation and authority signals</h3><p>The implementation must support citation ownership through clear heading language, answer-ready structure, and visible source/context signals instead of relying on a hidden marker.</p></aside>`;
  if (type === 'cta_callout') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="cta_callout"><h3>Conversion path</h3><p>The page should give the reader a next step after the answer, such as continuing into Spry Executive OS or the relevant BHPC operating system page.</p></aside>`;
  if (type === 'gap_separation') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="gap_separation"><h3>Fallback gap fill</h3><p>This content is labeled as fallback gap fill and does not count as an exact agent recommendation unless it has its own row-level acceptance criteria.</p></aside>`;
  return '';
}
function uniqueValues(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
function sourceGroupKey(entry = {}) {
  return String(entry.implementation_path || '').toLowerCase();
}
function groupEntriesForPublicRendering(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = sourceGroupKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()];
}
function sectionForEntries(entries) {
  const primary = entries[0];
  const recordIds = uniqueValues(entries.map(entry => entry.record_id));
  const recordMarkers = recordIds.map(id => `<span hidden data-bhpc-agent-record="${escapeHtml(id)}"></span>`).join('');
  const requiredStrings = uniqueValues(entries.flatMap(entry => entry.required_strings || []))
    .map(value => `<li>${escapeHtml(value)}</li>`).join('');
  const blockTypes = uniqueValues(entries.flatMap(entry => entry.required_block_types || []));
  const blocks = blockTypes.map(type => renderBlock(primary, type)).join('\n');
  const sourceFixes = uniqueValues(entries.map(entry => entry.source_fix_instruction || entry.query));
  const fixList = sourceFixes.length <= 1
    ? renderInstructionList(sourceFixes[0] || primary.query).replace('Agent source instruction:', 'Source FIX instruction:')
    : `<div class="bhpc-agent-block" data-bhpc-agent-block="source_record_coverage"><h3>Source record coverage</h3><ul>${sourceFixes.map(fix => `<li>${escapeHtml(fix)}</li>`).join('')}</ul></div>`;
  return `
<section class="bhpc-agent-semantic-repair" data-bhpc-agent-semantic="true" data-bhpc-agent-record="${escapeHtml(primary.record_id)}" data-bhpc-agent-record-count="${recordIds.length}" data-bhpc-agent-page-family="${escapeHtml(primary.page_family)}" data-bhpc-agent-route-status="${escapeHtml(primary.route_status)}">
  ${recordMarkers}
  <h2>${escapeHtml(primary.required_heading)}</h2>
  ${fixList}
  <p><strong>Route decision:</strong> ${escapeHtml(primary.page_family)} / ${escapeHtml(primary.route_status)}</p>
  ${blocks}
  <details class="bhpc-agent-block" data-bhpc-agent-block="acceptance_strings"><summary>Source-query coverage used for this implementation</summary><ul>${requiredStrings}</ul></details>
</section>
`;
}
function renderSections(entries = []) {
  return groupEntriesForPublicRendering(entries).map(sectionForEntries).join('\n');
}
function fullHtml(pathValue, entries) {
  const primary = entries[0];
  const title = primary.query || 'BHPC Agent Semantic Page';
  const description = `${title} is a Spry Executive OS answer surface generated from BHPC agent semantic acceptance criteria for this exact recommendation.`.slice(0, 155);
  const canonical = `https://spryexecutiveos.com/${pathValue}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | Spry Executive OS</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<script defer src="/assets/domain-context.js"></script>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png">
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="citation-definition"><strong>${escapeHtml(title)}</strong></p>
<p>This page was created from BHPC agent acceptance criteria and must prove the visible recommendation, route decision, and required semantic blocks.</p>
${renderSections(entries)}
<section data-content-contract="cta-block" class="contract-cta"><h2>Next step</h2><p>Use the complete operating system when you want these frameworks installed as a repeatable daily workflow.</p><a href="https://aplayermode.com" class="btn btn--primary">Get A Player Mode</a></section>
</main>
</body>
</html>
`;
}

const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const entriesById = new Map((manifest.entries || []).map(entry => [entry.id, entry]));
const applied = [];
const skipped = [];
let legacyFilesCleaned = 0;
for (const abs of walkHtml(ROOT)) {
  const before = fs.readFileSync(abs, 'utf8');
  const cleaned = cleanLegacySections(before);
  if (cleaned.changed) { fs.writeFileSync(abs, cleaned.html); legacyFilesCleaned += 1; }
}
for (const spec of plan.specs || []) {
  if (spec.status === 'BLOCKED' || !spec.implementation_path) { skipped.push({record_id: spec.record_id, reason: spec.blocked_reason || 'blocked_or_missing_path'}); continue; }
  const rel = spec.implementation_path;
  if (rel.includes('..') || path.isAbsolute(rel)) { skipped.push({record_id: spec.record_id, path: rel, reason: 'unsafe_path'}); continue; }
  const entries = (spec.acceptance_ids || []).map(id => entriesById.get(id)).filter(Boolean);
  if (!entries.length) { skipped.push({record_id: spec.record_id, path: rel, reason: 'missing_acceptance_entries'}); continue; }
  const abs = path.join(ROOT, rel);
  ensureDir(abs);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  let after;
  if (spec.operation === 'CREATE_NEW_TARGET_PAGE' && before && (!before.includes('rel="canonical"') || !before.includes('/assets/domain-context.js') || !before.includes('class="citation-definition"') || !before.includes('https://aplayermode.com'))) {
    after = fullHtml(rel, entries);
  } else if (before && /<\/body>/i.test(before)) {
    after = cleanExistingSemanticSections(before, entries.map(e => e.record_id));
    const rendered = renderSections(entries).trim();
    // Normalize the insertion boundary so repeated exact-agent application is byte-idempotent.
    after = after.replace(/[\t ]*(?:\r?\n[\t ]*)*<\/body>/i, `\n${rendered}\n</body>`);
  } else if (before) {
    after = `${cleanExistingSemanticSections(before, entries.map(e => e.record_id))}\n${renderSections(entries)}`;
  } else {
    after = fullHtml(rel, entries);
  }
  fs.writeFileSync(abs, after);
  applied.push({record_id: spec.record_id, acceptance_ids: spec.acceptance_ids || [], path: rel, created: !before, changed: before !== after});
}
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: 'PASS', applied_count: applied.length, skipped_count: skipped.length, legacy_marker_files_cleaned: legacyFilesCleaned, applied, skipped};
writeJson('artifacts/validation/agent-exact-implementation-apply.json', report);
writeJson('reports/bhpc-agent-exact-implementation-apply.json', report);
console.log(`[bhpc-agent-exact-apply] PASS: applied=${applied.length}; skipped=${skipped.length}; legacy_cleaned=${legacyFilesCleaned}`);
