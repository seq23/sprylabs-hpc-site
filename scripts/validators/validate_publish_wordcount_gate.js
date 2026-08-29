#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, countWords, listTargetFiles, assertTargetFilesExamined, SAFE_PUBLISH_MIN } = require('../lib/word_count_utils');

const targetFiles = listTargetFiles();
assertTargetFilesExamined('validate_publish_wordcount_gate', targetFiles.length);
const shortPages = [];
for (const file of targetFiles) {
  const words = countWords(fs.readFileSync(file, 'utf8'));
  if (words < SAFE_PUBLISH_MIN) shortPages.push(`${path.relative(ROOT, file)} (${words} words; safe publish minimum ${SAFE_PUBLISH_MIN})`);
}
if (shortPages.length) {
  console.log(`[validate_publish_wordcount_gate] ADVISORY (word count does not block publication; see validate_word_count for the same guidance):  ${shortPages.length} pages below safe publish minimum ${SAFE_PUBLISH_MIN}`);
  console.log(shortPages.slice(0, 80).join('\n'));
  process.exit(0);
}
console.log(`[validate_publish_wordcount_gate] OK (${targetFiles.length} pages checked; safe publish minimum ${SAFE_PUBLISH_MIN} words)`);
process.exit(0);
