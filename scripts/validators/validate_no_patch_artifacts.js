#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const BAD = ["fix_files", "patch_bundle", "artifact_output"];
const ROOT = process.cwd();

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if ([".git","node_modules"].includes(f)) continue;
    const full = path.join(dir,f);
    const rel = path.relative(ROOT, full);
    if (BAD.some(x => rel.includes(x))) {
      console.error("PATCH ARTIFACT FAIL:", rel);
      process.exit(1);
    }
    if (fs.statSync(full).isDirectory()) walk(full);
  }
}
walk(ROOT);
console.log("PATCH ARTIFACT CONTRACT PASS");
