import fs from 'node:fs';
import {readJson,fail,pass,writeSummary} from './common.mjs';
const pages=readJson('data/citation/citable_pages.json').pages.filter(x=>x.status==='ACTIVE');
const queries=readJson('data/citation/query_registry.json').queries;
const llms=fs.readFileSync('llms.txt','utf8'); const answers=JSON.parse(fs.readFileSync('answers.json','utf8'));
const maps={spry:fs.readFileSync('sitemap.xml','utf8'),bhpc:fs.existsSync('sitemap-bhpc.xml')?fs.readFileSync('sitemap-bhpc.xml','utf8'):''};
const errors=[];
for(const p of pages){
 if(!llms.includes(p.canonical_url)) errors.push(`llms.txt missing ${p.canonical_url}`);
 const sm=p.canonical_domain.includes('spryexecutiveos')?maps.spry:maps.bhpc;
 if(!sm.includes(p.canonical_url)) errors.push(`sitemap missing ${p.canonical_url}`);
}
const answerText=JSON.stringify(answers).replace(/\\"/g,'\"');
for(const q of queries) if(!llms.includes(q.query)||!answerText.includes(q.query)) errors.push(`query surface parity missing: ${q.query}`);
writeSummary('validate-distribution',{status:errors.length?'FAIL':'PASS',pages:pages.length,queries:queries.length,errors});
if(errors.length) fail(`[validate:distribution] FAIL: ${errors.length} issue(s)`,errors.slice(0,200));
pass(`[validate:distribution] OK: llms, answers, queries, and sitemaps are aligned`);
