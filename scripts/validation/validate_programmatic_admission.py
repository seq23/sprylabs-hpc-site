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
# Lanes whose page is an answer to a query. They share the direct-answer length
# cap and the same-answer duplication check; only question_cluster additionally
# requires the query to be phrased as a question, because a demand-backed page's
# query is whatever a searcher actually typed.
ANSWER_LANES={'question_cluster','demand_backed'}
_DEMAND_PATH=ROOT/'data/demand/measured_demand.json'
MEASURED_QUERIES=set()
if _DEMAND_PATH.is_file():
    for _r in json.loads(_DEMAND_PATH.read_text(encoding='utf-8')).get('records',[]):
        for _q in [_r.get('query'),_r.get('query_normalized'),*(_r.get('aliases') or [])]:
            if _q: MEASURED_QUERIES.add(' '.join(re.sub(r'[^a-z0-9]+',' ',str(_q).casefold()).split()))
WORD=re.compile(r"\b[\w’'-]+\b",re.UNICODE)
SENTENCE=re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')
DATE=re.compile(r'^\d{4}-\d{2}-\d{2}$')

def words(s): return WORD.findall(s or '')
def norm(s): return ' '.join(re.sub(r'[^a-z0-9]+',' ',(s or '').casefold()).split())
def text_of(node): return node.get_text(' ',strip=True) if node else ''
def shingles(s,n=5):
    w=[x.casefold() for x in words(s)]
    return frozenset(hash(tuple(w[i:i+n])) for i in range(max(0,len(w)-n+1)))
def jaccard(sa,sb):
    # Same value as the string form below; kept separate so the O(n^2) pass can
    # shingle each page once instead of re-shingling both sides of every pair.
    # With every page passing its per-page checks the pass compares ~1.07M
    # pairs, and re-shingling made that a multi-hour step.
    if not sa or not sb: return 0.0
    inter=len(sa&sb)
    return inter/max(1,len(sa)+len(sb)-inter)
