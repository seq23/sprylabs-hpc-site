#!/usr/bin/env node
import fs from 'node:fs';
const limit = Number(process.env.INDEXNOW_ACTIVE_BATCH_LIMIT || 100);
const file = '.build/indexnow-batch.txt';
const deferred = '.build/indexnow-deferred-batch.txt';
const lines = fs.existsSync(file) ? fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean) : [];
const deferredLines = fs.existsSync(deferred) ? fs.readFileSync(deferred,'utf8').split(/\r?\n/).filter(Boolean) : [];
const errors=[];
if (!fs.existsSync(file)) errors.push(`${file} missing`);
// The batch budget is only ever tested against the URLs in this file, so a present
// but empty batch passed the budget while submitting nothing to IndexNow - a
// generator that stopped writing URLs would look like a clean run.
else if (!lines.length) errors.push(`${file} exists but lists 0 URLs; the batch budget is checked only against those URLs, so an empty submission batch proves nothing`);
if (lines.length > limit) errors.push(`active IndexNow batch has ${lines.length} URLs; limit is ${limit}`);
if (!fs.existsSync(deferred)) errors.push(`${deferred} missing`);
const report={status:errors.length?'FAIL':'PASS', active_count:lines.length, deferred_count:deferredLines.length, limit, errors};
fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/indexnow-batch-budget.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length) process.exit(1);
