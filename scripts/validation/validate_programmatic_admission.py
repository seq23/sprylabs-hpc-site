#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
VENDOR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
from style_policy import sentence_count, paragraph_sentence_severity, paragraph_sentence_message

ROOT=Path(__file__).resolve().parents[2]
CONTRACT=json.loads((ROOT/'data/content/programmatic_lane_contracts.json').read_text(encoding='utf-8'))
LANES=CONTRACT['lanes']
AXES=CONTRACT.get('programmatic_axes',{})
REGISTRY=json.loads((ROOT/'data/content/page_admission_registry.json').read_text(encoding='utf-8'))['records']
HEALTH=json.loads((ROOT/'data/citation/health_adjacent_content_contract.json').read_text(encoding='utf-8'))
WORD=re.compile(r"\b[\w’'-]+\b",re.UNICODE)
SENTENCE=re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')
DATE=re.compile(r'^\d{4}-\d{2}-\d{2}$')

def words(s): return WORD.findall(s or '')
def norm(s): return ' '.join(re.sub(r'[^a-z0-9]+',' ',(s or '').casefold()).split())
def text_of(node): return node.get_text(' ',strip=True) if node else ''
def shingles(s,n=5):
    w=[x.casefold() for x in words(s)]
    return {tuple(w[i:i+n]) for i in range(max(0,len(w)-n+1))}
def similarity(a,b,n=5):
    sa,sb=shingles(a,n),shingles(b,n)
    return len(sa&sb)/max(1,len(sa|sb)) if sa and sb else 0.0
def main_unique_text(soup):
    chunks=[]
    for sel in ['[data-llm-answer="true"]','.page-artifact','.worked-example','.page-specific-section']:
        for node in soup.select(sel): chunks.append(text_of(node))
    return ' '.join(chunks)
def detect_artifact(soup):
    if soup.select_one('.prompt-card'): return 'prompts'
    if soup.select_one('.checklist-list'): return 'checklist'
    if soup.find('table'): return 'table'
    if soup.select_one('.page-artifact'): return 'artifact'
    if soup.find('ol'): return 'ordered_steps'
    if soup.select_one('.citation-criteria'): return 'criteria'
    return ''
def source_count(soup):
    return len(soup.select('section.sources li, section#sources li, .source-ledger .source-record'))
def direct_answer_text(soup):
    node=soup.select_one('.tldr') or soup.select_one('p.citation-definition') or soup.select_one('[data-llm-answer="true"] p')
    return text_of(node).replace('TL;DR:','',1).strip()
def first_answer_words(soup): return len(words(direct_answer_text(soup)))
def visible_review_date(soup):
    byline=soup.select_one('.byline')
    if not byline: return None
    times=byline.find_all('time')
    return times[-1].get('datetime') if times else None
def remove_terms(text,*terms):
    out=text or ''
    for term in terms:
        term=(term or '').strip()
        if term: out=re.sub(re.escape(term), ' ENTITYTERM ', out, flags=re.I)
    return out
def result_item(result,path): return next((x for x in result if x['path']==path),None)
def add_pair_error(all_errors,result,paths,msg):
    all_errors.append(msg)
    for path in paths:
        item=result_item(result,path)
        if item and msg not in item['errors']:
            item['accepted']=False; item['errors'].append(msg)

