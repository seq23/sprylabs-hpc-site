#!/usr/bin/env node
// Safety: no credential and no personal mailbox address is ever committed to
// this public repository. Reads every tracked text file (git ls-files); exits 1
// naming file and line on any hit, and refuses to pass having read nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SECRET = [
  ['private key', /BEGIN [A-Z ]*PRIVATE KEY/],
  ['OpenRouter key', /sk-or-v1-[a-f0-9]{20,}/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
];
// Owner and team mail lives in personal mailboxes; the public site uses its own domains.
const PERSONAL_MAIL = /[A-Za-z0-9._%+-]@(?:gmail|googlemail|icloud|me|mac|yahoo|hotmail|outlook|live|aol|proton|protonmail)\.(?:com|me)\b/i;
const SELF = 'scripts/validators/check_no_secrets_or_owner_emails.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
let read = 0;
const hits = [];
for (const f of files) {
  // LICENSES/ holds third-party licence texts, which name their own authors.
  if (f === SELF || f.startsWith('node_modules/') || f.startsWith('LICENSES/')) continue;
  let buf;
  try { buf = fs.readFileSync(f); } catch { continue; }
  if (buf.length > 8 * 1024 * 1024 || buf.includes(0)) continue;
  read++;
  const text = buf.toString('utf8');
  const lineOf = (re) => text.slice(0, text.search(re)).split('\n').length;
  for (const [name, re] of SECRET) if (re.test(text)) hits.push(`${f}:${lineOf(re)}: ${name}`);
  if (PERSONAL_MAIL.test(text)) hits.push(`${f}:${lineOf(PERSONAL_MAIL)}: personal mailbox address`);
}
if (read < 100) { console.error(`[no-secrets] FAIL: read only ${read} tracked text file(s); expected the whole repository.`); process.exit(1); }
if (hits.length) {
  console.error(`[no-secrets] FAIL: ${hits.length} hit(s) in a public repository:`);
  for (const h of hits.slice(0, 50)) console.error('  ' + h);
  process.exit(1);
}
console.log(`[no-secrets] PASS: ${read} tracked text files, no credential and no personal mailbox address.`);
