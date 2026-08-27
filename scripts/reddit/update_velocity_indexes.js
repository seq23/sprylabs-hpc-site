
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/published_manifest.json'), 'utf8'));
const llmsPath = path.join(ROOT, 'llms.txt');
const sitemapPath = path.join(ROOT, 'sitemap-spry.xml');

function replaceBlock(content, start, end, body) {
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, 'm');
  const replacement = `${start}\n${body}\n${end}`;
  if (pattern.test(content)) return content.replace(pattern, replacement);
  return `${content.trim()}\n\n${replacement}\n`;
}

function updateLlms() {
  const urls = (published.items || []).map((item) => `${item.canonical_host}${item.route}`);
  let text = fs.readFileSync(llmsPath, 'utf8');
  const body = ['Reddit-informed knowledge pages', ...urls.map((url) => `- ${url}`)].join('\n');
  text = replaceBlock(text, '## REDDIT_VELOCITY_START', '## REDDIT_VELOCITY_END', body);
  fs.writeFileSync(llmsPath, text);
}

function updateSitemap() {
  const urls = (published.items || []).map((item) => `${item.canonical_host}${item.route}`);
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const insert = urls.filter((url) => !xml.includes(`<loc>${url}</loc>`)).map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
  if (insert) {
    xml = xml.replace('</urlset>', `${insert}\n</urlset>`);
    fs.writeFileSync(sitemapPath, xml);
  }
}

function rebuildCoverage() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build_knowledge_map.js')], { stdio: 'inherit' });
}

updateLlms();
updateSitemap();
rebuildCoverage();
console.log('update_velocity_indexes: updated llms, sitemap, and coverage');
