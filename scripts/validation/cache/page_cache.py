from __future__ import annotations
import hashlib,json,os
from pathlib import Path
ROOT=Path.cwd(); CACHE=ROOT/'.validation-cache'/'v1'; OBJ=CACHE/'objects'; INDEX=CACHE/'page-index.json'; JOURNAL=CACHE/'page-index.jsonl'; EPOCH='page-audit-v1'; _GLOBAL_HASH_MEMO={}
# Fingerprints this process has already stored, so a page revalidated twice in
# one run drops its own predecessor immediately instead of waiting for a sweep.
_WRITTEN={}

def canon(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
 p=Path(p); return sha_bytes(p.read_bytes()) if p.exists() else 'MISSING'
def global_contract_hash(extra=None):
 key=canon(extra or '')
 if key in _GLOBAL_HASH_MEMO:
  return _GLOBAL_HASH_MEMO[key]
 files=['scripts/citation/extraction_contract.py','scripts/validation/validate_extraction_contract_final_state.py','scripts/validation/validate_rendered_schema_parity.py','data/citation/citable_pages.json','data/citation/query_registry.json','data/content/page_admission_registry.json','package-lock.json','requirements-validation.txt']
 payload={'epoch':EPOCH,'python':os.sys.version,'files':{f:sha_file(ROOT/f) for f in files}}
 if extra: payload['extra']=extra
 value=sha_bytes(canon(payload).encode())
 _GLOBAL_HASH_MEMO[key]=value
 return value
def fingerprint(path,record,validator):
 p=ROOT/path
 payload={'repo':'sprylabs-hpc-site','epoch':EPOCH,'validator':validator,'page':path,'page_hash':sha_file(p),'record':record,'global':global_contract_hash(validator)}
 return sha_bytes(canon(payload).encode())
def lookup(path,record,validator):
 if os.environ.get('VALIDATION_CACHE_MODE')=='full': return None
 fp=fingerprint(path,record,validator); op=OBJ/fp[:2]/f'{fp}.json'
 try:
  d=json.loads(op.read_text())
  if d.get('fingerprint')==fp and d.get('status')=='PASS' and d.get('validator')==validator:return d
 except: return None
 return None
def _drop_object(fp):
 # Delete a superseded object. Fingerprints embed validator+page, so an index
 # key maps 1:1 to a fingerprint and no other live entry can still reference it.
 if not fp: return
 try: (OBJ/fp[:2]/f'{fp}.json').unlink()
 except OSError: pass

def store(path,record,validator,result):
 fp=fingerprint(path,record,validator); OBJ.joinpath(fp[:2]).mkdir(parents=True,exist_ok=True)
 obj={'schema_version':'1.0','epoch':EPOCH,'fingerprint':fp,'validator':validator,'page':path,'status':'PASS','result':result}
 op=OBJ/fp[:2]/f'{fp}.json'; tmp=op.with_suffix('.tmp'); tmp.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n'); tmp.replace(op)
 CACHE.mkdir(parents=True,exist_ok=True)
 key=f'{validator}:{path}'
 # Append one line to a journal instead of rewriting page-index.json.
 #
 # The rewrite it replaces was a read-modify-write of the WHOLE index per page,
 # from up to 16 concurrent shard processes. Every shard loaded the index,
 # changed its own key and wrote the file back, so whichever shard wrote last
 # erased every entry the others had added since it loaded - a textbook lost
 # update. One full audit left 1,511 index entries pointing at objects that no
 # longer existed and 1,602 objects nothing referenced, which is why the store
 # kept growing even though each page had exactly one live result. It was also
 # quadratic: 8,481 rewrites of a 2 MB file is ~17 GB of write amplification
 # per run, and removing it cut a full audit from 48s to 7s.
 #
 # An O_APPEND write of one short line is atomic against other appenders, so
 # shards can no longer clobber each other. validation_cache.mjs compacts the
 # journal into page-index.json (last line per key wins) on inspect and prune.
 with open(JOURNAL,'a',encoding='utf-8') as fh:
  fh.write(json.dumps({'k':key,'f':fp,'s':'PASS','e':EPOCH},sort_keys=True)+'\n')
 prior_fp=_WRITTEN.get(key); _WRITTEN[key]=fp
 # Only after the journal records the replacement, so an interrupted store can
 # never leave a live reference pointing at a deleted object.
 if prior_fp and prior_fp!=fp: _drop_object(prior_fp)
 return obj
def clear():
 import shutil
 if CACHE.parent.exists(): shutil.rmtree(CACHE.parent)
