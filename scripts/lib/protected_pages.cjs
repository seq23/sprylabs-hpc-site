'use strict';
/**
 * CommonJS reader of data/page_contracts/protected_buyer_pages.json - the one
 * list of buyer pages no generator, repair pass or retrofit may inject into.
 * (The ESM reader is scripts/lib/bhpc_agent_acceptance_parser.mjs; both read the
 * same file, neither keeps its own literal.) Refuses a list without download.html.
 */
const fs = require('fs');
const path = require('path');
const REL = 'data/page_contracts/protected_buyer_pages.json';
function protectedPages(root = process.cwd()) {
  const pages = JSON.parse(fs.readFileSync(path.join(root, REL), 'utf8')).pages;
  if (!Array.isArray(pages) || !pages.includes('download.html')) throw new Error(`${REL}: must list download.html`);
  return new Set(pages);
}
module.exports = { REL, protectedPages };
