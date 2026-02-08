#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://spryexecutiveos.com';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');

function abs(p) {
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p.replace(/https?:\/\/SpryExecutiveOS\.com/gi, BASE).replace(/https?:\/\/spryexecutiveos\.com/gi, BASE);
  const pp = p.startsWith('/') ? p : '/' + p;
  return BASE + pp;
}

function listHtml(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...listHtml(fp));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
      out.push(fp);
    }
  }
  return out;
}

function routeFor(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  return '/' + rel;
}

function patchFile(fp) {
  let s = read(fp);
  const orig = s;

  // normalize any existing spry domain casing
  s = s.replace(/https?:\/\/SpryExecutiveOS\.com/gi, BASE).replace(/https?:\/\/spryexecutiveos\.com/gi, BASE);

  const canonical = abs(routeFor(fp));

  // og:url (property then content)
  s = s.replace(/<meta([^>]*?)\bproperty\s*=\s*['\"]og:url['\"]([^>]*?)\bcontent\s*=\s*['\"][^'\"]*['\"]([^>]*)>/gi,
    (_m, a, b, c) => `<meta${a}property="og:url"${b}content="${canonical}"${c}>`);
  // og:url (content then property)
  s = s.replace(/<meta([^>]*?)\bcontent\s*=\s*['\"][^'\"]*['\"]([^>]*?)\bproperty\s*=\s*['\"]og:url['\"]([^>]*)>/gi,
    (_m, a, b, c) => `<meta${a}content="${canonical}"${b}property="og:url"${c}>`);

  // canonical link (rel then href)
  s = s.replace(/<link([^>]*?)\brel\s*=\s*['\"]canonical['\"]([^>]*?)\bhref\s*=\s*['\"][^'\"]*['\"]([^>]*)>/gi,
    (_m, a, b, c) => `<link${a}rel="canonical"${b}href="${canonical}"${c}>`);
  // canonical link (href then rel)
  s = s.replace(/<link([^>]*?)\bhref\s*=\s*['\"][^'\"]*['\"]([^>]*?)\brel\s*=\s*['\"]canonical['\"]([^>]*)>/gi,
    (_m, a, b, c) => `<link${a}href="${canonical}"${b}rel="canonical"${c}>`);

  // JSON-LD: any @id or url that is relative should become absolute
  s = s.replace(/"@id"\s*:\s*"\/(.*?)"/g, (_m, p1) => `"@id":"${abs('/' + p1)}"`);
  s = s.replace(/"url"\s*:\s*"\/(.*?)"/g, (_m, p1) => `"url":"${abs('/' + p1)}"`);

  // normalize again in case JSON-LD had different casing
  s = s.replace(/https?:\/\/SpryExecutiveOS\.com/gi, BASE).replace(/https?:\/\/spryexecutiveos\.com/gi, BASE);

  if (s !== orig) {
    write(fp, s);
    return true;
  }
  return false;
}

let changed = 0;
for (const fp of listHtml(ROOT)) {
  if (patchFile(fp)) {
    console.log('UPDATED:', path.relative(ROOT, fp));
    changed++;
  }
}
console.log(`\nDone. Updated ${changed} file(s).`);
console.log('\n✅ OK: canonical base normalized to https://spryexecutiveos.com');