def similarity(a,b,n=5):
    return jaccard(shingles(a,n),shingles(b,n))
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

        if lane_name=='demand_backed':
            # A page in this lane exists because a query was measured. It has to
            # be able to name that measurement, and the query on the page has to
            # be the query that was measured - otherwise the lane is just a
            # cheaper question_cluster with the demand claim attached.
            evidence=record.get('demand_evidence') or {}
            if not isinstance(evidence,dict) or not evidence: errors.append(f'{path}: demand-backed page carries no demand_evidence')
            else:
                value=evidence.get('demand_value')
                if not isinstance(value,(int,float)) or value<=0: errors.append(f'{path}: demand-backed page records no positive measured demand value')
                if not evidence.get('evidence_tier'): errors.append(f'{path}: demand-backed page records no evidence tier')
                if not evidence.get('demand_basis'): errors.append(f'{path}: demand-backed page does not say which unit its demand was measured in')
                measured=norm(evidence.get('measured_query') or record.get('primary_query'))
                if MEASURED_QUERIES and measured not in MEASURED_QUERIES:
                    errors.append(f'{path}: demand-backed page claims a query that is not in data/demand/measured_demand.json')
                if norm(record.get('primary_query')) != measured:
                    errors.append(f'{path}: page query does not match the measured query it claims')

        if lane_name in ANSWER_LANES:
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
        # Precompute every shingle set once. Each of these depends only on a
        # single record, so nothing about the comparison changes.
        entity_limit=float(AXES.get('entity_use_case',{}).get('entity_substitution_similarity_max',0.65))
        answer_limit=float(AXES.get('question_cluster',{}).get('same_answer_similarity_max',0.85))
        prepared=[]
        for pa,ta,ra in texts:
            lane=ra.get('generation_lane')
            stripped=shingles(remove_terms(ta,str(ra.get('entity') or ''),str(ra.get('use_case') or '')),4) if lane=='entity_use_case' else None
            answer=direct_answer_text(soups.get(pa)) if lane in ANSWER_LANES else ''
            prepared.append((pa,ra,lane,shingles(ta),stripped,norm(answer),shingles(answer,2) if lane in ANSWER_LANES else None))
        for i,(pa,ra,lane_a,sa,stripped_a,norm_a,ans_a) in enumerate(prepared):
            for pb,rb,lane_b,sb,stripped_b,norm_b,ans_b in prepared[i+1:]:
                score=jaccard(sa,sb)
                if score>0.72:
                    add_pair_error(all_errors,result,(pa,pb),f'{pa} vs {pb}: main-content similarity {score:.3f} exceeds 0.72')
                if lane_a=='entity_use_case' and lane_b=='entity_use_case':
                    score2=jaccard(stripped_a,stripped_b)
                    if score2>entity_limit:
                        add_pair_error(all_errors,result,(pa,pb),f'{pa} vs {pb}: entity-substitution similarity {score2:.3f} exceeds {entity_limit}')
                if lane_a in ANSWER_LANES and lane_b in ANSWER_LANES:
                    score3=jaccard(ans_a,ans_b)
                    if norm_a==norm_b or score3>answer_limit:
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
    # Compare a new page against EVERY admitted page, not just the 62 marked
    # admission_level == 'full'.
    #
    # The pool used to carry the same `admission_level != 'full'` filter the
    # quality checks use, which meant a candidate was measured for duplication
    # against 62 of 2,214 admitted pages. A new page could be a near-verbatim copy
    # of any of the 2,152 others and score zero similarity, because they were never
    # loaded. The duplication gate was reading a 3% sample of its own corpus.
    #
    # Widening this cannot fail a page for its own content. References are only ever
    # compared against - they are not validated here, and no threshold is applied to
    # them - so the only new outcome is catching a duplicate that used to pass. That
    # is why this is safe to widen while the corpus selection in main() is not.
    errors=[]; candidate_paths={r.get('path') for r in records}
    references=[]
    for ref in REGISTRY:
        if ref.get('status')!='ADMITTED' or ref.get('path') in candidate_paths: continue
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
            if record.get('generation_lane') in ANSWER_LANES and ref.get('generation_lane') in ANSWER_LANES:
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
        # Every check in this run - per-page quality, query collision, and the
        # comparison against admitted references - iterates this list. An empty
        # manifest makes all of them no-ops, and the guard below is what stops a
        # candidate run reporting "0/0 pages admitted" as a pass. The cross-checks
        # at the bottom of main() are additionally gated on `records` being
        # non-empty, so an empty manifest would skip them silently.
        if not records:
            print('[validate:programmatic-admission] FAIL: data/content/programmatic_candidate_manifest.json lists no candidates; expected at least one candidate page to inspect. A candidate run that inspects nothing proves no page is admissible.')
            raise SystemExit(1)
    else:
        # The corpus run inspects records marked admission_level == 'full'. That is
        # 62 of 2,214 admitted pages, because generate_aplayer_phase_expansion.mjs
        # stamped its own output 'baseline' - the level under which every
        # substantive check in run() is skipped - so 97% of the library opted itself
        # out of the gate at the moment it was written. The generator now stamps
        # 'full' (NEW_PAGE_ADMISSION_LEVEL), so this closes going forward.
        #
        # The 2,152 already on disk are NOT silently promoted here. Holding them to
        # thresholds they were never written against would fail the build on
        # thousands of pages at once, which is a retirement and rewriting programme,
        # not a validator change. What does change is that the exclusion stops being
        # invisible: the count is printed on every run and recorded in the JSON
        # payload, so the size of the debt is in front of whoever reads the output
        # instead of buried in a list comprehension.
        records=[x for x in REGISTRY if x.get('status')=='ADMITTED' and x.get('admission_level')=='full']
        # This filter is the whole corpus the substantive checks see. If it ever
        # returns nothing - a registry that failed to load its records, or a
        # regression that stops stamping admission_level 'full' again - every
        # check below runs zero times and the run prints "0/0 pages admitted" as
        # a pass. That is the exact failure this filter already caused once.
        if not records:
            print('[validate:programmatic-admission] FAIL: data/content/page_admission_registry.json yielded no record with status ADMITTED and admission_level "full"; expected at least one page to inspect. Admitting 0 of 0 pages proves nothing.')
            raise SystemExit(1)
        admitted_total=sum(1 for x in REGISTRY if x.get('status')=='ADMITTED')
        excluded=admitted_total-len(records)
        if excluded:
            print(f'[validate:programmatic-admission] NOTE: {excluded} of {admitted_total} admitted pages carry admission_level != "full" and are not inspected by the substantive checks. They predate the gate. New pages are stamped "full" by scripts/programmatic/generate_aplayer_phase_expansion.mjs and are inspected. This is recorded quality debt, not a passing result.')
    errors,result,soups=run(records,similarity_check=True)
    if args.candidate_only and records:
        extra=query_collision_errors(records,result); errors.extend(extra)
        extra=compare_with_references(records,result,soups); errors.extend(extra)
    payload={'status':'PASS' if not errors else 'FAIL','pages':len(records),
             'admitted_total':sum(1 for x in REGISTRY if x.get('status')=='ADMITTED'),
             'not_inspected_pre_gate':sum(1 for x in REGISTRY if x.get('status')=='ADMITTED' and x.get('admission_level')!='full'),'accepted':sum(1 for x in result if x['accepted']),'rejected':sum(1 for x in result if not x['accepted']),'results':result}
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
