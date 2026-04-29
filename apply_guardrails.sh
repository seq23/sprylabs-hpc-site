#!/usr/bin/env bash
set -e

mkdir -p scripts/validators contracts

# validator: no patch artifacts
cat > scripts/validators/validate_no_patch_artifacts.js <<'JS'
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
JS

chmod +x scripts/validators/validate_no_patch_artifacts.js

# add npm script safely
node <<'NODE'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
pkg.scripts ||= {};
pkg.scripts["validate:repo-hygiene"] = "node scripts/validators/validate_no_patch_artifacts.js";
pkg.scripts["guardrails:all"] = "npm run validate:repo-hygiene && npm run full:loop";
fs.writeFileSync("package.json", JSON.stringify(pkg,null,2));
NODE

echo "DONE"
