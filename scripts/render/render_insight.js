#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { contractShell } = require('./content_contract');

const ROOT = process.cwd();
const INPUT_DIRS = [path.join(ROOT, 'content', 'insights'), path.join(ROOT, 'data', 'insights')];
const OUTPUT_DIR = path.join(ROOT, 'insights');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function slugify(value) { return String(value || 'insight').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'insight'; }
function esc(value) { return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function parseMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath, path.extname(filePath));
  const body = raw.replace(/^#\s+.+$/m, '').split(/\n{2,}/).map(block => block.trim()).filter(Boolean).map(block => {
    if (/^##\s+/.test(block)) return `<h2>${esc(block.replace(/^##\s+/, ''))}</h2>`;
    if (/^[-*]\s+/m.test(block)) return `<ul>${block.split(/\n/).filter(Boolean).map(line => `<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${esc(block.replace(/\n/g, ' '))}</p>`;
  }).join('\n');
  return { title, body };
}
function renderInsight(sourceFile) {
  const parsed = parseMarkdown(sourceFile);
  const slug = slugify(path.basename(sourceFile, path.extname(sourceFile)));
  return contractShell({
    pageType: 'insight',
    title: parsed.title,
    description: `A practical insight on ${parsed.title.toLowerCase()} for operators using AI-assisted execution systems.`,
    canonicalUrl: `https://billionairehighperformancecoach.com/insights/${slug}.html`,
    imageUrl: '/assets/books/og/bhpc-og-black.png',
    answer: `This insight explains ${parsed.title.toLowerCase()} in practical execution terms for operators using AI-assisted coaching systems.`,
    bodyHtml: parsed.body,
    ctaReason: 'Use the full system manual when you want the prompts, daily operating structure, and recovery protocols in one place.'
  });
}
function run() {
  ensureDir(OUTPUT_DIR);
  const inputDir = INPUT_DIRS.find(dir => fs.existsSync(dir));
  if (!inputDir) { console.log('[render_insight] No insight input directory found; nothing to render.'); return; }
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md'));
  for (const file of files) fs.writeFileSync(path.join(OUTPUT_DIR, `${slugify(path.basename(file, '.md'))}.html`), renderInsight(path.join(inputDir, file)));
  console.log(`[render_insight] Rendered ${files.length} insight pages.`);
}
if (require.main === module) run();
module.exports = { renderInsight };
