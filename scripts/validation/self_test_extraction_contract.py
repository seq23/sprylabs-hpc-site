#!/usr/bin/env python3
from pathlib import Path
import sys, json
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'citation'))
from bs4 import BeautifulSoup
from extraction_contract import validate_extraction,schema_parity
cases=[
('valid-howto','<section data-named-framework="X"><h3>Step 1: A</h3><p>do a thing well</p><h3>Step 2: B</h3><p>do another thing</p><h3>Step 3: C</h3><p>finish the work</p></section>','howto',True),
('criteria-mislabeled-howto','<section><h2>Key Criteria</h2><ul><li>first item</li><li>second item</li><li>third item</li></ul></section>','howto',False),
('steps-outside-block','<section><h2>Direct answer</h2><p>no steps inside</p></section>','howto',False),
('valid-faq','<section><h3>What is this?</h3><p>This is an answer.</p><h3>How does it work?</h3><p>It works carefully.</p></section>','faq',True),
('valid-comparison','<section><table><tr><th>Option</th><th>Use</th></tr><tr><td>A</td><td>B</td></tr></table></section>','comparison',True),
('valid-definition','<section><p>This framework is a structured method that explains a decision with enough qualifying context for practical use.</p></section>','definition',True),
('valid-criteria','<section><h2>Decision Criteria</h2><ul><li>first meaningful item</li><li>second meaningful item</li><li>third meaningful item</li></ul></section>','criteria',True),
('valid-list','<section><ul><li>first meaningful item</li><li>second meaningful item</li><li>third meaningful item</li></ul></section>','list',True),
('valid-answer','<section><p>This direct answer contains more than twenty useful words and gives enough context for a reader to understand the intended result without guessing.</p></section>','answer',True),
('valid-framework','<section data-named-framework="Three Part Model"><h3>Part A</h3><h3>Part B</h3><h3>Part C</h3></section>','framework',True),
('valid-decision','<section><h2>When to use</h2><ul><li>choose this option</li><li>use another option</li><li>record decision evidence</li></ul></section>','decision',True),
]
errors=[]
for name,html,etype,expected in cases:
 b=BeautifulSoup(html,'html.parser').find('section');actual=validate_extraction(name,b,etype)[0]
 if actual!=expected:errors.append(f'{name}: expected {expected}, got {actual}')
# explicit schema mismatch fixture
html='<html><body><section data-llm-answer="true" data-extraction-type="howto"><h3>Step 1: A</h3><p>a</p><h3>Step 2: B</h3><p>b</p><h3>Step 3: C</h3><p>c</p></section><script id="CITATION_PAGE_SCHEMA" type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"HowTo","step":[{"@type":"HowToStep"}]}]}</script></body></html>'
s=BeautifulSoup(html,'html.parser');ok,_,d=validate_extraction('schema-mismatch',s.select_one('section'),'howto');schema_ok,_,_=schema_parity(s,'howto',d,'HowTo')
if not ok or schema_ok:errors.append('schema-mismatch: expected extraction pass and schema parity fail')
# missing HowTo schema must fail even when the visible HowTo extraction is valid
html='<html><body><section data-llm-answer="true" data-extraction-type="howto"><h3>Step 1: A</h3><p>a</p><h3>Step 2: B</h3><p>b</p><h3>Step 3: C</h3><p>c</p></section><script id="CITATION_PAGE_SCHEMA" type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"}]}</script></body></html>'
s=BeautifulSoup(html,'html.parser');ok,_,d=validate_extraction('missing-howto-schema',s.select_one('section'),'howto');schema_ok,_,_=schema_parity(s,'howto',d,'HowTo')
if not ok or schema_ok:errors.append('missing-howto-schema: expected extraction pass and missing HowTo schema parity fail')
# comparison extraction remains independently valid but must fail schema parity when its declared schema type is absent
html='<html><body><section data-llm-answer="true" data-extraction-type="comparison"><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></section><script id="CITATION_PAGE_SCHEMA" type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"}]}</script></body></html>'
s=BeautifulSoup(html,'html.parser');ok,_,d=validate_extraction('missing-comparison-schema',s.select_one('section'),'comparison');schema_ok,_,_=schema_parity(s,'comparison',d,'DefinedTerm')
if not ok or schema_ok:errors.append('missing-comparison-schema: expected extraction pass and missing DefinedTerm schema parity fail')
# synchronized criteria reclassification fixture validates as criteria
b=BeautifulSoup('<section data-named-framework="X"><h2>Decision Criteria</h2><ul><li>one useful item</li><li>two useful item</li><li>three useful item</li></ul></section>','html.parser').section
if not validate_extraction('reclass',b,'criteria')[0]:errors.append('reclassification fixture should pass as criteria')
if errors:
 print('[validate:extraction-contract:self-test] FAIL');[print(' -',e) for e in errors];raise SystemExit(1)
print(f'[validate:extraction-contract:self-test] PASS: {len(cases)+4} fixtures')
