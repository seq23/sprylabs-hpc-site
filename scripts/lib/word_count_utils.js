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

// The long-form article families this guidance applies to. Deliberately NOT the
// whole site: answers/, glossary/ and the programmatic families have their own,
// lower floors declared in data/content/programmatic_lane_contracts.json, and
// holding them to a 1,200-word article target would be measuring the wrong thing.
//
// The walk is recursive now. It used to be a flat readdirSync of each directory,
// which silently skipped every nested page - insights/ alone was 158 of its 175
// files - so the count printed as "pages checked" was not even the whole of the
// three families it named.
function listTargetFiles(baseDir = ROOT) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.html')) continue;
      if (e.name === 'index.html' || e.name === 'README.html') continue;
      files.push(full);
    }
  };
  for (const dir of TARGET_DIRS) {
    const abs = path.join(baseDir, dir);
    if (!fs.existsSync(abs)) continue;
    walk(abs);
  }
  for (const f of fs.readdirSync(baseDir)) {
    if (/^synthesis-.*\.html$/.test(f)) files.push(path.join(baseDir, f));
  }
  return files.sort();
}

// Rule 0: a word-count scan that examined nothing is a broken scan. Both callers
// are advisory about the COUNTS they find; neither may be advisory about having
// found no files at all.
function assertTargetFilesExamined(label, count) {
  if (Number(count) > 0) return;
  console.error(`[${label}] FAIL: examined zero article pages under ${TARGET_DIRS.join(', ')}. A scan that inspects nothing must not report a clean result.`);
  process.exit(1);
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
  assertTargetFilesExamined,
  classifyWordCount,
};
