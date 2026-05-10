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
} = require('../lib/word_count_utils');

const hardFail = [];
const warnings = [];
const files = listTargetFiles();
for (const file of files) {
  const words = countWords(fs.readFileSync(file, 'utf8'));
  const rel = path.relative(ROOT, file);
  if (words < EFFECTIVE_MIN) {
    hardFail.push(`${rel} (${words} words; minimum ${EFFECTIVE_MIN})`);
  } else if (words < SAFE_PUBLISH_MIN) {
    warnings.push(`${rel} (${words} words; safe publish minimum ${SAFE_PUBLISH_MIN})`);
  }
}
if (warnings.length && process.env.WORDCOUNT_WARN_VERBOSE === '1') {
  console.log(`[validate_word_count] NOTE: ${warnings.length} pages are above the hard floor but below the safe publish minimum ${SAFE_PUBLISH_MIN}`);
  console.log(warnings.slice(0, 80).join('\n'));
}
if (hardFail.length) {
  console.error(`[validate_word_count] FAIL: ${hardFail.length} article pages under ${EFFECTIVE_MIN} words`);
  console.error(hardFail.slice(0, 80).join('\n'));
  process.exit(1);
}
console.log(`[validate_word_count] OK (${files.length} pages checked; hard minimum ${EFFECTIVE_MIN} words; safe publish minimum ${SAFE_PUBLISH_MIN} words)`);
process.exit(0);
