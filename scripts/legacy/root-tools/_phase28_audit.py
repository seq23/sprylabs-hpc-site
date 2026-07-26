import os
import re
import sys
from urllib.parse import urljoin

BASE = os.path.dirname(__file__)
DOWNLOAD = 'https://spryexecutiveos.com/download.html'

html_files = []
for root, _, files in os.walk(BASE):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), BASE).replace(os.sep, '/')
        if rel.startswith('templates/'):
            continue
        if rel.lower().endswith('.html'):
            html_files.append(rel)

site_paths = set()
for rel in html_files:
    site_paths.add('/' + rel)
    if rel.endswith('index.html'):
        base = '/' + rel[:-10]
        site_paths.add(base)
        site_paths.add(base.rstrip('/'))

violations = []
broken = []

href_re = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.I)

for rel in html_files:
    p = os.path.join(BASE, rel.replace('/', os.sep))
    txt = open(p, 'r', encoding='utf-8', errors='ignore').read()
    low = txt.lower()

    if rel == 'download.html':
        if 'get instant access' not in low:
            violations.append(f'{rel}: missing locked CTA text')
        if 'secure checkout via gumroad. instant download after purchase.' not in low:
            violations.append(f'{rel}: missing checkout trust line')
    if rel == 'product.html' and DOWNLOAD not in txt:
        violations.append(f'{rel}: missing bridge target to download.html')

    source_match = re.search(r'<h2>Source</h2>([\s\S]{0,900}?)(?:<h2>|</section>)', txt, re.I)
    if source_match:
        source = source_match.group(1)
        if 'gumroad.com' in source.lower():
            violations.append(f'{rel}: Gumroad appears inside Source block')
        if DOWNLOAD not in source and '/download.html' not in source:
            violations.append(f'{rel}: Source block missing download link')

    for href in href_re.findall(txt):
        href = href.strip()
        if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
            continue
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://', href):
            continue
        target = href.split('#', 1)[0].split('?', 1)[0]
        if target.startswith('/'):
            resolved = target
        else:
            cur_dir = os.path.dirname('/' + rel)
            if not cur_dir.endswith('/'):
                cur_dir += '/'
            resolved = urljoin(cur_dir, target)
        if resolved.endswith('/'):
            if resolved not in site_paths and (resolved + 'index.html') not in site_paths and (resolved[:-1] + '/index.html') not in site_paths:
                broken.append(f'{rel}: {href} -> {resolved}')
        else:
            ext = os.path.splitext(resolved)[1].lower()
            if ext and ext != '.html':
                continue
            if resolved not in site_paths and (resolved + '.html') not in site_paths and (resolved + '/index.html') not in site_paths:
                broken.append(f'{rel}: {href} -> {resolved}')

with open(os.path.join(BASE, 'PHASE28_VERIFICATION_REPORT.txt'), 'w', encoding='utf-8') as f:
    f.write('PHASE 28 — ROUTE AUTHORITY + DOWNLOAD PAGE VERIFICATION\n\n')
    f.write(f'Total HTML files: {len(html_files)}\n')
    f.write(f'Violations: {len(violations)}\n')
    f.write(f'Broken internal links: {len(broken)}\n\n')
    if violations:
        f.write('VIOLATIONS\n')
        for v in violations:
            f.write(f'- {v}\n')
        f.write('\n')
    if broken:
        f.write('BROKEN LINKS (first 200)\n')
        for v in broken[:200]:
            f.write(f'- {v}\n')

if violations or broken:
    print('FAIL')
    sys.exit(1)
print('OK')
