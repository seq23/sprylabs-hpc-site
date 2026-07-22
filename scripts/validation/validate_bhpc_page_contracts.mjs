import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const index = read('index.html');
const download = read('download.html');
const css = read('assets/styles.css');
const homeContract = JSON.parse(read('data/page_contracts/bhpc_homepage_contract.json'));
const downloadContract = JSON.parse(read('data/page_contracts/bhpc_download_contract.json'));

function requireText(label, text, needle) {
  if (!text.includes(needle)) errors.push(`${label}: missing required text: ${needle}`);
}
function requireRegex(label, text, regex, msg) {
  if (!regex.test(text)) errors.push(`${label}: ${msg}`);
}
function requireOrder(label, text, before, after) {
  const a = text.indexOf(before);
  const b = text.indexOf(after);
  if (a === -1 || b === -1 || a >= b) errors.push(`${label}: expected "${before}" before "${after}"`);
}
function textCount(text, needle) {
  return (text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
}

function parseCitationSchema(label, text) {
  const match = text.match(/<script id=["']CITATION_PAGE_SCHEMA["'] type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  if (!match) {
    errors.push(`${label}: CITATION_PAGE_SCHEMA missing`);
    return [];
  }
  try {
    const data = JSON.parse(match[1]);
    return Array.isArray(data['@graph']) ? data['@graph'] : [];
  } catch (error) {
    errors.push(`${label}: invalid CITATION_PAGE_SCHEMA JSON: ${error.message}`);
    return [];
  }
}
function schemaNode(graph, type) {
  return graph.find((node) => node && node['@type'] === type);
}
function requireSchemaNode(label, graph, type) {
  const node = schemaNode(graph, type);
  if (!node) errors.push(`${label}: missing ${type} in CITATION_PAGE_SCHEMA`);
  return node;
}
function assertQuietIngestionSchema(label, graph) {
  const page = requireSchemaNode(label, graph, 'WebPage');
  const product = requireSchemaNode(label, graph, 'Product');
  requireSchemaNode(label, graph, 'BreadcrumbList');
  if (page) {
    if (!page.isPartOf) errors.push(`${label}: WebPage schema missing isPartOf relationship`);
    if (!page.about) errors.push(`${label}: WebPage schema missing about relationship`);
    if (!Array.isArray(page.mentions) || page.mentions.length < 4) errors.push(`${label}: WebPage schema must mention core AEO/GEO concepts`);
  }
  if (product) {
    if (!Array.isArray(product.additionalProperty) || product.additionalProperty.length < 4) errors.push(`${label}: Product schema missing enriched additionalProperty metadata`);
    const blob = JSON.stringify(product).toLowerCase();
    if (/aggregaterating|ratingvalue|ratingcount|reviewcount|reviewrating/.test(blob)) errors.push(`${label}: Product schema must not contain fake ratings or reviews`);
    if (!product.potentialAction || product.potentialAction['@type'] !== 'BuyAction') errors.push(`${label}: Product schema missing BuyAction target`);
  }
}

for (const t of homeContract.must_include) requireText('homepage', index, t);
for (const t of downloadContract.must_include) requireText('download', download, t);

const homeSchema = parseCitationSchema('homepage', index);
const downloadSchema = parseCitationSchema('download', download);
assertQuietIngestionSchema('homepage', homeSchema);
assertQuietIngestionSchema('download', downloadSchema);
requireSchemaNode('homepage', homeSchema, 'FAQPage');
requireSchemaNode('download', downloadSchema, 'FAQPage');
requireText('homepage quiet breadcrumb', index, 'class="breadcrumb ingestion-breadcrumb"');
requireText('download quiet breadcrumb', download, 'class="breadcrumb ingestion-breadcrumb"');
requireText('download FAQ schema source', download, 'data-visible-faq="true"');

// Homepage nav hierarchy: A-player mode is allowed, but not before buyer/product links.
const navMatch = index.match(/<nav[^>]*class="nav-links premium-nav"[\s\S]*?<\/nav>/);
const primaryNav = navMatch ? navMatch[0] : index;
requireOrder('homepage primary nav', primaryNav, 'What it is', 'A-player mode');
requireOrder('homepage primary nav', primaryNav, 'Cost of elite coaching', 'A-player mode');

// Product hierarchy.
requireText('homepage', index, 'Billionaire High Performance Coach is the product. A-player mode is the operating state.');
requireText('download', download, 'Billionaire High Performance Coach OS is the product. A-player mode is the operating state it helps you practice');

// Cognitive load is a hard contract on both human buyer pages.
if (textCount(index, 'cognitive load') < 1) errors.push('homepage: must include explicit cognitive load language');
if (textCount(download, 'cognitive load') < 3) errors.push('download: must include explicit cognitive load language in top and detail sections');
requireRegex('download', download, /planning, sequencing, strategic triage, and next-step selection/i, 'must define cognitive-load reduction as planning/sequencing/strategic triage/next-step selection');

// Download page must keep top preview and manual preview before long-form detail.
requireOrder('download structure', download, 'id="top-preview"', 'id="manual-preview"');
requireOrder('download structure', download, 'id="manual-preview"', '09 · Full product detail');
requireOrder('download structure', download, 'What you actually get.', 'Everything else you may want to inspect before buying');

// Download hero and image hierarchy must stay sane.
if (download.includes('Billionaire High Performance Coach OS: Key Criteria')) errors.push('download: generated Key Criteria block must not render in hero');
requireRegex('download hero anti-injection', download, /<section class="apm-hero"(?![^>]*data-extraction-type)/, 'download hero must not carry citation auto-injection attributes');
if (textCount(download, 'class="download-hero-product-image') !== 1) errors.push('download: must have exactly one hero product image');
requireText('download large system image', download, 'id="system-preview-image"');
requireText('download large system image', download, 'download-system-image--large');
requireOrder('download image hierarchy', download, 'class="download-hero-product-image', 'id="system-preview-image"');
requireRegex('download hero alignment CSS', css, /body\[data-page-key="download"\] \.apm-hero\{[\s\S]*grid-template-columns:minmax\(0,1\.05fr\) minmax\(340px,\.85fr\)!important;/, 'missing left-copy/right-image desktop hero grid');
requireRegex('top bars overflow CSS', css, /BHPC visual repair 2026-06-21[\s\S]*premium-header__shell[\s\S]*display:flex!important;[\s\S]*flex-wrap:nowrap!important;/, 'missing header overflow repair');

// Do not gut restored /download long form.
if (/Citation strategy|road to 100K LLM surfacings|public citation surfaces/i.test(download)) errors.push('download: visible citation strategy section must stay off /download');

for (const keep of [
  'You Don’t Have a Knowledge Problem.',
  'LLMs Give Advice.',
  'Situations This Handles Automatically',
  'Built-In Execution Guardrails',
  'The Flagship Stack',
  'Manual Preview',
  'Buyer questions',
  'Helpful paths before you decide.',
  'Legal Disclaimer'
]) requireText('download preserved content', download, keep);

// Homepage library and answer surface must remain.
for (const keep of ['/continuity-collapse-pattern/', '/ai-execution-atlas/', '/insights/', '/answers/', '/comparisons/', '/guides/faq.html']) requireText('homepage research library', index, keep);
requireText('homepage lower answer surface', index, 'Frequently asked questions for humans and LLMs');

// Sticky CTA must be right-side rail/card on desktop/tablet, not only centered long bar.
requireRegex('homepage sticky CTA CSS', css, /body\[data-page-key="home"\]\s+\.sticky-cta\{[^}]*right:24px!important;[^}]*left:auto!important;[^}]*width:340px!important;/s, 'missing right-side homepage sticky CTA rail override');
requireRegex('download sticky CTA CSS', css, /body\[data-page-key="download"\]\s+\.apm-side-cta\{[^}]*right:24px!important;[^}]*left:auto!important;[^}]*width:330px!important;/s, 'missing right-side download sticky CTA rail override');
requireText('download sticky CTA markup', download, 'class="sticky-cta apm-sticky-buy apm-side-cta"');