def inspect(record):
    errors=[]
    path=record['path']; fp=ROOT/path
    if not fp.exists(): return [f'{path}: rendered page missing'],'',None
    raw=fp.read_text(encoding='utf-8')
    soup=BeautifulSoup(raw,'html.parser')
    lane=LANES.get(record['generation_lane'],LANES['legacy'])
    h1=soup.find('h1')
    if not h1: errors.append(f'{path}: H1 missing')
    canonical=soup.find('link',rel='canonical')
    if not canonical: errors.append(f'{path}: canonical missing')
    definition=soup.select_one('p.citation-definition > strong')
    if not definition: errors.append(f'{path}: bold definitional opening missing')
    blocks=soup.select('[data-llm-answer="true"]')
    if len(blocks)!=1: errors.append(f'{path}: expected exactly one extraction block, found {len(blocks)}')
    framework=(blocks[0].get('data-named-framework') if len(blocks)==1 else '') or ''
    if record.get('framework') and norm(record['framework'])!=norm(framework): errors.append(f'{path}: framework registry mismatch')
    first60=' '.join(words((soup.find('article') or soup).get_text(' ',strip=True))[:60])
    if framework and norm(framework) not in norm(first60): errors.append(f'{path}: framework not present in first 60 words')
    body_anchor=next((a for a in soup.select('article a[href="/download.html"]') if a.find_parent(class_='product-anchor')),None)
    if not body_anchor: errors.append(f'{path}: contextual /download.html product anchor missing')
    if record.get('admission_level')=='full':
        article=soup.find('article') or soup
        wc=len(words(text_of(article)))
        if wc<int(lane.get('minimum_word_count',0)): errors.append(f'{path}: word count {wc} below lane floor {lane.get("minimum_word_count")}')
        if lane.get('required_artifacts') and not detect_artifact(soup): errors.append(f'{path}: unique artifact missing')
        if lane.get('worked_example') and not soup.select_one('.worked-example'): errors.append(f'{path}: worked example missing')
        header_cta=soup.select_one('header a[href="/download.html"], header a[href^="https://sprylabs.gumroad.com/"], .cta-bar a[href="/download.html"], .cta-bar a[href^="https://sprylabs.gumroad.com/"]')
        footer_cta=soup.select_one('footer a[href="/download.html"], footer a[href^="https://sprylabs.gumroad.com/"]')
        if not header_cta: errors.append(f'{path}: header/top CTA missing')
        if not footer_cta: errors.append(f'{path}: footer CTA missing')
        for idx,p in enumerate(soup.find_all('p')):
            n=sentence_count(text_of(p))
            severity=paragraph_sentence_severity(n)
            if severity=='FAIL':
                errors.append(paragraph_sentence_message(path, idx, n)); break
            # Minor paragraph-length drift is warning-only and not release-blocking.
        floor=int(lane.get('source_floor',0))
        if source_count(soup)<floor: errors.append(f'{path}: source count below lane floor {floor}')
        atom=record.get('unique_atom','')
        if len(words(atom))<12: errors.append(f'{path}: unique_atom is too weak or missing')
        for field in lane.get('required_fields',[]):
            if record.get(field) in (None,'',[]): errors.append(f'{path}: lane requires {field}')

        lane_name=record['generation_lane']
        if lane_name=='entity_use_case':
            entity=str(record.get('entity') or '')
            use_case=str(record.get('use_case') or '')
            query=str(record.get('primary_query') or '')
            if norm(entity) and norm(entity) not in norm(query): errors.append(f'{path}: primary query does not name entity {entity}')
            if norm(use_case) and norm(use_case) not in norm(query+' '+atom): errors.append(f'{path}: use case is not visible in query or unique atom')
            stripped=remove_terms(atom,entity,use_case)
            min_words=int(AXES.get('entity_use_case',{}).get('unique_atom_min_words_after_entity_use_case_removal',8))
            if len([w for w in words(stripped) if w.casefold()!='entityterm'])<min_words:
                errors.append(f'{path}: unique atom collapses after entity/use-case terms are removed')

        if lane_name=='comparison_graph':
            if not soup.find('table'): errors.append(f'{path}: comparison graph page requires a table')
            reviewed=visible_review_date(soup)
            if not reviewed: errors.append(f'{path}: comparison graph page requires a visible reviewed date')
            entities=record.get('comparison_entities') or []
            if not isinstance(entities,list) or len(entities)<2: errors.append(f'{path}: comparison_entities must contain at least two entities')
            verified=str(record.get('verified_at') or '')
            if not DATE.match(verified): errors.append(f'{path}: verified_at must be YYYY-MM-DD')
            elif reviewed and reviewed!=verified: errors.append(f'{path}: visible reviewed date {reviewed} does not match verified_at {verified}')
            official=record.get('official_sources') or []
            if not isinstance(official,list): official=[]
            mapped={}; hosts=set(); visible_urls={a.get('href') for a in soup.select('section.sources a[href], section#sources a[href]')}
            for item in official:
                if not isinstance(item,dict): errors.append(f'{path}: official_sources entries must map entity to URL'); continue
                entity=str(item.get('entity') or ''); url=str(item.get('url') or '')
                parsed=urlparse(url)
                if not entity or parsed.scheme!='https' or not parsed.hostname: errors.append(f'{path}: invalid official source mapping {item}'); continue
                mapped[norm(entity)]=url; hosts.add(parsed.hostname.casefold().removeprefix('www.'))
                if url not in visible_urls: errors.append(f'{path}: official source is not visible on page: {url}')
            for entity in entities:
                if norm(str(entity)) not in mapped: errors.append(f'{path}: no official source mapped for {entity}')
            if len(official)<int(lane.get('official_source_floor',2)): errors.append(f'{path}: official source count below comparison floor')
            if len(hosts)<int(lane.get('official_source_distinct_host_floor',2)): errors.append(f'{path}: official sources must use at least two distinct hosts')
            disclosure=str(record.get('conflict_disclosure') or '').strip()
            visible_disclosure=text_of(soup.select_one('.comparison-disclosure'))
            if not disclosure or norm(disclosure) not in norm(visible_disclosure): errors.append(f'{path}: visible conflict disclosure missing or mismatched')

        if lane_name=='question_cluster':
            if not str(record.get('primary_query','')).rstrip().endswith('?'): errors.append(f'{path}: question-cluster primary query must be a literal question')
            max_words=int(lane.get('direct_answer_max_words',70))
            if first_answer_words(soup)>max_words: errors.append(f'{path}: direct answer exceeds {max_words} words')

        text=text_of(soup).casefold()
        health=record.get('health_adjacent') or any(x in text for x in ['adhd','therapist','therapy','burnout','brain fog','mental health','mental-health'])
        if health:
            if not any(x in text for x in ['not a diagnosis','does not diagnose','non-clinical','not treatment','does not treat','educational and organizational']): errors.append(f'{path}: health-adjacent boundary missing')
            if not any(x in text for x in ['professional','clinician','qualified','medical','mental-health','therapist']): errors.append(f'{path}: professional-help condition missing')
            for phrase in HEALTH.get('prohibited_claim_patterns',[]):
                if phrase in text: errors.append(f'{path}: prohibited health claim: {phrase}')
    return errors,main_unique_text(soup),soup

