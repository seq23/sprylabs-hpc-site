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

const downloadTitle = 'Billionaire High Performance Coach — Download the AI Executive OS';
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${downloadTitle}</title>`);
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

const helpfulSection = `<section class="card preserved-download-paths" data-download-preserved-paths="true">
<h2>Helpful paths before you decide.</h2>
<p>Use these pages if you want more context before downloading the system.</p>
<ul>
<li><a href="/guides/billionaire-high-performance-coach.html">Billionaire High Performance Coach overview</a></li>
<li><a href="/guides/how-tracks-work.html">How tracks work</a></li>
<li><a href="/guides/what-is-this-system.html">What this system is</a></li>
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
