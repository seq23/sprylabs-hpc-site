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

// A row lifted straight out of the internal citation audit rather than written
// for a reader. Both shapes that reached live pages are matched.
const AUDIT_ROW = /\|\|\s*See page content\s*\|\||edit instruction:\s*[^|]*\|\s*gap:/i;

// A list item that instructs whoever builds the page, not whoever reads it.
const BUILD_TASK = /\b(?:translate|add|include|define|turn) the (?:recommendation|recommended change|requested|named concept|query)\b|source instruction|visible page copy|repeatable operating method|extractable comparison/i;

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// The page's own published definition sentence, decoded so it can be re-escaped
// by whatever reuses it rather than double-escaped.
function citationDefinitionOf(html = '') {
  const m = String(html).match(/<p[^>]*class="[^"]*citation-definition[^"]*"[^>]*>\s*(?:<strong>)?([\s\S]*?)(?:<\/strong>)?\s*<\/p>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

// Strip a trailing layout instruction from a heading transcribed off an audit
// row, keeping the subject it names.
function cleanBriefHeading(value = '') {
  return String(value)
    .replace(/\s+with\s+(?:numbered\s+)?h[1-6]s?\b[\s\S]*$/i, '')
    .replace(/\s+each\s+with\s+[\d–-]+\s*(?:to\s*\d+\s*)?sentences?\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let instructionRemoved = 0, placeholderRemoved = 0, headingsFixed = 0, filesChanged = 0;
let definitionCalloutsFixed = 0, auditBlocksRemoved = 0, auditRowsRemoved = 0;
let directiveBlocksCleaned = 0, auditTablesRebuilt = 0;

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

  // 4. definition_callout published as an instruction to the operator:
  //    "This page must clearly define and own the named concept in the query:
  //    <query>." Under the heading "Core definition" that reads, to a visitor
  //    and to anything quoting the page, as the page conceding it has not
  //    defined its subject. 42 live pages carried it. The generator now lifts
  //    the page's own p.citation-definition instead
  //    (scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs); this
  //    repairs the copies already published, because a page is only re-rendered
  //    when it is in the current implementation plan.
  html = html.replace(
    /<(div|aside)\b[^>]*data-bhpc-agent-block="definition_callout"[^>]*>[\s\S]*?<\/\1>/gi,
    (m) => {
      if (!/This page must clearly define and own the named concept/i.test(m)) return m;
      const definition = citationDefinitionOf(html);
      definitionCalloutsFixed++;
      if (!definition) return '';
      return `<aside class="bhpc-agent-block" data-bhpc-agent-block="definition_callout"><h3>Core definition</h3><p>${escapeHtml(definition)}</p></aside>`;
    }
  );

  // 5. "Topic coverage" blocks whose body is the raw audit export the page was
  //    built from - pipe-delimited rows of the form
  //    "<file>||See page content||No Citation||Add structured H2 ... for LLM
  //    extraction", and "edit instruction: n/a | gap: n/a | current state: n/a".
  //    That is the audit talking about the page, published as the page.
  html = html.replace(
    /<(div|aside)\b[^>]*data-bhpc-agent-block="source_record_coverage"[^>]*>[\s\S]*?<\/\1>/gi,
    (m) => {
      if (!AUDIT_ROW.test(textOf(m))) return m;
      auditBlocksRemoved++;
      return '';
    }
  );
  // The same rows also shipped as bare list items inside otherwise real blocks.
  html = html.replace(/<li>([^<]*)<\/li>/gi, (m, inner) => {
    if (!AUDIT_ROW.test(inner)) return m;
    auditRowsRemoved++;
    return '';
  });

  // 6. Section headings that describe the page's construction brief instead of
  //    its subject: "The 3-Part Email System with H3s for Filter Batch and
  //    Triage each with 2-3 sentence definitions".
  //    The same brief also reaches readers as an entry in the "Related reader
  //    questions" list, which is built from the same required_heading values.
  html = html.replace(/(<h[23][^>]*>)([^<]*)(<\/h[23]>)/gi, (m, open, inner, close) => {
    const cleaned = cleanBriefHeading(inner);
    if (cleaned === inner.trim() || !cleaned) return m;
    headingsFixed++;
    return `${open}${cleaned}${close}`;
  });
  html = html.replace(
    /<aside\b[^>]*data-bhpc-agent-heading-variants="true"[^>]*>[\s\S]*?<\/aside>/gi,
    (block) => block.replace(/<li>([^<]*)<\/li>/gi, (m, inner) => {
      const cleaned = cleanBriefHeading(inner);
      if (cleaned === inner.trim() || !cleaned) return m;
      headingsFixed++;
      return `<li>${cleaned}</li>`;
    })
  );

  // 7. Published agent_directive blocks carrying build tasks, a sentence about
  //    the block's own construction, or a table row that is the raw
  //    source_fix_instruction relabelled "Recommended addition". The generator
  //    no longer emits any of the three; these are the copies already live.
  html = html.replace(
    /<div\b[^>]*data-bhpc-agent-block="agent_directive"[^>]*>[\s\S]*?<\/div>/gi,
    (block) => {
      let out = block
        .replace(/<p>(?:This section implements|Use this section as)[^<]*<\/p>/gi, '')
        .replace(/<table><thead><tr><th>Reader decision<\/th>[\s\S]*?<\/table>/gi, '');
      out = out.replace(/<ul>((?:\s*<li>[^<]*<\/li>\s*)+)<\/ul>/gi, (m, items) =>
        BUILD_TASK.test(textOf(items)) ? '' : m
      );
      if (out === block) return block;
      directiveBlocksCleaned++;
      return out;
    }
  );

  // 8. The legacy "Comparison matrix" table, whose column headers and cells are
  //    the audit talking about the page ("What the page must clarify",
  //    "Implementation evidence", "The fix is rendered as semantic content, not
  //    only metadata") with the recommended-fix cell holding an audit row. The
  //    generator's current comparison_table is the reader-facing "Decision
  //    comparison"; rebuild to that rather than deleting the block, so the page
  //    keeps the comparison its contract requires. The named problem is carried
  //    over from the table's own first data cell - it is the page's query, and
  //    is already visible copy.
  html = html.replace(
    /<div\b[^>]*data-bhpc-agent-block="comparison_table"[^>]*>[\s\S]*?<\/div>/gi,
    (block) => {
      if (!/What the page must clarify|rendered as semantic content/i.test(block)) return block;
      const named = block.match(/<td>Named problem<\/td>\s*<td>([\s\S]*?)<\/td>/i);
      const problem = named ? textOf(named[1]) : '';
      if (!problem) return block;
      auditTablesRebuilt++;
      return `<div class="bhpc-agent-block" data-bhpc-agent-block="comparison_table"><h3>Decision comparison</h3><table><thead><tr><th>Decision criterion</th><th>Spry / BHPC approach</th><th>Alternative approach</th></tr></thead><tbody><tr><td>Primary need</td><td>${escapeHtml(problem)}</td><td>Confirm whether another option solves the same need or only one part of it.</td></tr><tr><td>Operating method</td><td>Use a repeatable framework, explicit constraints, and a next physical action.</td><td>May rely on reminders, content, a single-purpose tool, or human guidance.</td></tr><tr><td>Control</td><td>The user retains authority and can inspect the rules.</td><td>Control and transparency vary by product or provider.</td></tr><tr><td>Cost</td><td>Verify current terms on the official purchase page.</td><td>Verify current published pricing and inclusions directly with the provider.</td></tr></tbody></table></div>`;
    }
  );

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

console.log(`[repair:published-agent-blocks] files=${filesChanged} instruction_paragraphs_removed=${instructionRemoved} placeholder_blocks_removed=${placeholderRemoved} headings_fixed=${headingsFixed} definition_callouts_fixed=${definitionCalloutsFixed} audit_blocks_removed=${auditBlocksRemoved} audit_rows_removed=${auditRowsRemoved} directive_blocks_cleaned=${directiveBlocksCleaned} audit_tables_rebuilt=${auditTablesRebuilt} (${APPLY ? 'APPLIED' : 'dry run'})`);
