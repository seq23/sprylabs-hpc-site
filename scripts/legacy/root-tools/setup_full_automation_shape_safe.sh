#!/usr/bin/env bash
set -euo pipefail

echo "=== PREFLIGHT: repo shape ==="

test -f package.json
test -f scripts/execution/run_full_execution.js
test -f scripts/validators/validate_query_coverage.js
test -f data/intake/query_clusters.json
test -f data/intake/build_backlog.json
test -f scripts/validate_all.sh

node - <<'NODE'
const fs = require("fs");

function read(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }

const clustersRaw = read("data/intake/query_clusters.json");
const backlogRaw = read("data/intake/build_backlog.json");
const pkg = read("package.json");

const clusters = Array.isArray(clustersRaw) ? clustersRaw : clustersRaw.clusters || clustersRaw.items || [];
const backlog = backlogRaw.items || [];

if (!clusters.length) throw new Error("No query clusters found");
if (!backlog.length) throw new Error("No backlog items found");
if (!pkg.scripts["execution:strict"]) throw new Error("Missing npm script: execution:strict");

const useCases = new Set(clusters.map(c => c.use_case || c.cluster_id).filter(Boolean));
const backlogUseCases = new Set(backlog.map(i => i.meta?.use_case || i.cluster_id).filter(Boolean));

console.log(`clusters=${clusters.length}`);
console.log(`universe_use_cases=${useCases.size}`);
console.log(`backlog_items=${backlog.length}`);
console.log(`backlog_use_cases=${backlogUseCases.size}`);

if (useCases.size < 20) throw new Error("Unexpectedly low use_case count");
if (backlogUseCases.size < 20) throw new Error("Unexpectedly low backlog use_case coverage");

console.log("shape preflight OK");
NODE

echo "=== A: install use_case-based query coverage validator ==="

cat > scripts/validators/validate_query_coverage.js <<'JS'
#!/usr/bin/env node
const fs = require("fs");

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`missing required file: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const clustersRaw = read("data/intake/query_clusters.json");
const backlogRaw = read("data/intake/build_backlog.json");

const clusters = Array.isArray(clustersRaw)
  ? clustersRaw
  : Array.isArray(clustersRaw.clusters)
    ? clustersRaw.clusters
    : Array.isArray(clustersRaw.items)
      ? clustersRaw.items
      : [];

const backlog = backlogRaw.items || [];

const universeUseCases = new Set(
  clusters.map(c => c.use_case || c.cluster_id).filter(Boolean)
);

const backlogUseCases = new Set(
  backlog.map(i => i.meta?.use_case || i.cluster_id).filter(Boolean)
);

const uncovered = [...universeUseCases].filter(uc => !backlogUseCases.has(uc));

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/query_coverage_gaps.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  coverage_model: "use_case_canonical_page_coverage",
  universe_use_cases: universeUseCases.size,
  covered_use_cases: backlogUseCases.size,
  uncovered_count: uncovered.length,
  uncovered_use_cases: uncovered
}, null, 2));

if (process.env.QUERY_COVERAGE_STRICT === "1" && uncovered.length) {
  throw new Error(`QUERY COVERAGE FAIL: ${uncovered.length} use_cases uncovered. See reports/query_coverage_gaps.json`);
}

console.log(`QUERY COVERAGE PASS: ${backlogUseCases.size}/${universeUseCases.size} use_cases covered`);
JS

chmod +x scripts/validators/validate_query_coverage.js

echo "=== B: lock strict coverage into validate_all ==="

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/validate_all.sh")
s = p.read_text()

s = s.replace(
    "node scripts/validators/validate_query_coverage.js",
    "QUERY_COVERAGE_STRICT=1 node scripts/validators/validate_query_coverage.js"
)

p.write_text(s)
print("validate_all strict coverage locked")
PY

echo "=== C: install GitHub Actions workflows ==="

mkdir -p .github/workflows

cat > .github/workflows/validate.yml <<'YAML'
name: Validate

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run validate:all
YAML

cat > .github/workflows/execution-strict.yml <<'YAML'
name: Execution Strict

on:
  schedule:
    - cron: '0 14 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  execution:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run execution:strict

      - name: Remove noisy generated artifacts before commit
        run: |
          git restore .build coverage reports || true

      - name: Commit execution outputs if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          if [[ -n "$(git status --porcelain)" ]]; then
            git add -A
            git commit -m "auto: strict execution refresh"
            git push
          else
            echo "No execution changes to commit"
          fi
YAML

echo "=== VALIDATE LOCAL ==="
npm run validate:all

echo "=== DONE ==="
git status --short
