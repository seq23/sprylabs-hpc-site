#!/usr/bin/env node
import fs from 'node:fs';
const checks=[
 ['billionaire-high-performance-coach.html',/system manual at\s*\./i,'dangling system-manual destination'],
 ['insights/a-clean-system-for-handling-email-without-losing-your-day.html',/Translate the recommendation into page<\/h3>\s*<p>visible guidance\.|"name": "Step 2: Translate the recommendation into page"[^}]+"text": "visible guidance\."|guidance-visible guidance|content-fill content/i,'torn or repeated page-visible guidance sentence'],
 ['arbitration-engine.html',/<strong>What to add:<\/strong>\s*n\/a|<h3>What this page should clarify<\/h3><p>n\/a/i,'visible n/a agent recommendation'],
 ['how-tracks-work.html',/<strong>What to add:<\/strong>\s*n\/a|<h3>What this page should clarify<\/h3><p>n\/a/i,'visible n/a agent recommendation']
];
const errors=[];for(const [file,re,label] of checks){if(!fs.existsSync(file)){errors.push(`missing ${file}`);continue}const html=fs.readFileSync(file,'utf8');if(re.test(html))errors.push(`${file}: ${label}`)}
if(errors.length){console.error('[validate:visible-content-artifacts] FAIL');for(const e of errors)console.error(`- ${e}`);process.exit(1)}console.log('[validate:visible-content-artifacts] PASS');
