from __future__ import annotations
import hashlib,json,os,tempfile
from pathlib import Path
ROOT=Path.cwd(); CACHE=ROOT/'.validation-cache'/'v1'; OBJ=CACHE/'objects'; INDEX=CACHE/'page-index.json'; EPOCH='page-audit-v1'

def canon(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
 p=Path(p); return sha_bytes(p.read_bytes()) if p.exists() else 'MISSING'
def global_contract_hash(extra=None):
 files=['scripts/citation/extraction_contract.py','scripts/validation/validate_extraction_contract_final_state.py','scripts/validation/validate_rendered_schema_parity.py','data/citation/citable_pages.json','data/citation/query_registry.json','data/content/page_admission_registry.json','package-lock.json','requirements-validation.txt','.validation-runtime/runtime-identity.json']
 payload={'epoch':EPOCH,'python':os.sys.version,'files':{f:sha_file(ROOT/f) for f in files}}
 if extra: payload['extra']=extra
 return sha_bytes(canon(payload).encode())
def fingerprint(path,record,validator):
 p=ROOT/path
 payload={'repo':'sprylabs-hpc-site','epoch':EPOCH,'validator':validator,'page':path,'page_hash':sha_file(p),'record':record,'global':global_contract_hash(validator)}
 return sha_bytes(canon(payload).encode())
def _load_index():
 try:return json.loads(INDEX.read_text())
 except:return {'schema_version':'1.0','epoch':EPOCH,'entries':{}}
def lookup(path,record,validator):
 if os.environ.get('VALIDATION_CACHE_MODE')=='full': return None
 fp=fingerprint(path,record,validator); op=OBJ/fp[:2]/f'{fp}.json'
 try:
  d=json.loads(op.read_text())
  if d.get('fingerprint')==fp and d.get('status')=='PASS' and d.get('validator')==validator:return d
 except: return None
 return None
def store(path,record,validator,result):
 fp=fingerprint(path,record,validator); OBJ.joinpath(fp[:2]).mkdir(parents=True,exist_ok=True)
 obj={'schema_version':'1.0','epoch':EPOCH,'fingerprint':fp,'validator':validator,'page':path,'status':'PASS','result':result}
 op=OBJ/fp[:2]/f'{fp}.json'; tmp=op.with_suffix('.tmp'); tmp.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n'); tmp.replace(op)
 CACHE.mkdir(parents=True,exist_ok=True); idx=_load_index(); idx['epoch']=EPOCH; idx.setdefault('entries',{})[f'{validator}:{path}']={'fingerprint':fp,'status':'PASS'}
 fd,tmpn=tempfile.mkstemp(dir=CACHE,prefix='index-',suffix='.tmp'); os.close(fd); Path(tmpn).write_text(json.dumps(idx,sort_keys=True,indent=2)+'\n'); Path(tmpn).replace(INDEX)
 return obj
def clear():
 import shutil
 if CACHE.parent.exists(): shutil.rmtree(CACHE.parent)
