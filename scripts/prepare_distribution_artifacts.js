#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const buildDir = path.join(root, '.build');
fs.mkdirSync(buildDir, { recursive: true });
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function parseLocs(xml) { return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim()); }
const spryUrls = parseLocs(read('sitemap-spry.xml'));
const bhpcUrls = parseLocs(read('sitemap-bhpc.xml'));
const allUrls = Array.from(new Set([...spryUrls, ...bhpcUrls]));
const highValueOrder = [
  'https://spryexecutiveos.com/',
  'https://spryexecutiveos.com/atlas.html',
  'https://spryexecutiveos.com/start-here.html',
  'https://spryexecutiveos.com/faq.html',
  'https://spryexecutiveos.com/work-with-spry.html',
  'https://billionairehighperformancecoach.com/',
  'https://billionairehighperformancecoach.com/download.html',
  'https://billionairehighperformancecoach.com/product.html',
  'https://billionairehighperformancecoach.com/faq.html',
  'https://billionairehighperformancecoach.com/what-is-this-system.html',
  'https://billionairehighperformancecoach.com/what-is-an-ai-executive-coach.html'
];
function pickByIncludes(urls, includes, limit) {
  const out = [];
  for (const token of includes) {
    for (const url of urls) {
      if (out.length >= limit) return out;
      if (!out.includes(url) && url.includes(token)) out.push(url);
    }
  }
  return out;
}

function readCitationPriorityUrls() {
  const file = path.join(root, 'data/citation_opportunities/bhpc_priority_queries.json');
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const urls = [];
    for (const item of data.items || []) {
      if (item.intended_winner_url) urls.push(item.intended_winner_url);
      if (item.answer_page) urls.push(`https://spryexecutiveos.com/${item.answer_page}`);
    }
    return Array.from(new Set(urls));
  } catch (err) {
    console.log(`distribution citation priority warning: ${err.message}`);
    return [];
  }
}

const priority = [];
for (const url of readCitationPriorityUrls()) {
  if (!priority.includes(url)) priority.push(url);
}
for (const url of highValueOrder) {
  if (allUrls.includes(url) && !priority.includes(url)) priority.push(url);
}
for (const url of pickByIncludes(spryUrls, ['/answers/', '/insights/'], 10)) if (!priority.includes(url)) priority.push(url);
for (const url of pickByIncludes(bhpcUrls, ['how-to-', 'what-is-', 'ai-', 'why-'], 12)) if (!priority.includes(url)) priority.push(url);
while (priority.length < 32) {
  const candidate = allUrls[priority.length];
  if (!candidate) break;
  if (!priority.includes(candidate)) priority.push(candidate);
}
const priorityUrls = priority.slice(0, 32);
const batchUrls = allUrls.slice().sort();
fs.writeFileSync(path.join(buildDir, 'indexnow-priority.txt'), priorityUrls.join('\n') + '\n');
fs.writeFileSync(path.join(buildDir, 'distribution-priority-urls.txt'), priorityUrls.join('\n') + '\n');
fs.writeFileSync(path.join(buildDir, 'indexnow-batch.txt'), batchUrls.join('\n') + '\n');
const manifest = {
  generated_at: new Date().toISOString(),
  counts: { spry: spryUrls.length, bhpc: bhpcUrls.length, priority: priorityUrls.length, batch: batchUrls.length },
  files: {
    priority: '.build/indexnow-priority.txt',
    distribution_priority: '.build/distribution-priority-urls.txt',
    batch: '.build/indexnow-batch.txt'
  }
};
fs.writeFileSync(path.join(buildDir, 'distribution-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const readme = [
  'Option B Lite distribution artifacts',
  '',
  `Priority URLs: ${priorityUrls.length}`,
  `Batch URLs: ${batchUrls.length}`,
  '',
  'Files:',
  '- .build/indexnow-priority.txt',
  '- .build/indexnow-batch.txt',
  '- .build/distribution-priority-urls.txt',
  '- .build/distribution-manifest.json'
].join('\n');
fs.writeFileSync(path.join(buildDir, 'distribution-readme.txt'), readme + '\n');
console.log(`distribution artifacts prepared: priority=${priorityUrls.length} batch=${batchUrls.length}`);

process.exit(0);
