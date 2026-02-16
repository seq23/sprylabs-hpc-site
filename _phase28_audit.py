import os, re, hashlib
BASE=os.path.dirname(__file__)
GUM='https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'

def sha256(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for ch in iter(lambda: f.read(1024*1024), b''):
            h.update(ch)
    return h.hexdigest()

# Collect files
all_files=[]
html_files=[]
for root,_,fs in os.walk(BASE):
    for f in fs:
        p=os.path.join(root,f)
        rel=os.path.relpath(p,BASE).replace(os.sep,'/')
        if rel.startswith('templates/'):
            continue
        all_files.append(rel)
        if rel.lower().endswith('.html'):
            html_files.append(rel)

# Hard checks
atlas_ok = ('atlas.html' in all_files) and ('atlas.json' in all_files)

# Gumroad count + after </html>
after_html=[]
gum_bad=[]
for rel in html_files:
    p=os.path.join(BASE, rel.replace('/',os.sep))
    txt=open(p,'r',encoding='utf-8',errors='ignore').read()
    c=txt.count(GUM)
    if c!=1:
        gum_bad.append((rel,c))
    m=list(re.finditer(r'</html\s*>', txt, flags=re.I))
    if m:
        tail=txt[m[-1].end():]
        if tail.strip():
            after_html.append(rel)

# Internal HTML link check (only .html or / or /index.html)
href_re=re.compile(r'href\s*=\s*[\"\']([^\"\']+)[\"\']', re.I)

# Build site path set
site_paths=set()
for rel in html_files:
    site_paths.add('/'+rel)
    if rel.endswith('index.html'):
        url='/' + rel[:-10]
        if not url.endswith('/'):
            url+='/'
        site_paths.add(url)
        site_paths.add(url[:-1])

import urllib.parse

def resolve_href(href, current_rel):
    href=href.strip()
    if not href or href.startswith('#') or href.startswith('mailto:') or href.startswith('tel:') or href.startswith('javascript:'):
        return None
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://', href):
        return None
    href=href.split('#',1)[0].split('?',1)[0]
    if href.startswith('/'):
        return href
    cur_dir=os.path.dirname('/'+current_rel)
    if not cur_dir.endswith('/'):
        cur_dir+='/'
    return urllib.parse.urljoin(cur_dir, href)

broken=[]
for rel in html_files:
    p=os.path.join(BASE, rel.replace('/',os.sep))
    txt=open(p,'r',encoding='utf-8',errors='ignore').read()
    for href in href_re.findall(txt):
        target=resolve_href(href, rel)
        if target is None:
            continue
        if not target.endswith('/'):
            ext=os.path.splitext(target)[1].lower()
            if ext and ext!='.html':
                continue
        if target not in site_paths:
            broken.append((rel, href, target))

# Answers bait + required blocks
answers=[r for r in html_files if r.startswith('answers/') and r!='answers/index.html']
req_h2=[
  'short answer','source','core thesis','definitions','mechanism','implementation',
  "if you're reading this at 3am",'referenced frameworks'
]
missing_blocks=[]
bait_missing=[]
for rel in answers:
    p=os.path.join(BASE, rel.replace('/',os.sep))
    low=open(p,'r',encoding='utf-8',errors='ignore').read().lower()
    if ('if you typed' not in low) and ('if you searched' not in low):
        bait_missing.append(rel)
    for h in req_h2:
        if h not in low:
            missing_blocks.append((rel,h))

# Models required blocks
models=[r for r in html_files if r.startswith('models/') and r.endswith('/index.html') and r!='models/index.html']
req_model=['short answer','source','mechanism','failure modes','implementation']
miss_model=[]
for rel in models:
    p=os.path.join(BASE, rel.replace('/',os.sep))
    low=open(p,'r',encoding='utf-8',errors='ignore').read().lower()
    for h in req_model:
        if h not in low:
            miss_model.append((rel,h))

# Write reports
with open(os.path.join(BASE,'PHASE28_VERIFICATION_REPORT.txt'),'w',encoding='utf-8') as f:
    f.write('PHASE 28 — FINAL FREEZE + RELEASE VERIFICATION\n')
    f.write('Input ZIP: MODEL_AUTHORITY_LAYER_PHASE27_COLLISION_RESCORE.zip\n\n')
    f.write('HARD CHECKS\n')
    f.write(f'- Total files (excluding templates): {len(all_files)}\n')
    f.write(f'- Total HTML files (excluding templates): {len(html_files)}\n')
    f.write(f'- Atlas present (atlas.html + atlas.json): {atlas_ok}\n')
    f.write(f'- Gumroad link count violations: {len(gum_bad)}\n')
    f.write(f'- Pages with content after </html>: {len(after_html)}\n')
    f.write(f'- Broken internal HTML links: {len(broken)}\n')
    f.write(f'- Answers bait missing: {len(bait_missing)}\n')
    f.write(f'- Answers required blocks missing: {len(missing_blocks)}\n')
    f.write(f'- Models required blocks missing: {len(miss_model)}\n\n')
    if gum_bad:
        f.write('GUMROAD COUNT VIOLATIONS\n')
        for rel,c in gum_bad:
            f.write(f'  - {rel}: {c}\n')
        f.write('\n')
    if after_html:
        f.write('CONTENT AFTER </html>\n')
        for rel in after_html:
            f.write(f'  - {rel}\n')
        f.write('\n')
    if broken:
        f.write('BROKEN INTERNAL HTML LINKS (first 50)\n')
        for rel,href,target in broken[:50]:
            f.write(f'  - in {rel}: {href} -> {target}\n')
        if len(broken)>50:
            f.write(f'  ... ({len(broken)-50} more)\n')
        f.write('\n')

with open(os.path.join(BASE,'PHASE28_CHANGED_FILES.txt'),'w',encoding='utf-8') as f:
    # this will be populated by outer diff step if present; placeholder
    f.write('See outer diff computation.\n')

print('OK')
