#!/usr/bin/env node
import fs from 'node:fs';

const file = 'download.html';

function fail(message) {
  console.error(`[repair:download-contract] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(file)) {
  fail('missing download.html');
}

let html = fs.readFileSync(file, 'utf8');

const before = html;


function cleanDownloadConversionPage(html) {
  let out = String(html || '');
  // The /download page is a protected buyer/conversion page. Agent/citation
  // repair systems may preserve machine-readable schema, but they must not
  // inject visible extraction scaffolding into the hero or append agent proof
  // blocks after the buyer page has closed.
  out = out.replace(/(<h1>Download Billionaire High Performance Coach<\/h1>)[\s\S]*?(<p class="apm-hero__lede">)/i, '$1\n$2');
  out = out.replace(/<script(?![^>]*id=["']CITATION_PAGE_SCHEMA["'])[^>]*type=["']application\/ld\+json["'][\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/(?:\r?\n[\t ]*)*<section\b[^>]*class=["'][^"']*bhpc-agent-semantic-repair[^"']*["'][\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
  out = out.replace(/(?:\r?\n[\t ]*)*<section\b[^>]*class=["'][^"']*citation-pathways[^"']*["'][\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
  out = out.replace(/(?:\r?\n[\t ]*)*<section\b[^>]*>\s*<h2>Agent Exact Citation Framework[\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
  out = out.replace(/(?:\r?\n[\t ]*)*<section\b[^>]*>\s*<h2>Discover your own A-player mode<\/h2>[\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
  out = out.replace(/<p class="apm-psych-note"><strong>You clicked to inspect the system\.<\/strong> This page shows you what it looks like, what is inside it, who it is for, and what changes once the operating rules are installed\.<\/p>/i,
    '<p class="apm-psych-note"><strong>You clicked to inspect the system.</strong> This page shows you what it looks like, what is inside it, who it is for, and what changes once the operating rules are installed.</p><p class="apm-discovery-line">Discover your own A-player mode by inspecting the operating system before you buy.</p>');
  out = out.replace(/<p class="apm-discovery-line">Discover your own A-player mode by inspecting the operating system before you buy\.<\/p>\s*<p class="apm-discovery-line">Discover your own A-player mode by inspecting the operating system before you buy\.<\/p>/gi,
    '<p class="apm-discovery-line">Discover your own A-player mode by inspecting the operating system before you buy.</p>');
  return out;
}


html = cleanDownloadConversionPage(html);

const downloadTitle = 'Billionaire High Performance Coach — Download the AI Executive OS';
const downloadDescription = 'Download Billionaire High Performance Coach OS: a self-installed executive operating system and prompt pack for structured AI planning, accountability, recovery, and review.';
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${downloadTitle}</title>`);
html = html.replace(/<meta\b[^>]*name=["']description["'][^>]*>/i, `<meta name="description" content="${downloadDescription}">`);
html = html.replace(/<meta\b[^>]*property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${downloadDescription}">`);
html = html.replace(/<meta\b[^>]*name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${downloadDescription}">`);
html = html.replace(/<meta\b[^>]*property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${downloadTitle}">`);
html = html.replace(/<meta\b[^>]*name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${downloadTitle}">`);

html = html.replace(
  /<section\b[^>]*class=["'][^"']*contract-cta[^"']*["'][\s\S]*?<\/section>/gi,
  (block) => /aplayermode\.com|A Player Mode/i.test(block) ? '' : block
);

html = html.replace(
  /<p\b[^>]*>[\s\S]*?<a\b[^>]*href=["']https:\/\/aplayermode\.com\/?["'][\s\S]*?<\/a>[\s\S]*?<\/p>/gi,
  (block) => /data-llm-answer|citation-definition/i.test(block) ? block.replace(/<a\b[^>]*href=["']https:\/\/aplayermode\.com\/?["'][\s\S]*?<\/a>/gi, '') : ''
);

html = html.replace(
  /<a\b[^>]*href=["']https:\/\/aplayermode\.com\/?["'][\s\S]*?<\/a>/gi,
  ''
);

html = html.replace(
  /<p\b([^>]*class=["'][^"']*citation-definition[^"']*["'][^>]*)><strong>([\s\S]*?)<\/strong><\/p>\s*(<div\b[^>]*data-generated-extraction-structure=["']true["'][\s\S]*?<\/ul><\/div>)/i,
  (_match, attrs, definition, structure) => {
    const sectionAttrs = attrs.replace(/\sclass=["'][^"']*citation-definition[^"']*["']/, ' class="citation-definition"');
    return `<section${sectionAttrs}><p class="citation-definition"><strong>${definition}</strong></p>${structure}</section>`;
  }
);


const helpfulSection = `<section class="card preserved-download-paths" data-download-preserved-paths="true">
<h2>Helpful paths before you decide.</h2>
<p>Use these pages if you want more context before downloading the system.</p>
<ul>
<li><a href="/billionaire-high-performance-coach.html">Billionaire High Performance Coach overview</a></li>
<li><a href="/how-tracks-work.html">How tracks work</a></li>
<li><a href="/what-is-this-system.html">What this system is</a></li>
</ul>
</section>`;

if (!html.includes('Helpful paths before you decide.')) {
  if (html.includes('</main>')) {
    html = html.replace('</main>', `${helpfulSection}\n</main>`);
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', `${helpfulSection}\n</body>`);
  } else {
    html += `\n${helpfulSection}\n`;
  }
}

if (/href=["']https:\/\/aplayermode\.com\/?["']/i.test(html)) {
  fail('circular APlayerMode CTA still present');
}

if (!html.includes('Helpful paths before you decide.')) {
  fail('required helpful paths text missing');
}

if (html !== before) {
  fs.writeFileSync(file, html);
  console.log('[repair:download-contract] updated download.html');
} else {
  console.log('[repair:download-contract] OK');
}
