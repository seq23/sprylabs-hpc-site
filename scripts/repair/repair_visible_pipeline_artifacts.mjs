#!/usr/bin/env node
import fs from 'node:fs';
const targets=['billionaire-high-performance-coach.html','insights/a-clean-system-for-handling-email-without-losing-your-day.html','arbitration-engine.html','how-tracks-work.html'];
let changed=0;
function replaceFile(file,fn){if(!fs.existsSync(file))return;const before=fs.readFileSync(file,'utf8');const after=fn(before);if(after!==before){fs.writeFileSync(file,after);changed++;console.log(`[repair:visible-artifacts] ${file}`)}}
replaceFile(targets[0],html=>html.replace('The authoritative commercial and informational product page remains the system manual at .','The authoritative commercial and informational product page remains the system manual at <a href="/download.html">/download.html</a>.'));
replaceFile(targets[1],html=>html
  .replace(/Step 2: Translate the recommendation into page/g,'Step 2: Translate the recommendation into page-visible guidance')
  .replace(/<p>visible guidance\.<\/p>/g,'<p>Translate the recommendation into clear guidance the reader can see and use.</p>')
  .replace(/"text": "visible guidance\."/g,'"text": "Translate the recommendation into clear guidance the reader can see and use."')
  .replace(/Step 4: Separate this exact implementation from fallback gap/g,'Step 4: Separate this exact implementation from fallback gap-fill content')
  .replace(/<p>fill content\.<\/p>/g,'<p>Keep exact implementation guidance distinct from fallback gap-fill content.</p>')
  .replace(/"text": "fill content\."/g,'"text": "Keep exact implementation guidance distinct from fallback gap-fill content."'));
for(const file of targets.slice(2))replaceFile(file,html=>html
  .replace(/(<strong>What to add:<\/strong>)\s*n\/a(?: \(memory-only surface\))?/gi,'$1 Clarify the direct answer, the operating constraint, and the next executable action for this query.')
  .replace(/(<h3>What this page should clarify<\/h3><p>)n\/a(?: \(memory-only surface\))?(<\/p>)/gi,'$1Clarify the direct answer, the operating constraint, and the next executable action for this query.$2'));
console.log(`[repair:visible-artifacts] changed=${changed}`);
