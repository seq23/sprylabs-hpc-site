#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, countWords, listTargetFiles, SAFE_PUBLISH_MIN } = require('../lib/word_count_utils');

const bad = [];
for (const file of listTargetFiles()) {
  const words = countWords(fs.readFileSync(file, 'utf8'));
  if (words < SAFE_PUBLISH_MIN) bad.push(`${path.relative(ROOT, file)} (${words} words; safe publish minimum ${SAFE_PUBLISH_MIN})`);
}
if (bad.length) {
  console.error(`[validate_publish_wordcount_gate] FAIL: ${bad.length} pages below safe publish minimum ${SAFE_PUBLISH_MIN}`);
  console.error(bad.slice(0, 80).join('\n'));
  process.exit(1);
}
console.log(`[validate_publish_wordcount_gate] OK (${listTargetFiles().length} pages checked; safe publish minimum ${SAFE_PUBLISH_MIN} words)`);
