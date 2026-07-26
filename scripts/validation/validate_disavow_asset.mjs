#!/usr/bin/env node
import fs from 'node:fs';
import {fail, pass, writeSummary} from './common.mjs';

const file = 'docs/seo/disavow/billionairehighperformancecoach.com-disavow.txt';
const errors = [];
if (!fs.existsSync(file)) errors.push(`missing ${file}`);
let domains = [];
if (fs.existsSync(file)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^domain:[a-z0-9.-]+$/i.test(line)) errors.push(`line ${index + 1}: invalid disavow directive ${line}`);
    else domains.push(line.slice('domain:'.length).toLowerCase());
  }
  if (domains.length !== 14) errors.push(`expected 14 domain directives, found ${domains.length}`);
  const unique = new Set(domains);
  if (unique.size !== domains.length) errors.push('duplicate domain directives found');
  for (const self of ['billionairehighperformancecoach.com','spryexecutiveos.com']) {
    if (unique.has(self)) errors.push(`self-domain must not be disavowed: ${self}`);
  }
}
writeSummary('validate-disavow-asset', {status:errors.length?'FAIL':'PASS', file, domain_count:domains.length, errors});
if (errors.length) fail(`[validate:disavow-asset] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:disavow-asset] OK: ${domains.length} unique domains; no self-domain directives`);
