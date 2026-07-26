#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MIN_WORDS = 1200;
const TOLERANCE = 0.20;
const EFFECTIVE_MIN = Math.floor(MIN_WORDS * (1 - TOLERANCE));
const SAFE_BUFFER = 120;
const SAFE_PUBLISH_MIN = EFFECTIVE_MIN + SAFE_BUFFER;
const TARGET_DIRS = ['whitepapers', 'insights', 'comparisons'];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ');
}

function countWords(html) {
  const words = stripHtml(html).match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g);
  return words ? words.length : 0;
}

function listTargetFiles(baseDir = ROOT) {
  const files = [];
  for (const dir of TARGET_DIRS) {
    const abs = path.join(baseDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.html') && f !== 'index.html' && f !== 'README.html') {
        files.push(path.join(abs, f));
      }
    }
  }
  for (const f of fs.readdirSync(baseDir)) {
    if (/^synthesis-.*\.html$/.test(f)) files.push(path.join(baseDir, f));
  }
  return files.sort();
}

function classifyWordCount(words) {
  if (words < EFFECTIVE_MIN) return 'hard_fail';
  if (words < SAFE_PUBLISH_MIN) return 'repair';
  return 'pass';
}

module.exports = {
  ROOT,
  MIN_WORDS,
  TOLERANCE,
  EFFECTIVE_MIN,
  SAFE_BUFFER,
  SAFE_PUBLISH_MIN,
  TARGET_DIRS,
  stripHtml,
  countWords,
  listTargetFiles,
  classifyWordCount,
};
