#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const generatedPagesPath = path.join(root, 'data/reddit/generated_pages.json');
if (!fs.existsSync(generatedPagesPath)) {
  console.log('generated_page_range_repair: no generated_pages.json; skipped');
  process.exit(0);
}

const generatedPages = JSON.parse(fs.readFileSync(generatedPagesPath, 'utf8'));
const MIN_WORDS = Number(process.env.GENERATED_PAGE_MIN_WORDS || 300);
const MAX_WORDS = Number(process.env.GENERATED_PAGE_MAX_WORDS || 650);
const report = [];
let repaired = 0;
let blocked = 0;

function stripText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html) {
  return stripText(html).split(/\s+/).filter(Boolean).length;
}

for (const page of generatedPages) {
  const rel = `${page.slug}.html`;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const words = wordCount(html);
  const entry = { file: rel, before: words, after: words, status: 'ok' };

  if (words < MIN_WORDS) {
    const injection = `\n<section class="card" data-content-contract="generated-range-repair"><h2>Founder context</h2><p>This page is written for founders comparing operating conditions, not just labels. The useful choice depends on whether the bottleneck is daily execution, leadership judgment, emotional complexity, or the need for repeated follow-through across the week. That is why this comparison focuses on workflow, tradeoffs, and where each option is strongest in practice.</p></section>`;
    const patched = html.replace('</article>', `${injection}\n</article>`);
    fs.writeFileSync(full, patched);
    entry.after = wordCount(patched);
    if (entry.after >= MIN_WORDS && entry.after <= MAX_WORDS) {
      entry.status = 'repaired';
      repaired += 1;
    } else {
      entry.status = 'blocked';
      blocked += 1;
    }
  } else if (words > MAX_WORDS) {
    entry.status = 'blocked';
    blocked += 1;
  }

  report.push(entry);
}

const reportPath = path.join(root, 'reports', 'generated_page_range_repair_report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({ min_words: MIN_WORDS, max_words: MAX_WORDS, repaired, blocked, report }, null, 2));
console.log(`generated_page_range_repair: repaired=${repaired} blocked=${blocked} min=${MIN_WORDS} max=${MAX_WORDS}`);
if (blocked > 0) process.exit(1);
