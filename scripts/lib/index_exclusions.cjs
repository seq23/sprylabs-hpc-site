'use strict';
/**
 * The ONE list of top-level directories kept out of the shared sites' generated
 * indexes (config/index_exclusions.json). Node readers import this; the Python
 * generators read the same JSON file directly.
 */
const fs = require('fs');
const path = require('path');

const CONFIG = 'config/index_exclusions.json';

function excludedDirs(root = process.cwd()) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, CONFIG), 'utf8'));
  const dirs = Object.keys(cfg.dirs || {});
  if (dirs.length === 0) throw new Error(`${CONFIG} lists no directories`);
  return new Set(dirs);
}

/** True when a repo-relative path sits under an excluded top-level directory. */
function isExcludedPath(rel, dirs = excludedDirs()) {
  const top = String(rel).replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0];
  return dirs.has(top);
}

module.exports = { CONFIG, excludedDirs, isExcludedPath };
