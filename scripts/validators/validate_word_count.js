#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const MIN_WORDS = 1200;
const TOLERANCE = 0.20;
const EFFECTIVE_MIN = Math.floor(MIN_WORDS * (1 - TOLERANCE));
const TARGET_DIRS = ['whitepapers', 'insights', 'comparisons'];
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' '); }
function countWords(html) { const words = stripHtml(html).match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g); return words ? words.length : 0; }
const files = [];
for (const dir of TARGET_DIRS) { const abs = path.join(ROOT, dir); if (!fs.existsSync(abs)) continue; for (const f of fs.readdirSync(abs)) if (f.endsWith('.html') && f !== 'index.html' && f !== 'README.html') files.push(path.join(abs, f)); }
for (const f of fs.readdirSync(ROOT)) if (/^synthesis-.*\.html$/.test(f)) files.push(path.join(ROOT, f));
const bad = [];
for (const file of files) { const words = countWords(fs.readFileSync(file, 'utf8')); if (words < EFFECTIVE_MIN) bad.push(`${path.relative(ROOT, file)} (${words} words; minimum ${EFFECTIVE_MIN})`); }
if (bad.length) { console.error(`[validate_word_count] FAIL: ${bad.length} article pages under ${EFFECTIVE_MIN} words`); console.error(bad.slice(0, 80).join('\n')); process.exit(1); }
console.log(`[validate_word_count] OK (${files.length} pages checked; minimum ${EFFECTIVE_MIN} words)`);

process.exit(0);
