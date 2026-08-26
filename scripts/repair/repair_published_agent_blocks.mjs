#!/usr/bin/env node
/**
 * Repair agent blocks that were published with internal build language or with
 * a placeholder body.
 *
 * Three defects reached live pages:
 *
 *   1. "<strong>What to add:</strong> n/a" - a build instruction addressed to
 *      the pipeline, rendered for readers, with no value in it. 65 pages.
 *   2. Blocks whose entire body is "n/a". 50 recommendation_summary blocks.
 *      An answer engine extracting that page can quote "n/a".
 *   3. Headings phrased as instructions to the pipeline rather than as
 *      something a reader would read: "What this page should clarify",
 *      "Direct answer target".
 *
 * Placeholder blocks are removed rather than refilled. The existing repair
 * substituted a generic sentence ("Clarify the direct answer, the operating
 * constraint...") which is the same internal register in different words, and
 * is not a summary of anything. Removing leaves the page shorter and honest;
 * the retrofit pass then derives a real summary from the page's own content.
 *
 * Idempotent. Usage: node scripts/repair/repair_published_agent_blocks.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();
const SKIP = /(^|\/)(node_modules|\.git|dist|\.pages-output|artifacts|coverage)(\/|$)/;

const PLACEHOLDER = /^(n\/a|na|none|tbd|todo|-|—)?\s*(\(memory-only surface\))?$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (SKIP.test(full.replace(ROOT, ''))) continue;
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const textOf = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

let instructionRemoved = 0, placeholderRemoved = 0, headingsFixed = 0, filesChanged = 0;

for (const file of walk(ROOT)) {
  const before = fs.readFileSync(file, 'utf8');
  let html = before;

  // 1. Internal build instruction addressed to the pipeline, not the reader.
  //    Two markup forms shipped: a paragraph, and a container whose own class
  //    name says what it is.
  html = html.replace(/<p><strong>What to add:<\/strong>[\s\S]*?<\/p>/gi, () => { instructionRemoved++; return ''; });
  html = html.replace(/<div class="bhpc-agent-instruction">[\s\S]*?<\/div>/gi, () => { instructionRemoved++; return ''; });

  // 2. Blocks whose body carries nothing. Removed, not refilled.
  html = html.replace(/<(div|aside)\b[^>]*data-bhpc-agent-block="[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, inner) => {
    const body = inner.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i, '');
    if (!PLACEHOLDER.test(textOf(body))) return m;
    placeholderRemoved++;
    return '';
  });

  // 3. Headings written as instructions to the pipeline.
  html = html.replace(/(<h[23][^>]*>)\s*What this page should clarify\s*(<\/h[23]>)/gi, (m, a, b) => { headingsFixed++; return `${a}What this page recommends${b}`; });
  html = html.replace(/(<h[23][^>]*>)\s*Direct answer target\s*(<\/h[23]>)/gi, (m, a, b) => { headingsFixed++; return `${a}Direct answer${b}`; });
  // The same phrases are echoed as labels in the page's own criteria lists, so
  // renaming only the heading would leave the instruction wording on the page.
  html = html.replace(/What this page should clarify/g, () => { headingsFixed++; return 'What this page recommends'; });
  html = html.replace(/Direct answer target/g, () => { headingsFixed++; return 'Direct answer'; });

  // Surviving recommendation_summary blocks are tagged so the retrofit pass
  // recognises them as present and does not add a second one.
  html = html.replace(/<(div|aside)\b((?:(?!>)[\s\S])*?)data-bhpc-agent-block="recommendation_summary"((?:(?!>)[\s\S])*?)>/gi, (m, tag, pre, post) => {
    if (/recommendation-summary/.test(m)) return m;
    const attrs = `${pre}data-bhpc-agent-block="recommendation_summary" data-content-block="recommendation_summary"${post}`;
    const withClass = /class="/.test(attrs)
      ? attrs.replace(/class="([^"]*)"/, 'class="$1 recommendation-summary"')
      : `${attrs} class="recommendation-summary"`;
    return `<${tag}${withClass}>`;
  });

  if (html !== before) {
    filesChanged++;
    if (APPLY) fs.writeFileSync(file, html);
  }
}

console.log(`[repair:published-agent-blocks] files=${filesChanged} instruction_paragraphs_removed=${instructionRemoved} placeholder_blocks_removed=${placeholderRemoved} headings_fixed=${headingsFixed} (${APPLY ? 'APPLIED' : 'dry run'})`);
