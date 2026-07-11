#!/usr/bin/env python3
import ast, json, pathlib, re, sys, subprocess, os
ROOT=pathlib.Path.cwd(); SCRIPTS=ROOT/'scripts'; REQ=ROOT/'requirements-validation.txt'; OUT=ROOT/'artifacts/validation/python-dependency-contract.json'
PACKAGE_MAP={'bs4':'beautifulsoup4','lxml':'lxml','yaml':'PyYAML'}
OPTIONAL={'chardet','charset_normalizer','cchardet','html5lib'}
errors=[]; imports={}; files=[]
stdlib=set(getattr(sys,'stdlib_module_names',()))
local_roots={d.name for d in SCRIPTS.rglob('*') if d.is_dir() and '_vendor' not in d.parts}
for p in SCRIPTS.rglob('*.py'):
    if '_vendor' in p.parts: continue
    local_roots.add(p.stem)
for p in SCRIPTS.rglob('*.py'):
    if '_vendor' in p.parts: continue
    files.append(str(p.relative_to(ROOT)))
    try: tree=ast.parse(p.read_text(encoding='utf-8',errors='ignore'),filename=str(p))
    except Exception as e: errors.append(f'{p}: syntax parse failed: {e}'); continue
    for n in ast.walk(tree):
        names=[]
        if isinstance(n,ast.Import): names=[a.name.split('.')[0] for a in n.names]
        elif isinstance(n,ast.ImportFrom) and n.module: names=[n.module.split('.')[0]]
        for name in names: imports.setdefault(name,set()).add(str(p.relative_to(ROOT)))
reqs={}
for line in REQ.read_text().splitlines():
    line=line.strip()
    if not line or line.startswith('#'): continue
    m=re.match(r'([A-Za-z0-9_.-]+)==(.+)$',line)
    if not m: errors.append(f'unpinned requirement: {line}'); continue
    reqs[m.group(1).lower()]={'name':m.group(1),'version':m.group(2)}
third={}; unknown=[]
for mod,paths in sorted(imports.items()):
    if mod in stdlib or mod in local_roots or mod.startswith('_'): continue
    if mod in OPTIONAL: continue
    pkg=PACKAGE_MAP.get(mod)
    if pkg:
        third[mod]={'package':pkg,'files':sorted(paths)}
        if pkg.lower() not in reqs: errors.append(f'{mod} requires undeclared package {pkg}')
    else: unknown.append({'module':mod,'files':sorted(paths)})
if unknown: errors.extend([f"unknown third-party/local import {x['module']}" for x in unknown])
# Prove required runtime imports in the managed interpreter.
for mod in sorted(third):
    r=subprocess.run([sys.executable,'-c',f'import {mod}'],env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True)
    if r.returncode: errors.append(f'import {mod} failed: {(r.stderr or r.stdout).strip()}')
# Compile every owned Python file without importing/executing side effects.
for rel in files:
    p=ROOT/rel
    try: compile(p.read_text(encoding='utf-8',errors='ignore'),str(p),'exec')
    except Exception as e: errors.append(f'{rel}: compile failed: {e}')
report={'schema_version':'1.0','status':'FAIL' if errors else 'PASS','python_files_scanned':len(files),'requirements':reqs,'third_party_imports':third,'unknown_imports':unknown,'errors':errors}
OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(report,indent=2)+'\n')
if errors:
    print('[validate:python-dependency-contract] FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print(f"[validate:python-dependency-contract] PASS: {len(files)} Python files; {len(third)} third-party imports; all declared and importable")