// Contrast guard: legacy white text rules are allowed only because the later patch must exist and win for cream sections.
requireText('download contrast patch', css, 'APlayer download contrast and purchase-page sanity patch');
requireText('download visual repair CSS', css, 'BHPC visual repair 2026-06-21');
requireRegex('download contrast patch', css, /download-section:not\(\.apm-mode-definition\):not\(\.apm-value-stack\)[\s\S]*color:var\(--ink\) !important;/, 'missing ink override for cream/light download sections');
requireRegex('download dark-only text', css, /\.apm-mode-definition,\s*\nbody\[data-page-key="download"\] \.apm-value-stack\{\s*\n\s*background:linear-gradient\(135deg,#111111,#241311\);/s, 'dark sections must be explicitly dark before light text is allowed');

// Page contracts must exist and carry the guardrail language.
requireText('contract doc', read('docs/page-contracts/BHPC_HOME_DOWNLOAD_PAGE_CONTRACT.md'), 'Do not gut the current long `/download` page');
requireText('contract doc', read('docs/page-contracts/BHPC_HOME_DOWNLOAD_PAGE_CONTRACT.md'), 'Keep explicit cognitive-load language');
requireText('contract doc', read('docs/page-contracts/BHPC_HOME_DOWNLOAD_PAGE_CONTRACT.md'), 'right-side rail/card');

if (errors.length) {
  console.error('BHPC_PAGE_CONTRACT_FAIL');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log('validate_bhpc_page_contracts passed');
