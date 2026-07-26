import os, hashlib
NEW=os.path.dirname(__file__)
ORIG='/mnt/data/phase27_orig'

def sha256(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for ch in iter(lambda: f.read(1024*1024), b''):
            h.update(ch)
    return h.hexdigest()

changed=[]
# compare files present in NEW (excluding templates)
for root,_,fs in os.walk(NEW):
    for fn in fs:
        p=os.path.join(root,fn)
        rel=os.path.relpath(p,NEW).replace(os.sep,'/')
        if rel.startswith('templates/'):
            continue
        op=os.path.join(ORIG, rel.replace('/',os.sep))
        if not os.path.exists(op):
            changed.append(rel+' (added)')
        else:
            if sha256(p)!=sha256(op):
                changed.append(rel)

# removed
removed=[]
for root,_,fs in os.walk(ORIG):
    for fn in fs:
        p=os.path.join(root,fn)
        rel=os.path.relpath(p,ORIG).replace(os.sep,'/')
        if rel.startswith('templates/'):
            continue
        np=os.path.join(NEW, rel.replace('/',os.sep))
        if not os.path.exists(np):
            removed.append(rel)

with open(os.path.join(NEW,'PHASE28_CHANGED_FILES.txt'),'w',encoding='utf-8') as f:
    f.write('CHANGED FILES VS PHASE27 (SHA-256)\n')
    for r in sorted(changed):
        f.write(r+'\n')
    if removed:
        f.write('\nREMOVED FILES VS PHASE27\n')
        for r in sorted(removed):
            f.write(r+'\n')

print('changed', len(changed), 'removed', len(removed))
