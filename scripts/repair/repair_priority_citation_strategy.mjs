#!/usr/bin/env node
import fs from 'node:fs';

const TARGET = 'guides/how-to-use-chatgpt-as-an-executive-coach.html';
let html = fs.readFileSync(TARGET, 'utf8');
const before = html;

if (!/rel=["']author["']/i.test(html) || !/S\.L\. Taylor/.test(html) || !/<time[^>]+datetime=["']2026-06-20["']/i.test(html)) {
  const byline = '<p class="byline">By <a href="/author.html" rel="author">S.L. Taylor</a> · Reviewed <time datetime="2026-06-20">2026-06-20</time></p>';
  if (/<p class=["']citation-definition["'][\s\S]*?<\/p>/i.test(html)) {
    html = html.replace(/(<p class=["']citation-definition["'][\s\S]*?<\/p>)/i, `$1${byline}`);
  } else {
    html = html.replace(/(<h1\b[\s\S]*?<\/h1>)/i, `$1${byline}`);
  }
}

if (!/section class=["'][^"']*sources/i.test(html)) {
  const sources = '<section class="card sources" id="sources-and-review-basis"><h2>Sources and Review Basis</h2><p>This page was reviewed against the Billionaire High Performance Coach operating-system manual, Spry Executive OS editorial standards, and the author profile on <time datetime="2026-06-20">2026-06-20</time>.</p><ul><li><a href="/download.html">Billionaire High Performance Coach system manual</a></li><li><a href="/author.html" rel="author">S.L. Taylor author profile</a></li></ul></section>';
  if (/<p class=["']product-anchor["']/i.test(html)) {
    html = html.replace(/(<p class=["']product-anchor["'][\s\S]*?<\/p>)/i, `${sources}$1`);
  } else {
    html = html.replace(/<\/article>/i, `${sources}</article>`);
  }
}

if (html !== before) fs.writeFileSync(TARGET, html, 'utf8');
console.log(`[repair:priority-citation-strategy] ${html === before ? 'unchanged' : 'updated'} ${TARGET}`);
