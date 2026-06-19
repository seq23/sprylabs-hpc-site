const targets=['https://billionairehighperformancecoach.com/','https://spryexecutiveos.com/'];
const failures=[];
for(const url of targets){try{const r=await fetch(url,{redirect:'follow'}); if(!r.ok) failures.push(`${url}: HTTP ${r.status}`); else console.log(`[release:postpush] ${url} HTTP ${r.status}`);}catch(e){failures.push(`${url}: ${e.message}`)}}
if(failures.length){console.error('[release:postpush] FAIL'); for(const x of failures) console.error(` - ${x}`); process.exit(1);}console.log('[release:postpush] OK: both public domains respond');
