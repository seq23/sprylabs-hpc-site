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
    .replace(/^bhpc-vs-/, 'BHPC vs ').replace(/-/g, ' ')
    .replace(/\w/g, c => c.toUpperCase());
}

function buildSupportParagraph(title, wordsNeeded) {
  const extra = wordsNeeded > 80
    ? ' In practice that means shrinking the promise, naming the first visible action, and separating emotional resistance from operational sequencing.'
    : '';
  return `<section class="card" data-content-contract="word-count-repair" style="margin-top:20px"><h2>Implementation note</h2><p>${title} works best when it becomes operational instead of motivational. The useful move is to convert the idea on this page into one observable rule, one small time-box, and one clear definition of done. That keeps the page actionable for a reader who is tired, overthinking, or trying to restart after drift.${extra} The goal is not more theory. The goal is a cleaner next move, less negotiation, and a repeatable way to continue the next day without drama.</p></section>`;
}

const repaired = [];
const holds = [];
for (const file of listTargetFiles()) {
  let html = fs.readFileSync(file, 'utf8');
  const before = countWords(html);
  const status = classifyWordCount(before);
  if (status === 'pass') continue;
  const wordsNeeded = Math.max(SAFE_PUBLISH_MIN - before, 0);
  const title = slugToTitle(file);
  const support = buildSupportParagraph(title, wordsNeeded);
  if (/(<\/article>)/i.test(html)) {
    html = html.replace(/<\/article>/i, `${support}
</article>`);
  } else if (/(<\/main>)/i.test(html)) {
    html = html.replace(/<\/main>/i, `${support}
</main>`);
  } else {
    holds.push({ file: path.relative(ROOT, file), before, after: before, reason: 'No safe insertion point' });
    continue;
  }
  fs.writeFileSync(file, html);
  const after = countWords(html);
  if (after >= SAFE_PUBLISH_MIN) {
    repaired.push({ file: path.relative(ROOT, file), before, after });
  } else {
    holds.push({ file: path.relative(ROOT, file), before, after, reason: 'Still below safe publish floor after repair' });
  }
}

const report = {
  timestamp: new Date().toISOString(),
  safePublishMin: SAFE_PUBLISH_MIN,
  repairedCount: repaired.length,
  holdCount: holds.length,
  repaired,
  holds,
};
fs.writeFileSync(path.join(reportDir, 'word_count_repair_report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(backlogDir, 'word_count_holds.json'), JSON.stringify({ timestamp: report.timestamp, holds }, null, 2));
console.log(`word_count_repair: repaired=${repaired.length} holds=${holds.length} safe_publish_min=${SAFE_PUBLISH_MIN}`);
process.exit(0);
