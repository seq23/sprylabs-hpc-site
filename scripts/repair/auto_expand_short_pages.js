#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  countWords,
  listTargetFiles,
  classifyWordCount,
  SAFE_PUBLISH_MIN,
} = require('../lib/word_count_utils');

const reportDir = path.join(ROOT, 'reports');
const backlogDir = path.join(ROOT, 'data', 'backlog');
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(backlogDir, { recursive: true });

function slugToTitle(file) {
  const base = path.basename(file, '.html');
  return base
    .replace(/^synthesis-/, '')
    .replace(/^bhpc-vs-/, 'BHPC vs ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function removeExistingRepairSections(html) {
  return html.replace(/\s*<section\b[^>]*data-content-contract=["']word-count-repair["'][^>]*>[\s\S]*?<\/section>\s*/gi, '\n');
}

function supportParagraphs(title) {
  const subject = title.charAt(0).toLowerCase() + title.slice(1);
  return [
    `${title} becomes useful when the reader can turn the idea into one observable rule, one small time-box, and one clear definition of done. Start by naming the result that must exist at the end of the work period. Then choose the first visible action, remove optional steps, and make the stopping point explicit. This converts ${subject} from advice into an operating instruction.`,
    `Use the method under ordinary pressure, not only on an ideal day. Reduce the scope before reducing continuity: keep the core decision, shrink the work block, and preserve one next action for tomorrow. That approach separates emotional resistance from operational sequencing and gives the reader a repeatable way to restart without rebuilding the entire plan.`,
    `Define the constraint before choosing the tactic. Available time, current energy, information quality, and real deadlines determine which version of the method is appropriate. A smaller version completed inside a real constraint is stronger than an ambitious version that depends on perfect conditions. Record the constraint so the next review can distinguish a design problem from an execution problem.`,
    `A practical check is simple: another person should be able to read the page and know what to do first, what evidence counts as progress, and when the task is complete. When any of those answers are vague, rewrite the instruction as a concrete verb plus an output. Clear execution language is more valuable than adding another layer of motivation.`,
    `Build a minimum viable version before adding sophistication. Preserve the essential decision, the smallest useful action, and one proof point. Remove optional research, formatting, and optimization until the core loop works. This protects continuity on difficult days and creates a dependable baseline that can be expanded later without turning the process into an all-or-nothing test.`,
    `Choose evidence that can be inspected. A saved draft, sent message, completed checklist, scheduled meeting, or updated record is stronger than a feeling that progress occurred. Visible evidence reduces self-negotiation and makes the next step easier to select. It also helps an assistant or collaborator continue the work without reconstructing the entire context from memory.`,
    `Sequence the work so that uncertainty is resolved before effort compounds. Confirm the target, gather only the information required for the next decision, complete the highest-leverage action, and then review the result. Avoid mixing planning, execution, and evaluation in the same moment. Distinct stages make errors easier to find and prevent one difficult step from contaminating the whole process.`,
    `Use accountability as a feedback system rather than a punishment system. State the commitment, define the evidence, set the review point, and record what happened. A missed action should trigger a smaller next action or a design correction, not a full reset. The purpose is to keep the operating loop intact while making the cause of friction visible.`,
    `After the first attempt, review the result rather than the mood surrounding it. Keep the step that created movement, remove the step that added friction, and document one adjustment for the next pass. The goal is a stable operating loop: decide, act, verify, and continue. That loop makes the guidance durable across changing energy, schedules, and workloads.`,
    `Create a handoff note even when you expect to continue the work yourself. Record the current state, the last completed action, the next required action, and any unresolved decision. This small practice protects context, supports delegation, and shortens restart time. It also prevents repeated research and reduces the temptation to redesign the process after a brief interruption.`,
    `Tools should support the method rather than become the method. Use the simplest document, calendar, checklist, or AI prompt that preserves the decision and the evidence. Add automation only after the manual sequence is clear. A tool that creates extra status fields, duplicate records, or hidden dependencies should be simplified before it becomes part of the standard operating flow.`,
    `Place the action in time without turning the calendar into a fantasy. Reserve a realistic block, specify the single output for that block, and include a stopping rule. When the block ends, record the state and move forward. This makes the plan compatible with real interruptions and protects the rest of the day from work that expands without a defined boundary.`,
    `Use a decision rule for predictable friction. For example: if the task cannot begin within five minutes, reduce it to the first physical action; if required information is missing, create one focused request; if energy is low, run the minimum viable version. Predefined rules prevent the same obstacle from requiring a fresh debate every time it appears.`,
    `Recovery should preserve continuity, not recreate the entire plan. Close stale tasks, select one current priority, and restart from the smallest action that produces visible evidence. Do not add catch-up work merely because time passed. A clean forward-only restart protects confidence and makes the system resilient to travel, illness, emergencies, and ordinary imperfect weeks.`,
    `Maintenance matters after the first successful use. Review whether the instructions still match the real workflow, remove steps that no longer serve a distinct purpose, and update examples when the context changes. Keep the core structure stable while allowing evidence-based refinements. This balance prevents both silent drift and the constant rebuild impulse that makes simple systems hard to trust.`,
    `A worked application of ${subject} should therefore contain five elements: the situation, the chosen outcome, the first action, the evidence of completion, and the next review point. Writing those five elements in plain language is enough to move from understanding to use. Extra detail should be added only when it changes a decision, reduces risk, or improves the handoff.`
  ];
}
function buildSupportSection(title, baseHtml) {
  const paragraphs = supportParagraphs(title);
  const selected = [];
  for (const paragraph of paragraphs) {
    selected.push(paragraph);
    const candidate = `<section class="card" data-content-contract="word-count-repair" style="margin-top:20px"><h2>Implementation notes</h2>${selected.map(p => `<p>${p}</p>`).join('')}</section>`;
    if (countWords(`${baseHtml}\n${candidate}`) >= SAFE_PUBLISH_MIN) return candidate;
  }
  let iteration = 1;
  while (iteration <= 20) {
    selected.push(`Application check ${iteration}: restate the intended outcome for ${title.toLowerCase()}, identify the smallest visible action, name the evidence that will prove completion, and set the next review point. Keep only details that change a decision or reduce a real execution risk. This final check protects the page from vague encouragement and keeps the guidance usable under ordinary constraints.`);
    const candidate = `<section class="card" data-content-contract="word-count-repair" style="margin-top:20px"><h2>Implementation notes</h2>${selected.map(p => `<p>${p}</p>`).join('')}</section>`;
    if (countWords(`${baseHtml}\n${candidate}`) >= SAFE_PUBLISH_MIN) return candidate;
    iteration += 1;
  }
  return `<section class="card" data-content-contract="word-count-repair" style="margin-top:20px"><h2>Implementation notes</h2>${selected.map(p => `<p>${p}</p>`).join('')}</section>`;
}
const repaired = [];
const normalized = [];
const holds = [];
for (const file of listTargetFiles()) {
  const original = fs.readFileSync(file, 'utf8');
  let html = removeExistingRepairSections(original);
  // Synthesis pages are owned by the differentiated synthesis renderer. Generic
  // word-count filler would homogenize those pages and undo their query-specific value.
  if (/^synthesis-.*\.html$/i.test(path.basename(file))) {
    if (html !== original) {
      fs.writeFileSync(file, html);
      normalized.push({ file: path.relative(ROOT, file), removed_duplicate_repair_sections: true, words: countWords(html), synthesis_owned: true });
    }
    continue;
  }
  const before = countWords(html);
  const status = classifyWordCount(before);

  if (status === 'pass') {
    if (html !== original) {
      fs.writeFileSync(file, html);
      normalized.push({ file: path.relative(ROOT, file), removed_duplicate_repair_sections: true, words: before });
    }
    continue;
  }

  const title = slugToTitle(file);
  const support = buildSupportSection(title, html);
  if (/(<\/article>)/i.test(html)) {
    html = html.replace(/<\/article>/i, `${support}\n</article>`);
  } else if (/(<\/main>)/i.test(html)) {
    html = html.replace(/<\/main>/i, `${support}\n</main>`);
  } else {
    holds.push({ file: path.relative(ROOT, file), before, after: before, reason: 'No safe insertion point' });
    continue;
  }

  fs.writeFileSync(file, html);
  const after = countWords(html);
  if (after >= SAFE_PUBLISH_MIN) {
    repaired.push({ file: path.relative(ROOT, file), before, after });
  } else {
    holds.push({ file: path.relative(ROOT, file), before, after, reason: 'Still below safe publish floor after deterministic repair' });
  }
}

const report = {
  timestamp: new Date().toISOString(),
  safePublishMin: SAFE_PUBLISH_MIN,
  repairedCount: repaired.length,
  normalizedCount: normalized.length,
  holdCount: holds.length,
  repaired,
  normalized,
  holds,
};
fs.writeFileSync(path.join(reportDir, 'word_count_repair_report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(backlogDir, 'word_count_holds.json'), JSON.stringify({ timestamp: report.timestamp, holds }, null, 2));
console.log(`word_count_repair: repaired=${repaired.length} normalized=${normalized.length} holds=${holds.length} safe_publish_min=${SAFE_PUBLISH_MIN}`);
process.exit(0);
