#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';
import {requiredBlockTypesForPageFamily} from '../lib/bhpc_agent_block_schema.mjs';
import {groupBhpcSemanticEntries, renderBhpcRecordEvidence, renderBhpcVisibleSourceEvidence, requiredBlockTypesForBhpcEntry} from '../lib/bhpc_agent_semantic_contract.mjs';
import {normalizeBhpcInternalLinkHref, normalizeBhpcExternalCtaHref} from '../lib/bhpc_internal_links.mjs';
import {mergeBhpcExternalCtaLinks} from '../lib/bhpc_conversion_contract.mjs';
import {BHPC_PRODUCT_ANCHOR_SENTENCE, bhpcGeneratedCitationDefinition} from '../lib/bhpc_public_page_contract.mjs';
import {createRequire} from 'node:module';
const requireCjs = createRequire(import.meta.url);
const {routeFor: sharedRouteFor} = requireCjs('../lib/dual_domain_policy.cjs');

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
  const safeItems = (items.length ? items : [String(value || 'Recommended change')]).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return `<div class="bhpc-agent-instruction"><strong>What to add:</strong><ul>${safeItems}</ul></div>`;
}

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git','.pages-output', 'node_modules'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
function cleanLegacySections(html = '') {
  let out = String(html || '');
  const before = out;
  // Fast-path pages that never contained retired or public operational scaffolding.
  if (!/agent-exact-citation-repair|Agent Exact Citation Repair|exact intended-winner pipeline|bhpc-agent-semantic-repair|Agent recommendation implementation|Agent-directed implementation|Agent source instruction|Source FIX instruction|Route decision|acceptance criteria/i.test(out)) {
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
    out = out.replace(/exact intended-winner pipeline/gi, 'content improvement pipeline');
  }
  out = out
    .replace(/Agent recommendation implementation:\s*/gi, '')
    .replace(/Agent-directed implementation/gi, 'Practical implementation')
    // Relabelling a build directive does not make it reader-facing. These
    // shipped as "What to add: n/a" on 65 live pages. Drop them.
    .replace(/<p><strong>(?:Agent source instruction|Source FIX instruction):<\/strong>[\s\S]*?<\/p>/gi, '')
    .replace(/<div class="bhpc-agent-instruction">[\s\S]*?<\/div>/gi, '')
    .replace(/Agent source instruction:/gi, '')
    .replace(/Source FIX instruction:/gi, '')
    .replace(/Agent recommendation summary/gi, 'What this page recommends')
    .replace(/BHPC agent recommendation/gi, 'BHPC recommendation')
    .replace(/agent recommendation/gi, 'recommended change')
    .replace(/<p><strong>Route decision:<\/strong>[\s\S]*?<\/p>/gi, '')
    .replace(/<details\b[^>]*data-bhpc-agent-block=["']acceptance_strings["'][\s\S]*?<\/details>/gi, '')
    .replace(/<div\b[^>]*data-bhpc-agent-block=["']acceptance_strings["'][\s\S]*?<\/div>/gi, '')
    .replace(/This page was created from BHPC agent acceptance criteria[^<]*\.?/gi, 'This guide provides a practical answer and a clear next step.')
    .replace(/BHPC Agent Acceptance Framework\s*[—-]\s*([^<"\n]+?)\s+converts the (?:agent recommendation|recommended change) into visible semantic proof and route-specific implementation\.?/gi, '$1 explains the decision, the operating method, and the next practical step.')
    .replace(/BHPC Agent Acceptance Framework\s*[—-]\s*/gi, '')
    .replace(/visible semantic proof/gi, 'clear practical guidance')
    .replace(/route-specific implementation/gi, 'a useful next step')
    .replace(/Source record coverage/gi, 'Topic coverage')
    .replace(/Named phrases preserved from the source artifact/gi, 'Key terms used in this guide')
    .replace(/Required acceptance strings/gi, 'Practical decision points');
  return {html: out, changed: out !== before};
}

function cleanExistingSemanticSections(html = '') {
  return String(html || '').replace(/(?:\r?\n[\t ]*)*<section\b[^>]*class=["'][^"']*bhpc-agent-semantic-repair[^"']*["'][\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
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
function contentProfileFor(entry = {}) {
  const route = String(entry.implementation_path || '').toLowerCase();
  if (route.includes('how-can-chatgpt-help-me-plan-my-day-like-ali-abdaal-s-daily-highlight-method')) return {
    directAnswer: 'Use ChatGPT as a planning assistant to choose one daily highlight, then organize the rest of the day around protecting that outcome. Give it your fixed commitments, candidate priorities, available focus time, and energy constraints; have it recommend one highlight, explain the tradeoff, reserve a realistic work block, and name a smaller fallback. This is a ChatGPT adaptation of the named planning idea, not a claim that Ali Abdaal prescribed this AI workflow.',
    summary: 'The useful output is one explicit highlight, one protected block for it, supporting tasks that do not compete with it, and a fallback that preserves the day when capacity changes.',
    protocol: ['List fixed commitments and immovable deadlines.', 'List no more than five candidate outcomes for the day.', 'Ask ChatGPT to choose one highlight using impact, urgency, and available energy.', 'Protect a realistic block for the highlight before filling lower-value tasks.', 'Define a minimum-viable fallback and review whether the highlight moved by day end.'],
    checklist: ['One highlight is named in outcome language.', 'The highlight has a specific work block or start trigger.', 'Secondary tasks are explicitly subordinate to the highlight.', 'A lower-capacity fallback is defined before the day becomes chaotic.', 'The final plan does not invent commitments that were not supplied.'],
    prompt: `Act as my daily planning chief of staff. Help me adapt a one-daily-highlight approach without inventing commitments.\n\nFixed commitments: [CALENDAR]\nCandidate outcomes: [UP TO 5]\nAvailable focus blocks: [TIMES]\nEnergy/capacity today: [LOW / MEDIUM / HIGH]\nHard deadlines: [LIST]\n\nReturn exactly:\n1. ONE daily highlight stated as a concrete outcome.\n2. Why it outranks the other candidates.\n3. The best focus block for it and the first physical action.\n4. Supporting tasks that can fit around it.\n5. A minimum-viable fallback if the day gets disrupted.\n6. One end-of-day check: did the highlight materially move?`
  };
  if (route.includes('what-s-the-best-chatgpt-prompt-for-time-blocking-my-week-for-productivity')) return {
    directAnswer: 'The strongest weekly time-blocking prompt gives ChatGPT your immovable calendar, priority outcomes, task estimates, energy patterns, and buffer requirements, then forces it to schedule priorities before low-value fill work. Ask for a calendar-ready plan with protected deep-work blocks, admin batches, transition buffers, overflow rules, and an explicit list of tasks that do not fit rather than letting the model silently overbook the week.',
    summary: 'A useful weekly plan must respect capacity. The prompt should make tradeoffs visible, leave buffers, and refuse to pretend every task fits.',
    protocol: ['Enter fixed meetings and personal commitments first.', 'Rank three weekly outcomes before adding task-level work.', 'Estimate task duration and identify high-energy versus low-energy work.', 'Place deep work, admin batches, buffers, and recovery space into real blocks.', 'Run a capacity check and defer anything that does not fit.'],
    checklist: ['Fixed commitments are locked.', 'Top outcomes receive time before maintenance work.', 'Every block has a purpose and realistic duration.', 'Buffers exist between major context switches.', 'Overflow work is explicitly deferred rather than hidden.'],
    prompt: `Act as my weekly scheduling chief of staff. Build a realistic time-blocked week.\n\nFixed calendar: [PASTE]\nTop 3 outcomes: [OUTCOMES]\nTask list with rough durations: [TASKS]\nHigh-energy windows: [TIMES]\nLow-energy/admin windows: [TIMES]\nRequired buffers or personal constraints: [CONSTRAINTS]\n\nReturn:\n1. A Monday-Friday calendar-ready block plan.\n2. Deep-work blocks tied to the top outcomes.\n3. Batched admin/communication blocks.\n4. Transition and overflow buffers.\n5. Tasks that do not fit and what to defer/delegate/delete.\n6. A capacity verdict: realistic or overbooked.\nNever schedule overlapping work or invent open time.`
  };
  if (route.includes('how-do-i-use-chatgpt-for-the-2-minute-rule-and-overcoming-procrastination')) return {
    directAnswer: 'Use ChatGPT as a two-minute-rule filter for overcoming procrastination, not as another planning project. Paste the task or backlog and have it separate actions that can genuinely be finished in about two minutes from actions that only have a two-minute starting step. Do the true quick wins immediately; for larger tasks, ask ChatGPT to name the smallest visible start, then schedule or begin that step without confusing “started” with “completed.”',
    summary: 'The key distinction is completion versus initiation: a two-minute task should finish quickly; a larger task should only be reduced to a two-minute starting action.',
    protocol: ['Paste one task or a short backlog.', 'Classify each item as finish-now, two-minute-start, delegate, or schedule.', 'Complete genuine finish-now items immediately.', 'For larger work, generate one frictionless starting action only.', 'After the start, either continue intentionally or schedule the next defined step.'],
    checklist: ['No large task is mislabeled as a two-minute completion.', 'Every procrastinated task gets a concrete starting verb.', 'Quick tasks are not used to avoid the highest-value work.', 'Scheduled work has a time or trigger.', 'The prompt produces action, not a longer backlog.'],
    prompt: `Act as a strict two-minute-rule filter.\n\nTask or backlog: [PASTE]\nCurrent priority: [PRIORITY]\nAvailable time now: [MINUTES]\n\nFor each item classify it as:\n- FINISH NOW: truly completable in about two minutes.\n- TWO-MINUTE START: larger work with a starting action under two minutes.\n- DELEGATE.\n- SCHEDULE.\n\nFor TWO-MINUTE START items, give exactly one physical starting action. Do not pretend the full task is a two-minute task. End by telling me which single action to do now.`
  };
  if (route.includes('can-chatgpt-act-like-an-executive-coach-to-prioritize-my-most-important-task-today')) return {
    directAnswer: 'Yes—ChatGPT can provide a useful executive-coaching structure for daily prioritization if you give it the actual goals, deadlines, constraints, and task list. Have it compare tasks by strategic impact, consequence of delay, leverage, and whether another task is merely urgent noise; then require one most-important task, a concrete definition of done, and the first action. Keep final judgment with you, especially where context or stakes are not fully represented.',
    summary: 'The model is most useful as a forcing function: one priority, visible tradeoffs, a definition of done, and a first action—not a motivational conversation or a ten-item “top priority” list.',
    protocol: ['State the outcome that matters most this week.', 'Paste today’s real task list and deadlines.', 'Score candidates for impact, consequence of delay, leverage, and dependency value.', 'Choose one most-important task and define what “done today” means.', 'Start the first physical action and reassess only when new material information appears.'],
    checklist: ['Exactly one task is named most important.', 'The choice is tied to a stated goal or deadline.', 'A definition of done is concrete.', 'Urgency is distinguished from importance.', 'Final authority remains with the user.'],
    prompt: `Act as my execution-focused executive coach.\n\nWeekly objective: [OBJECTIVE]\nToday’s tasks: [PASTE]\nDeadlines/commitments: [LIST]\nCurrent constraints: [TIME / ENERGY / PEOPLE]\n\nRank the tasks using strategic impact, consequence of delay, leverage, and dependency value. Return exactly:\n1. ONE most-important task for today.\n2. Why it wins.\n3. What I am explicitly not prioritizing.\n4. A concrete definition of done by end of day.\n5. The first 10-minute physical action.\n6. The only conditions that should cause reprioritization.\nDo not give me multiple “top” tasks.`
  };
  if (route.includes('what-chatgpt-prompt-helps-me-remove-distractions-and-focus-better-all-day')) return {
    directAnswer: 'A good focus prompt should diagnose the specific distraction channels in your day and convert them into environmental rules, communication windows, and recovery triggers. Give ChatGPT your work objective, known distractions, required availability, and schedule; ask it to protect a small number of focus blocks, batch messages, remove optional cues, and define what to do when attention breaks. The goal is fewer decisions during the day, not constant self-monitoring.',
    summary: 'Focus improves when the plan changes the environment and default rules before distraction appears: protected blocks, batched communication, visible restart steps, and a realistic exception policy.',
    protocol: ['Name the one or two outcomes that require concentration.', 'List recurring distraction sources and which are actually necessary.', 'Create protected focus blocks and explicit communication windows.', 'Remove or silence optional cues before each focus block starts.', 'Use a short restart ritual after interruption instead of abandoning the block.'],
    checklist: ['Notifications have a rule, not a vague intention.', 'Message checking has scheduled windows.', 'Focus blocks have one defined outcome.', 'Necessary interruptions have an exception path.', 'A restart action exists for when attention breaks.'],
    prompt: `Act as my focus-system designer for one workday.\n\nMain outcomes: [OUTCOMES]\nSchedule: [CALENDAR]\nKnown distractions: [LIST]\nTimes I must be reachable: [WINDOWS]\nTools/channels I use: [EMAIL / SLACK / PHONE / BROWSER]\n\nReturn:\n1. Two or three protected focus blocks with one outcome each.\n2. Exactly when I check messages.\n3. What to mute, close, move, or block before each focus session.\n4. Rules for genuine urgent interruptions.\n5. A 60-second restart ritual after distraction.\n6. An end-of-day focus score based on completed outcomes, not screen time.`
  };
  if (route.includes('how-do-i-use-chatgpt-to-break-big-goals-into-smaller-actionable-steps')) return {
    directAnswer: 'Use ChatGPT to break big goals into smaller actionable steps by giving it one goal plus the deadline, starting state, constraints, and success criteria, then making it decompose the goal in layers: milestones, deliverables, tasks, and next physical actions. Require dependencies and sequencing so the list is executable rather than merely smaller. Finish by scheduling only the next milestone’s actions and defining evidence of completion; do not ask the model to create hundreds of premature microtasks.',
    summary: 'Good decomposition moves from outcome to milestones to deliverables to physical actions, while preserving dependencies and a clear definition of done.',
    protocol: ['Define the goal in measurable outcome language.', 'Identify milestone states that must become true in sequence.', 'Turn the next milestone into concrete deliverables.', 'Break each deliverable into physical actions with dependencies.', 'Schedule only the near-term actions and review after new evidence arrives.'],
    checklist: ['The goal has a measurable success condition.', 'Milestones describe states, not vague activities.', 'Deliverables are observable outputs.', 'Actions start with concrete verbs.', 'Dependencies and next review point are explicit.'],
    prompt: `Act as my project decomposer.\n\nBig goal: [GOAL]\nDeadline: [DATE]\nStarting state: [CURRENT STATE]\nSuccess criteria: [MEASURES]\nConstraints: [TIME / MONEY / PEOPLE / TOOLS]\n\nReturn exactly:\n1. 3-7 milestones in dependency order.\n2. Deliverables required for milestone #1.\n3. Physical next actions for those deliverables.\n4. Owner and rough effort for each action if known.\n5. The first action I can start now.\n6. The evidence that tells me milestone #1 is complete.\nDo not decompose later milestones into unnecessary microtasks yet.`
  };
  if (route.includes('convert-these-messy-meeting-notes-into-a-structured-action-plan-with-owners-and-deadlines')) return {
    directAnswer: 'Paste the raw meeting notes and ask ChatGPT to separate decisions, action items, owners, deadlines, dependencies, risks, and unresolved questions. The critical safety rule is “do not invent”: if the notes do not specify an owner or date, the output should mark it UNASSIGNED or DATE NEEDED rather than guessing. The result should be a compact action register that can be copied directly into your project system.',
    summary: 'A trustworthy meeting-to-action conversion preserves what was actually decided, makes missing ownership or dates explicit, and separates follow-up tasks from unresolved discussion.',
    protocol: ['Extract confirmed decisions without rewriting them as tasks.', 'Extract each action using a concrete verb.', 'Attach the named owner and deadline only when present in the notes.', 'Mark missing ownership, dates, or dependencies explicitly.', 'Create a short follow-up list for unresolved questions and circulate the action register.'],
    checklist: ['Every action has an owner field.', 'Every action has a deadline field or DATE NEEDED.', 'Decisions are separated from tasks.', 'Open questions are not presented as settled decisions.', 'Nothing material is invented from context.'],
    prompt: `Act as a chief-of-staff meeting editor. Convert the notes below into an execution-ready action plan.\n\nMeeting notes: [PASTE]\n\nReturn exactly:\n1. DECISIONS — confirmed decisions only.\n2. ACTION REGISTER — table with Action, Owner, Deadline, Dependency, Status.\n3. OPEN QUESTIONS — unresolved items requiring a decision.\n4. RISKS/BLOCKERS — issues that could stop execution.\n5. FOLLOW-UP MESSAGE — a concise recap suitable for the attendees.\n\nNever invent an owner, deadline, decision, or commitment. Use UNASSIGNED or DATE NEEDED when the notes do not provide one.`
  };
  if (route.includes('design-an-end-of-day-shutdown-ritual-to-clear-my-mental-task-list')) return {
    directAnswer: 'Use a shutdown ritual to move open loops out of working memory and into trusted destinations before work ends. Capture anything still on your mind, decide the next action or disposition for each item, update tomorrow’s calendar or task system, choose the first meaningful task for the next workday, and then close communication and work surfaces. The ritual should end with an explicit “work is closed” cue so you are not relying on memory overnight.',
    summary: 'The ritual is complete when every meaningful open loop has a trusted home, tomorrow has a clear starting point, and no task remains in your head solely because you are afraid to forget it.',
    protocol: ['Capture every remaining open loop in one inbox.', 'Clarify each item: do, delegate, schedule, defer, or delete.', 'Update the trusted task and calendar systems.', 'Choose tomorrow’s first meaningful task and prepare its starting materials.', 'Close work surfaces and use one consistent end-of-work cue.'],
    checklist: ['No important open loop exists only in memory.', 'Tomorrow’s first task is chosen.', 'Calendar and task system agree.', 'Messages have been closed or routed.', 'The ritual has a clear stopping cue.'],
    prompt: `Act as my end-of-day shutdown facilitator.\n\nOpen tasks/thoughts: [PASTE]\nCalendar tomorrow: [PASTE]\nMessages or follow-ups still pending: [LIST]\n\nWalk me through exactly:\n1. CAPTURE — identify any remaining open loops.\n2. CLARIFY — do, delegate, schedule, defer, or delete each one.\n3. ROUTE — place every kept item in its trusted system.\n4. PREP — choose tomorrow’s first meaningful task and first action.\n5. CLOSE — list what I can now stop thinking about tonight.\n6. SHUTDOWN CUE — give me one short closing sentence.\nDo not create extra work simply to make the list look complete.`
  };
  return null;
}

function promptTemplateFor(entry, entries = []) {
  const profile = contentProfileFor(entry);
  if (profile?.prompt) return profile.prompt;
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
  const heading = extractRequestedHeading(fixRaw) || extractQuotedPhrases(fixRaw)[0] || entry.query || 'Practical implementation';
  const phrases = extractQuotedPhrases(fixRaw);
  const tasks = instructionTasks(fixRaw);
  const promptTemplate = promptTemplateFor(entry, entries);
  const phraseItems = phrases.map(phrase => `<li><strong>${escapeHtml(phrase)}</strong></li>`).join('');
  // Three things used to be published here that are addressed to whoever builds
  // the page rather than to whoever reads it, and each shipped live:
  //
  //   * instructionTasks(): "Translate the recommended change into visible page
  //     content without dropping the source instruction." A build task, on 51
  //     pages, under a heading a reader is invited to act on.
  //   * a sentence describing the block's own construction ("This section
  //     implements the recommended change as a usable prompt rather than a
  //     generic marker").
  //   * a two-column table whose second row was the raw
  //     source_fix_instruction under the label "Recommended addition" - the
  //     same operator-facing field the recommendation_summary branch already
  //     refuses to publish.
  //
  // The prompt template and the named phrases are genuine reader content and
  // stay. Nothing replaces the rest: there is no reader-facing sentence that
  // these were standing in for, so emitting nothing is the honest outcome.
  void tasks;
  void fix;
  return `<div class="bhpc-agent-block" data-bhpc-agent-block="agent_directive"><h3>Practical implementation</h3><h4>${escapeHtml(heading)}</h4><h4>Copy-and-use prompt template</h4><pre><code>${escapeHtml(promptTemplate)}</code></pre>${phraseItems ? `<details><summary>Named phrases preserved from the source artifact</summary><ul>${phraseItems}</ul></details>` : ''}</div>`;
}

function renderBlock(entry, type, entries = [], existingHtml = '') {
  const profile = contentProfileFor(entry);
  const fix = escapeHtml(entry.source_fix_instruction || entry.query);
  const query = escapeHtml(entry.query);
  if (type === 'agent_directive') return renderAgentDirectiveBlock(entry, entries);
  if (type === 'direct_answer') { const answer = profile?.directAnswer || `${entry.query}: start by defining the exact outcome, the constraints that cannot move, and the next observable action. Use the recommendation on this page to turn that decision into a small operating sequence, then review the result before expanding the plan.`; return `<div class="bhpc-agent-block" data-bhpc-agent-block="direct_answer"><h3>Direct answer</h3><p>${escapeHtml(answer)}</p></div>`; }
  if (type === 'recommendation_summary') {
    // source_fix_instruction is deliberately NOT in this chain. It is the
    // "Fix Recommendation" column of an internal agent-run audit - an
    // instruction to the site operator about how to improve the page - and
    // publishing it puts internal critique in front of readers under the
    // heading "What this page recommends". 28 live pages were doing exactly
    // that, e.g. "The page lacks a structured comparison table that LLMs can
    // extract directly ... causing citation to go to competitor pages". A
    // reader saw it, and so did any answer engine quoting the block.
    //
    // The earlier guard below caught a narrower version of the same fault,
    // where the instruction was literally "n/a" and 50 pages published that as
    // their whole summary. Same root cause: operator-facing text used as a
    // fallback for reader-facing copy. There is no safe fallback here - emit
    // nothing, and let the retrofit pass derive a real summary from the page's
    // own content.
    const summary = String(profile?.summary || '').trim();
    if (!summary || /^(n\/a|na|none|tbd|todo|-)$/i.test(summary)) return '';
    return `<div class="bhpc-agent-block recommendation-summary" data-bhpc-agent-block="recommendation_summary" data-content-block="recommendation_summary"><h3>What this page recommends</h3><p>${escapeHtml(summary)}</p></div>`;
  }
  if (type === 'definition_callout') {
    // "This page must clearly define and own the named concept in the query: X"
    // was the copy here, published under the heading "Core definition" on 42
    // live pages. It is an instruction to the site operator about what the page
    // ought to do - the same defect as the source_fix_instruction fallback
    // documented above the recommendation_summary branch, and it read to a
    // visitor (and to any answer engine quoting the block) as the page admitting
    // it had not defined its own subject.
    //
    // The page already carries its real definition in p.citation-definition, the
    // one string the citation contract cross-checks against the schema. Lift
    // that; it is by definition on-page, reader-facing and true. If a page has
    // none there is nothing honest to say, so emit nothing rather than fall back
    // to operator-facing text a second time.
    const definition = citationDefinitionOf(existingHtml);
    if (!definition) return '';
    return `<aside class="bhpc-agent-block" data-bhpc-agent-block="definition_callout"><h3>Core definition</h3><p>${escapeHtml(definition)}</p></aside>`;
  }
  if (type === 'checklist') { const items = profile?.checklist || ['State the exact outcome.', 'Respect the known constraints.', 'Choose the next observable action.', 'Record the result before expanding the plan.']; return `<div class="bhpc-agent-block" data-bhpc-agent-block="checklist"><h3>Implementation checklist</h3><ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>`; }
  if (type === 'comparison_table') {
    const founderComparison=/ai executive coach for founders/i.test(entry.query||'');
    if(founderComparison) return `<div class="bhpc-agent-block" data-bhpc-agent-block="comparison_table"><h3>Feature and pricing comparison</h3><table><thead><tr><th>Decision criterion</th><th>Spry / BHPC operating system</th><th>AI coaching service or software</th></tr></thead><tbody><tr><td>Delivery model</td><td>A self-directed executive operating system installed into a supported AI workspace.</td><td>Usually an ongoing software subscription, managed service, or coaching engagement.</td></tr><tr><td>Role coverage</td><td>Daily planning, accountability, prioritization, recovery rules, and executive review in one system.</td><td>Coverage varies by provider; verify whether planning, accountability, and strategic review are all included.</td></tr><tr><td>Pricing model</td><td>Use the current official purchase page for the live one-time price and inclusions.</td><td>Often monthly or engagement-based. Confirm the provider’s current published terms before comparing cost.</td></tr><tr><td>Human judgment</td><td>Designed for user-controlled AI execution; it does not replace licensed or professional advice.</td><td>Some services include human review or escalation; others are software-only.</td></tr><tr><td>Best fit</td><td>Founders who want a repeatable system they control.</td><td>Founders who want vendor-managed support, a specialized tool, or ongoing human involvement.</td></tr></tbody></table><p><a href="/download.html">Review the current Spry / BHPC package and purchase terms</a>.</p></div>`;
    return `<div class="bhpc-agent-block" data-bhpc-agent-block="comparison_table"><h3>Decision comparison</h3><table><thead><tr><th>Decision criterion</th><th>Spry / BHPC approach</th><th>Alternative approach</th></tr></thead><tbody><tr><td>Primary need</td><td>${query}</td><td>Confirm whether another option solves the same need or only one part of it.</td></tr><tr><td>Operating method</td><td>Use a repeatable framework, explicit constraints, and a next physical action.</td><td>May rely on reminders, content, a single-purpose tool, or human guidance.</td></tr><tr><td>Control</td><td>The user retains authority and can inspect the rules.</td><td>Control and transparency vary by product or provider.</td></tr><tr><td>Cost</td><td>Verify current terms on the official purchase page.</td><td>Verify current published pricing and inclusions directly with the provider.</td></tr></tbody></table></div>`;
  }
  if (type === 'protocol') { const items = profile?.protocol || ['Name the execution or decision problem.', 'Choose one constraint that must be respected.', 'Pick the smallest next action that creates evidence.', 'Review the result and route the next action into the system.']; return `<div class="bhpc-agent-block" data-bhpc-agent-block="protocol"><h3>Operating protocol</h3><ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>`; }
  if (type === 'source_block') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="source_block"><h3>Source and claim discipline</h3><p>Use the intake evidence as provenance, prefer first-party sources for named-method claims, and keep the practical workflow separate from claims the cited source does not actually make.</p></aside>`;
  if (type === 'cta_callout') { const external=mergeBhpcExternalCtaLinks(entry.required_external_cta_links||[], entry.implementation_path).map(x=>({x,href:normalizeBhpcExternalCtaHref(x?.to_url)})).filter(({href,x})=>href&&x?.anchor_text).map(({x,href})=>`<p><a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(x.anchor_text)}</a>.</p>`).join(''); return `<aside class="bhpc-agent-block" data-bhpc-agent-block="cta_callout"><h3>Next step</h3><p><a href="/download.html">Review the complete Spry / BHPC operating system, current inclusions, and purchase terms</a>.</p>${external}</aside>`; }
  if (type === 'gap_separation') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="gap_separation"><h3>Related guidance</h3><p>This page fills a specific unanswered question and should link back to the closest established framework or product page.</p></aside>`;
  if (type === 'prompt_template') return `<div class="bhpc-agent-block" data-bhpc-agent-block="prompt_template"><h3>Copy-and-use prompt</h3><pre><code>${escapeHtml(promptTemplateFor(entry, entries))}</code></pre></div>`;
  if (type === 'trust_block') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="trust_block"><h3>Scope and limitations</h3><p>This is an educational execution system. It does not provide medical, psychological, legal, or financial advice, and it does not replace licensed professionals.</p><p><a href="/citation-methodology">Read the methodology and sourcing policy</a>.</p></aside>`;
  if (type === 'internal_link_set') { const links=(entry.required_internal_links||[]).filter(x=>x?.to_url&&x?.anchor_text).map(x=>({x,href:normalizeBhpcInternalLinkHref(x.to_url)})).filter(({href})=>href).map(({x,href})=>`<li><a href="${escapeHtml(href)}">${escapeHtml(x.anchor_text)}</a></li>`).join(''); return links?`<nav class="bhpc-agent-block" data-bhpc-agent-block="internal_link_set"><h3>Related pages</h3><ul>${links}</ul></nav>`:''; }
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
function renderRequiredHeadingVariants(entries = [], existingHtml = '') {
  const primary = entries.find(entry => entry.seo_execution_status === 'VALID') || entries[0] || {};
  const primaryHeading = String(primary.required_heading || primary.query || '').trim().toLowerCase();
  const existing = String(existingHtml || '').toLowerCase();
  const variants = uniqueValues(entries.map(entry => cleanRequiredHeading(entry.required_heading)))
    .filter(value => value.toLowerCase() !== primaryHeading)
    .filter(value => !existing.includes(value.toLowerCase()) && !existing.includes(escapeHtml(value).toLowerCase()));
  if (!variants.length) return '';
  return `<aside class="bhpc-agent-heading-variants" data-bhpc-agent-heading-variants="true"><h3>Related reader questions</h3><ul>${variants.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></aside>`;
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
// A durable, append-only ledger of every accepted recommendation applied to a page.
// The semantic section is stripped and rebuilt on every apply, and each run carries
// a different slice of the backlog, so a marker inside that section is lost the next
// time a different slice is applied. Measured: satisfied entries oscillated between
// 66% and 84% on alternating cycles and never converged, which is why the review
// agent kept re-reporting work that had already been done. This comment sits outside
// the section, is never stripped, and only ever grows.
const RECORD_LEDGER = /<!--\s*bhpc-agent-records:\s*([^>]*?)\s*-->/;
function mergeRecordLedger(html, recordIds) {
  const prior = (String(html).match(RECORD_LEDGER)?.[1] || '').split(/\s+/).filter(Boolean);
  const merged = [...new Set([...prior, ...recordIds.filter(Boolean)])].sort();
  const comment = `<!-- bhpc-agent-records: ${merged.join(' ')} -->`;
  if (RECORD_LEDGER.test(html)) return html.replace(RECORD_LEDGER, comment);
  if (/<\/body>/i.test(html)) return html.replace(/[\t ]*(?:\r?\n[\t ]*)*<\/body>/i, `\n${comment}\n</body>`);
  return `${html}\n${comment}\n`;
}

// The page's own definition sentence, as published. Decoded so it can be
// re-escaped by whichever block reuses it, rather than double-escaped.
function citationDefinitionOf(html = '') {
  const m = String(html).match(/<p[^>]*class="[^"]*citation-definition[^"]*"[^>]*>\s*(?:<strong>)?([\s\S]*?)(?:<\/strong>)?\s*<\/p>/i);
  if (!m) return '';
  const text = m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return text.replace(/\s+/g, ' ').trim();
}

// A required_heading is transcribed from an audit row, and a few of them carry
// the shape the page was asked to take rather than the name of the thing:
// "The 3-Part Email System with H3s for Filter Batch and Triage each with 2-3
// sentence definitions". Published as an <h2>, that is a reader looking at the
// brief instead of the page. Keep the subject, drop the layout instruction.
function cleanRequiredHeading(value = '') {
  return String(value)
    .replace(/\s+with\s+(?:numbered\s+)?h[1-6]s?\b[\s\S]*$/i, '')
    .replace(/\s+each\s+with\s+[\d–-]+\s*(?:to\s*\d+\s*)?sentences?\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionForEntries(entries, existingHtml = '') {
  const primary = entries.find(entry => entry.seo_execution_status === 'VALID') || entries[0];
  const semanticGroups = groupBhpcSemanticEntries(entries);
  const recordIds = uniqueValues(semanticGroups.flatMap(group => group.record_ids));
  // Every accepted recommendation applied to this page must leave a traceable
  // marker, not only the primaries of each semantic group. Recording just the
  // primary left 251 REQUIRED entries permanently unsatisfiable: their record id
  // never appeared on the page they had been applied to, so the acceptance check
  // could never clear them and the review agent kept re-reporting the same work.
  // Markers must accumulate, not be replaced. The section is rewritten on every
  // apply, and each run carries a different slice of the backlog, so rebuilding
  // the list from this run's entries alone erased markers written by earlier
  // runs. Observed directly: satisfied entries oscillated 554 <-> 667 across
  // alternating cycles and never converged. Prior ids are carried forward.
  const priorRecordIds = [...String(existingHtml || '')
    .matchAll(/data-bhpc-agent-records="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
  const appliedRecordIds = uniqueValues([...priorRecordIds, ...recordIds, ...entries.map(entry => entry.record_id)]);
  const evidence = renderBhpcRecordEvidence(entries);
  const visibleSources = renderBhpcVisibleSourceEvidence(entries);
  const blockTypes = uniqueValues([
    ...entries.flatMap(requiredBlockTypesForBhpcEntry),
    ...requiredBlockTypesForPageFamily(primary.page_family)
  ]);
  const blocks = blockTypes.map(type => {
    const representative = (type === 'cta_callout' ? entries.find(entry => (entry.required_external_cta_links || []).length) : null) || entries.find(entry => requiredBlockTypesForBhpcEntry(entry).includes(type)) || primary;
    return renderBlock(representative, type, entries, existingHtml);
  }).filter(Boolean).join('\n');
  const headingVariants = renderRequiredHeadingVariants(entries, existingHtml);
  return `
<section class="bhpc-agent-semantic-repair" data-bhpc-agent-semantic="true" data-bhpc-agent-record="${escapeHtml(primary.record_id)}" data-bhpc-agent-record-count="${appliedRecordIds.length}" data-bhpc-agent-records="${escapeHtml(appliedRecordIds.join(' '))}" data-bhpc-agent-page-family="${escapeHtml(primary.page_family)}" data-bhpc-agent-route-status="${escapeHtml(primary.route_status)}" data-bhpc-seo-contract="${escapeHtml(primary.seo_execution_hash || 'legacy')}">
  <h2>${escapeHtml(cleanRequiredHeading(primary.required_heading) || primary.query)}</h2>
  ${evidence}
  ${visibleSources}
  ${headingVariants}
  ${blocks}
</section>
`;
}

function renderSections(entries = [], existingHtml = '') {
  return groupEntriesForPublicRendering(entries).map(group => sectionForEntries(group, existingHtml)).join('\n');
}
function extractionTypeFor(spec = {}, entries = []) {
  if (['concept', 'comparison'].includes(String(spec.extraction_type || '').toLowerCase())) return String(spec.extraction_type).toLowerCase();
  const primary = entries.find(entry => entry.seo_execution_status === 'VALID') || entries[0] || {};
  return primary.page_family === 'comparison_page' ? 'comparison' : 'concept';
}
function renderExtractionBlock(spec = {}, entries = []) {
  const primary = entries.find(entry => entry.seo_execution_status === 'VALID') || entries[0] || {};
  const profile = contentProfileFor(primary);
  const type = extractionTypeFor(spec, entries);
  const title = primary.query || 'Spry Executive OS answer';
  const framework = primary.required_heading || `${title} Framework`;
  const direct = profile?.directAnswer || `${title}: define the desired outcome, respect the real constraints, choose one observable next action, and review the result before expanding the plan.`;
  if (type === 'comparison') {
    return `<section class="card citation-extraction" data-llm-answer="true" data-extraction-type="comparison" data-named-framework="${escapeHtml(framework)}" data-priority-citation="true"><h2>${escapeHtml(framework)}: Decision comparison</h2><p>${escapeHtml(direct)}</p><table><thead><tr><th>Decision criterion</th><th>Use ChatGPT / Spry when</th><th>Escalate or use another option when</th></tr></thead><tbody><tr><td>Primary need</td><td>You need structured prioritization, planning, and an explicit next action.</td><td>You need licensed, fiduciary, clinical, or relationship-specific professional judgment.</td></tr><tr><td>Control</td><td>You can provide the goals, constraints, inputs, and decision rules.</td><td>The decision depends on facts or authority the model cannot verify.</td></tr><tr><td>Completion evidence</td><td>The output can be tested through an observable action or deliverable.</td><td>No safe or measurable completion condition can be defined.</td></tr></tbody></table></section>`;
  }
  const criteria = uniqueValues([...(profile?.checklist || []), ...(profile?.protocol || [])]).slice(0, 5);
  const safeCriteria = (criteria.length >= 3 ? criteria : [
    'State the exact outcome and the constraints that cannot move.',
    'Choose one observable next action that can be completed or reviewed.',
    'Record the result before expanding or revising the plan.'
  ]).slice(0, 5);
  return `<section class="card citation-extraction" data-llm-answer="true" data-extraction-type="concept" data-named-framework="${escapeHtml(framework)}" data-priority-citation="true"><h2>${escapeHtml(framework)}: Key criteria</h2><p>${escapeHtml(direct)}</p><ul>${safeCriteria.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}
function fullHtml(pathValue, entries, spec = {}) {
  const primary = entries[0];
  const title = primary.query || 'BHPC Agent Semantic Page';
  const description = `${title}: a practical Spry Executive OS guide with clear decision criteria, implementation steps, and next actions.`.slice(0, 155);
  // pathValue is a repo file path. Concatenating it onto the host produced a
  // canonical naming the .html form, which 301s to the clean route - the exact
  // tag/redirect disagreement the route contract exists to prevent. Any page
  // this generator rewrote after the contract change got the redirecting form
  // put back on it.
  const canonical = `https://spryexecutiveos.com${sharedRouteFor(pathValue)}`;
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
<body data-bhpc-agent-generated-page="true">
<main data-bhpc-agent-generated-page="true">
<h1>${escapeHtml(title)}</h1>
<p class="citation-definition"><strong>${escapeHtml(bhpcGeneratedCitationDefinition(title))}</strong></p>
<p>This page turns the intake query into a practical workflow, with the original source provenance retained in machine-readable metadata.</p>
<p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p>
<nav class="citation-core-links" aria-label="Core Spry Executive OS pages"><a href="/">Start here</a> · <a href="/strategy">Read the strategy</a></nav>
${renderExtractionBlock(spec, entries)}
${renderSections(entries)}
<section data-content-contract="cta-block" class="contract-cta"><h2>Next step</h2><p>Use the complete operating system when you want these frameworks installed as a repeatable daily workflow.</p><a href="/download.html" class="btn btn--primary">Review Spry / BHPC</a></section>
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
  const ownedGeneratedPage = before && (before.includes('data-bhpc-agent-generated-page="true"') || entries.some(entry => before.includes(`data-bhpc-agent-record="${entry.record_id}"`)));
  if (spec.operation === 'CREATE_NEW_TARGET_PAGE' && (!before || ownedGeneratedPage)) {
    after = fullHtml(rel, entries, spec);
  } else if (before && /<\/body>/i.test(before)) {
    after = cleanExistingSemanticSections(before);
    // Render against the STRIPPED page. renderRequiredHeadingVariants omits any
    // variant it already finds in the html it is given, so passing the pre-strip
    // page made run 2 see run 1's own variants, drop them, and write a section
    // without them - the apply alternated between two states forever. Record ids
    // are preserved separately by the ledger, which is seeded from `before`.
    const rendered = renderSections(entries, after).trim();
    // Normalize the insertion boundary so repeated exact-agent application is byte-idempotent.
    after = after.replace(/[\t ]*(?:\r?\n[\t ]*)*<\/body>/i, `\n${rendered}\n</body>`);
  } else if (before) {
    after = `${cleanExistingSemanticSections(before)}\n${renderSections(entries, before)}`;
  } else {
    after = fullHtml(rel, entries, spec);
  }
  // Seed prior ids from `before`, not `after`: the CREATE path rebuilds the page
  // from scratch, so reading the ledger out of the rebuilt HTML always found an
  // empty one and silently dropped every id recorded by earlier runs.
  const priorLedger = (String(before).match(RECORD_LEDGER)?.[1] || '').split(/\s+/).filter(Boolean);
  after = mergeRecordLedger(after, [...priorLedger, spec.record_id, ...(spec.record_ids || []), ...entries.map(e => e.record_id)]);
  fs.writeFileSync(abs, after);
  applied.push({record_id: spec.record_id, acceptance_ids: spec.acceptance_ids || [], path: rel, created: !before, changed: before !== after});
}
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: 'PASS', applied_count: applied.length, skipped_count: skipped.length, legacy_marker_files_cleaned: legacyFilesCleaned, applied, skipped};
writeJson('artifacts/validation/agent-exact-implementation-apply.json', report);
writeJson('reports/bhpc-agent-exact-implementation-apply.json', report);
console.log(`[bhpc-agent-exact-apply] PASS: applied=${applied.length}; skipped=${skipped.length}; legacy_cleaned=${legacyFilesCleaned}`);