def run(records, similarity_check=True):
    all_errors=[]; texts=[]; result=[]; soups={}
    for record in records:
        errs,txt,soup=inspect(record)
        result.append({'path':record.get('path'),'accepted':not errs,'errors':errs})
        all_errors.extend(errs)
        if soup is not None: soups[record.get('path')]=soup
        if not errs and txt: texts.append((record.get('path'),txt,record))

    if similarity_check:
        for i,(pa,ta,ra) in enumerate(texts):
            for pb,tb,rb in texts[i+1:]:
                score=similarity(ta,tb)
                if score>0.72:
                    add_pair_error(all_errors,result,(pa,pb),f'{pa} vs {pb}: main-content similarity {score:.3f} exceeds 0.72')
                if ra.get('generation_lane')=='entity_use_case' and rb.get('generation_lane')=='entity_use_case':
                    aa=remove_terms(ta,str(ra.get('entity') or ''),str(ra.get('use_case') or ''))
                    bb=remove_terms(tb,str(rb.get('entity') or ''),str(rb.get('use_case') or ''))
                    limit=float(AXES.get('entity_use_case',{}).get('entity_substitution_similarity_max',0.65))
                    score2=similarity(aa,bb,4)
                    if score2>limit:
                        add_pair_error(all_errors,result,(pa,pb),f'{pa} vs {pb}: entity-substitution similarity {score2:.3f} exceeds {limit}')
                if ra.get('generation_lane')=='question_cluster' and rb.get('generation_lane')=='question_cluster':
                    qa=direct_answer_text(soups.get(pa)); qb=direct_answer_text(soups.get(pb))
                    limit=float(AXES.get('question_cluster',{}).get('same_answer_similarity_max',0.85))
                    score3=similarity(qa,qb,2)
                    if norm(qa)==norm(qb) or score3>limit:
                        add_pair_error(all_errors,result,(pa,pb),f'{pa} vs {pb}: question answers are equivalent ({score3:.3f}); merge as aliases or FAQ')
    return all_errors,result,soups

def query_collision_errors(records,result):
    errors=[]; owners={}; aliases={}
    candidate_paths={r.get('path') for r in records}
    for ref in REGISTRY:
        if ref.get('status')!='ADMITTED' or ref.get('path') in candidate_paths: continue
        key=norm(ref.get('primary_query'))
        if key: owners[key]=ref.get('path')
        for alias in ref.get('query_aliases') or []:
            a=norm(alias)
            if a: aliases[a]=ref.get('path')
    local={}
    for record in records:
        path=record.get('path'); query=norm(record.get('primary_query'))
        if not query: continue
        owner=owners.get(query) or aliases.get(query) or local.get(query)
        if owner and owner!=path:
            msg=f'{path}: primary query collides with {owner}'
            errors.append(msg); add_pair_error([],result,(path,),msg)
        local[query]=path
        for alias in record.get('query_aliases') or []:
            key=norm(alias); owner=owners.get(key) or aliases.get(key) or local.get(key)
            if owner and owner!=path:
                msg=f'{path}: query alias {alias} collides with {owner}'
                errors.append(msg); add_pair_error([],result,(path,),msg)
            local[key]=path
    return errors

