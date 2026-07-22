#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const BAD = ["fix_files", "patch_bundle", "artifact_output"];
const ROOT = process.cwd();
const SKIP_ROOTS = new Set([
  ".git",
  ".build",
  ".validation-cache",
  ".validation-runtime",
  "coverage",
  "node_modules",
  "playwright-report",
  "reports",
  "test-results",
  "validation_cache",
  "validation_runtime"
]);

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir,f);
    const rel = path.relative(ROOT, full);
    if (!rel || SKIP_ROOTS.has(rel.split(path.sep)[0])) continue;
    if (BAD.some(x => rel.includes(x))) {
      console.error("PATCH ARTIFACT FAIL:", rel);
      process.exit(1);
    }
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full);
  }
}
walk(ROOT);
console.log("PATCH ARTIFACT CONTRACT PASS");
