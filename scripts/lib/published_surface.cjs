'use strict';
/**
 * Which top-level repository entries are NOT part of the published Pages surface.
 * The one list: scripts/assemble_pages_output.js copies everything else, and
 * validators that read "every published page" (validate_product_offers.mjs)
 * walk the same set rather than keeping their own.
 */
const EXCLUDE = new Set([
  '.pages-output', 'dist', 'node_modules', '.git', '.github', '.gitignore',
  '.nvmrc', '.build', '.validation-cache', '.validation-runtime',
  'scripts', 'data', 'reports', 'artifacts', 'docs', 'tests', 'fixtures',
  'config', 'content', 'functions', 'seo', 'LICENSES',
  // workers/ holds the aplayermode.com Worker source; it deploys on its own.
  'workers',
  // templates/ holds the raw Mustache sources the generators render FROM. They
  // are not pages, but the root deploy published them anyway, so
  // https://spryexecutiveos.com/templates/answer_page and eleven siblings
  // answered 200 on both hostnames - each one an unrendered template carrying
  // `href="{{canonical}}"`, which resolves to /templates/{{canonical}} and 404s,
  // plus hard links to every other template that kept the island crawlable.
  // Ahrefs Site Audit, 3 September 2026, reported this as the whole of the
  // Spryexecutiveos error budget: "Page has links to broken page: 3",
  // "4XX page: 2", "404 page: 2" against Errors 7.
  'templates',
  'package.json', 'package-lock.json', 'requirements-validation.txt',
  'playwright.config.mjs', 'wrangler.toml',
  'distribution.config.json', 'distribution.config.example.json',
]);
// Repo contracts and docs at the root: _repo_*.json, _validation_*.json and
// every top-level markdown file.
function excluded(name) {
  return EXCLUDE.has(name)
    || /^_(repo|validation|artifact|baseline)[-_]/.test(name)
    || name.endsWith('.md');
}

module.exports = { EXCLUDE, excluded };
