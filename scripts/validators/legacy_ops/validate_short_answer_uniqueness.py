#!/usr/bin/env python3
import os, re, sys, hashlib
from pathlib import Path
ROOT = Path.cwd()
SKIP = {'.git','node_modules','.github','assets'}
entries = []
for p in ROOT.rglob('*.html'):
    if set(p.relative_to(ROOT).parts) & SKIP: continue
    rel = p.relative_to(ROOT).as_posix()
    if rel in {'download.html','product.html','legal.html'}: continue
    txt = p.read_text(encoding='utf-8', errors='ignore')
    m = re.search(r'<h2>Short Answer</h2>\s*<p[^>]*>(.*?)</p>', txt, re.I|re.S)
    if not m: continue
    body = re.sub(r'<[^>]+>', ' ', m.group(1))
    body = re.sub(r'\s+', ' ', body).strip().lower()
    fingerprint = re.sub(r'https?://\S+','', body)
    fingerprint = re.sub(r'billionaire high performance coach \(system manual\)','', fingerprint)
    fingerprint = re.sub(r'full framework.*','', fingerprint)
    fingerprint = fingerprint.strip()
    entries.append((rel, body, hashlib.md5(fingerprint.encode()).hexdigest()))
seen = {}
failures = []
def stem(rel):
    if rel.endswith('/index.html'):
        return rel[:-11].split('/')[-1]
    if rel.endswith('.html'):
        return rel[:-5].split('/')[-1]
    return rel.split('/')[-1]
for rel, body, h in entries:
    if h in seen:
        other = seen[h]
        if stem(rel) == stem(other):
            continue
        failures.append(f'{rel}: duplicate short answer fingerprint matches {other}')
    else:
        seen[h] = rel
if failures:
    print('FAIL')
    for f in failures[:200]: print(f)
    sys.exit(1)
print('OK')
