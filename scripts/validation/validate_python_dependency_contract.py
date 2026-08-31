#!/usr/bin/env python3
import ast, json, pathlib, re, sys, subprocess, os
ROOT=pathlib.Path.cwd(); SCRIPTS=ROOT/'scripts'; REQ=ROOT/'requirements-validation.txt'; OUT=ROOT/'artifacts/validation/python-dependency-contract.json'
PACKAGE_MAP={'bs4':'beautifulsoup4','lxml':'lxml','yaml':'PyYAML'}
OPTIONAL={'chardet','charset_normalizer','cchardet','html5lib'}
# Credential-gated imports. These modules are installed by the workflow step that
# runs them, and only when the matching secret exists - see the
# "Install GSC client only when provider credentials exist" step in
# .github/workflows/search-intelligence.yml and the pip install inside the
# Search Console step of .github/workflows/deploy-distribution.yml. They are NOT
# in requirements-validation.txt on purpose: the validation container never
# reaches Search Console, so pinning them there would install two packages no
# validated path imports. Declaring them here names the exception; leaving them
# as "unknown" made this validator fail on the current tree, which is why it was
# parked outside every profile and stopped running at all.
CREDENTIAL_GATED={
  'google':'google-auth, installed by the workflow step that supplies GSC_SERVICE_ACCOUNT_JSON',
  'googleapiclient':'google-api-python-client, installed by the workflow step that supplies GSC_SERVICE_ACCOUNT_JSON',
}
# Read-only by default so the check can be armed inside a validator profile.
# --write is the deliberate act that refreshes the committed contract artifact.
WRITE='--write' in sys.argv
errors=[]; imports={}; files=[]
# sys.stdlib_module_names arrived in Python 3.10. On an older interpreter the
# getattr fallback yielded an EMPTY set, so every standard-library import - json,
# os, re, ast - was reported as an "unknown third-party/local import" and this
# check produced ~40 findings that were all noise. It is a guard that cannot
# reach what it governs, and it must say so by name rather than emit nonsense.
if not hasattr(sys,'stdlib_module_names'):
    print(f'[validate:python-dependency-contract] FAIL: this interpreter is Python {sys.version.split()[0]}, which has no sys.stdlib_module_names (added in 3.10). Without it the standard library cannot be told apart from a third-party import and every finding this check produces is noise. WHO MUST ACT: point scripts/validation/python_runtime.mjs at Python 3.10 or newer.')
    sys.exit(1)
stdlib=set(sys.stdlib_module_names)
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
third={}; unknown=[]; gated=[]
for mod,paths in sorted(imports.items()):
    if mod in stdlib or mod in local_roots or mod.startswith('_'): continue
    if mod in OPTIONAL: continue
    if mod in CREDENTIAL_GATED:
        gated.append({'module':mod,'reason':CREDENTIAL_GATED[mod],'files':sorted(paths)})
        continue
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
# Rule 0: a scan that examined nothing is a broken scan, not a pass.
if not files:
    errors.append('scanned zero Python files under scripts/; a dependency contract that inspects nothing must not pass')
report={'schema_version':'1.0','status':'FAIL' if errors else 'PASS','python_files_scanned':len(files),'requirements':reqs,'third_party_imports':third,'credential_gated_imports':gated,'unknown_imports':unknown,'errors':errors}
if WRITE:
    OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(report,indent=2)+'\n')
elif OUT.exists():
    # Armed inside a read-only profile: the committed artifact must already match
    # what this run measured, or the contract on disk is a stale assertion.
    try: committed=json.loads(OUT.read_text())
    except Exception as e: errors.append(f'{OUT}: committed contract unreadable ({e}); regenerate with --write')
    else:
        for key in ('status','python_files_scanned','third_party_imports','credential_gated_imports','unknown_imports'):
            if committed.get(key)!=report.get(key):
                errors.append(f'{OUT}: committed "{key}" does not match the current tree; regenerate with --write')
        report['errors']=errors; report['status']='FAIL' if errors else 'PASS'
if errors:
    print('[validate:python-dependency-contract] FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print(f"[validate:python-dependency-contract] PASS: {len(files)} Python files; {len(third)} third-party imports; all declared and importable")