def compare_with_references(records,result,soups):
    errors=[]; candidate_paths={r.get('path') for r in records}
    references=[]
    for ref in REGISTRY:
        if ref.get('status')!='ADMITTED' or ref.get('admission_level')!='full' or ref.get('path') in candidate_paths: continue
        fp=ROOT/ref.get('path','')
        if not fp.exists(): continue
        soup=BeautifulSoup(fp.read_text(encoding='utf-8'),'html.parser')
        txt=main_unique_text(soup)
        if txt: references.append((ref,txt,soup))
    for item in result:
        if not item['accepted']: continue
        record=next((x for x in records if x.get('path')==item['path']),None)
        soup=soups.get(item['path'])
        if not record or soup is None: continue
        text=main_unique_text(soup)
        for ref,reftext,refsoup in references:
            score=similarity(text,reftext)
            if score>0.72:
                msg=f'{item["path"]} vs admitted {ref.get("path")}: main-content similarity {score:.3f} exceeds 0.72'
                item['accepted']=False; item['errors'].append(msg); errors.append(msg); break
            if record.get('generation_lane')=='question_cluster' and ref.get('generation_lane')=='question_cluster':
                qa=direct_answer_text(soup); qb=direct_answer_text(refsoup)
                limit=float(AXES.get('question_cluster',{}).get('same_answer_similarity_max',0.85))
                score2=similarity(qa,qb,2)
                if norm(qa)==norm(qb) or score2>limit:
                    msg=f'{item["path"]} vs admitted {ref.get("path")}: question answers are equivalent ({score2:.3f}); merge as aliases or FAQ'
                    item['accepted']=False; item['errors'].append(msg); errors.append(msg); break
            if record.get('generation_lane')=='entity_use_case' and ref.get('generation_lane')=='entity_use_case':
                a=remove_terms(text,str(record.get('entity') or ''),str(record.get('use_case') or ''))
                b=remove_terms(reftext,str(ref.get('entity') or ''),str(ref.get('use_case') or ''))
                limit=float(AXES.get('entity_use_case',{}).get('entity_substitution_similarity_max',0.65))
                score3=similarity(a,b,4)
                if score3>limit:
                    msg=f'{item["path"]} vs admitted {ref.get("path")}: entity-substitution similarity {score3:.3f} exceeds {limit}'
                    item['accepted']=False; item['errors'].append(msg); errors.append(msg); break
    return errors

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--candidate-only',action='store_true')
    ap.add_argument('--json-output')
    ap.add_argument('--no-fail-quality',action='store_true')
    args=ap.parse_args()
    if args.candidate_only:
        manifest=json.loads((ROOT/'data/content/programmatic_candidate_manifest.json').read_text(encoding='utf-8'))
        records=manifest.get('candidates',[])
    else:
        records=[x for x in REGISTRY if x.get('status')=='ADMITTED' and x.get('admission_level')=='full']
    errors,result,soups=run(records,similarity_check=True)
    if args.candidate_only and records:
        extra=query_collision_errors(records,result); errors.extend(extra)
        extra=compare_with_references(records,result,soups); errors.extend(extra)
    payload={'status':'PASS' if not errors else 'FAIL','pages':len(records),'accepted':sum(1 for x in result if x['accepted']),'rejected':sum(1 for x in result if not x['accepted']),'results':result}
    if args.json_output: Path(args.json_output).write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    if errors and not args.no_fail_quality:
        print('[validate:programmatic-admission] FAIL')
        for e in errors[:300]: print(' -',e)
        raise SystemExit(1)
    if errors and args.no_fail_quality:
        print(f'[validate:programmatic-admission] QUARANTINE: {payload["accepted"]}/{payload["pages"]} pages admitted; {payload["rejected"]} rejected; quality rejections were quarantined without failing the governed workflow')
    else:
        print(f'[validate:programmatic-admission] PASS: {payload["accepted"]}/{payload["pages"]} pages admitted; {payload["rejected"]} rejected')

if __name__=='__main__': main()
