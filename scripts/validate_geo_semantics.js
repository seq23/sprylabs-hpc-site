const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const errors = [];
const registryPath = path.join(ROOT, 'data/citation/citable_pages.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

function parseGraph(html, rel) {
  const match = html.match(/<script[^>]+id=["']CITATION_PAGE_SCHEMA["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) { errors.push(`${rel}: CITATION_PAGE_SCHEMA missing`); return []; }
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed['@graph'])) { errors.push(`${rel}: schema @graph missing`); return []; }
    return parsed['@graph'];
  } catch (error) {
    errors.push(`${rel}: invalid CITATION_PAGE_SCHEMA JSON (${error.message})`);
    return [];
  }
}

function resolveActivePage(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    const indexFile = path.join(file, 'index.html');
    if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) return indexFile;
    return null;
  }
  if (stat.isFile()) return file;
  return null;
}

for (const record of registry.pages || []) {
  if ((record.status || 'ACTIVE') !== 'ACTIVE') continue;
  const rel = record.path;
  const file = resolveActivePage(rel);
  if (!file) { errors.push(`${rel}: active page missing`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (/class=["']fanout-payload["']/i.test(html)) errors.push(`${rel}: hidden fanout payload still present`);
  if (/data-geo-semantic=["']true["']/i.test(html)) errors.push(`${rel}: obsolete blanket supplemental schema present`);
  const schemaCount = (html.match(/id=["']CITATION_PAGE_SCHEMA["']/gi) || []).length;
  if (schemaCount !== 1) errors.push(`${rel}: expected one final citation schema graph, found ${schemaCount}`);
  const graph = parseGraph(html, rel);
  const types = new Set(graph.flatMap(node => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter(Boolean));
  if (![...types].some(type => ['WebPage','Article','BlogPosting'].includes(type))) errors.push(`${rel}: primary page schema missing`);
  if (!types.has('DefinedTerm')) errors.push(`${rel}: DefinedTerm schema missing`);
  // A page whose H1 is a question and which answers it in the visible summary
  // block holds its Q&A in the page's own structure rather than in a
  // section.faq wrapper. repair_schema_parity builds FAQPage from exactly that
  // pair, so this check has to recognise the same shape - otherwise it reports
  // drift on pages whose schema is fully backed by text the reader can see.
  // The conditions below mirror that rule exactly, including the twelve-word
  // floor that treats a shorter string as a label rather than an answer.
  const faqSection = /<section[^>]+(?:class=["'][^"']*(?:faq|citation-faq)[^"']*["']|data-visible-faq=["']true["'])/i.test(html);
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const answerMatch = /class=["'][^"']*recommendation-summary__answer[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const plain = (v) => String(v || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const questionTitled = !!h1Match && !!answerMatch
    && /\?$/.test(plain(h1Match[1]))
    && plain(answerMatch[1]).split(' ').filter(Boolean).length >= 12
    && plain(answerMatch[1]).toLowerCase() !== plain(h1Match[1]).toLowerCase();
  const hasVisibleFaq = faqSection || questionTitled;
  if (hasVisibleFaq !== types.has('FAQPage')) errors.push(`${rel}: FAQPage presence does not match visible FAQ presence`);
  if (types.has('SoftwareApplication')) errors.push(`${rel}: blanket SoftwareApplication schema is not permitted on editorial pages`);
}

if (errors.length) {
  console.error('validate_geo_semantics failed:');
  for (const e of errors.slice(0, 200)) console.error(' - ' + e);
  process.exit(1);
}
console.log(`validate_geo_semantics: OK (${(registry.pages || []).filter(p => (p.status || 'ACTIVE') === 'ACTIVE').length} active pages checked)`);
