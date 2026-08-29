#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  EFFECTIVE_MIN,
  SAFE_PUBLISH_MIN,
  countWords,
  listTargetFiles,
  assertTargetFilesExamined,
} = require('../lib/word_count_utils');

const underEffectiveMin = [];
const underSafeMin = [];
const files = listTargetFiles();
assertTargetFilesExamined('validate_word_count', files.length);
for (const file of files) {
  const words = countWords(fs.readFileSync(file, 'utf8'));
  const rel = path.relative(ROOT, file);
  if (words < EFFECTIVE_MIN) {
    underEffectiveMin.push(`${rel} (${words} words; former hard minimum ${EFFECTIVE_MIN})`);
  } else if (words < SAFE_PUBLISH_MIN) {
    underSafeMin.push(`${rel} (${words} words; safe publish minimum ${SAFE_PUBLISH_MIN})`);
  }
}
if (underEffectiveMin.length || underSafeMin.length) {
  console.log(`[validate_word_count] WARN: ${underEffectiveMin.length + underSafeMin.length} article pages below word-count guidance; word count is warning-only`);
  for (const line of underEffectiveMin.slice(0, 80)) console.log(line);
  for (const line of underSafeMin.slice(0, 80)) console.log(line);
  process.exit(0);
}
console.log(`[validate_word_count] OK (${files.length} pages checked; warning-only minimum ${EFFECTIVE_MIN} words; safe publish guidance ${SAFE_PUBLISH_MIN} words)`);
process.exit(0);
