const fs = require("fs");
const path = require("path");
const contractPath = path.join(process.cwd(), "data/contracts/priority_llm_surface_contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
function runChecks(checks, bucket) {
  const failures = [];
  for (const check of checks) {
    if (!fs.existsSync(check.path)) {
      failures.push(`Missing file: ${check.path}`);
      continue;
    }
    const html = fs.readFileSync(check.path, "utf8");
    for (const needle of check.mustInclude || []) {
      if (!html.includes(needle)) failures.push(`${check.path} missing: ${needle}`);
    }
  }
  if (failures.length) {
    console.log(`PRIORITY LLM SURFACE ${bucket}`);
    for (const failure of failures) console.log(` - ${failure}`);
  }
  return failures;
}
const hardFailures = runChecks(contract.hard_fail || [], "FAIL");
const warnings = runChecks(contract.warning_only || [], "WARN");
if (hardFailures.length) {
  process.exit(1);
}
console.log(`PRIORITY LLM SURFACE PASS: ${(contract.hard_fail || []).length} hard checks passed`);
if (warnings.length) {
  console.log(`PRIORITY LLM SURFACE WARNINGS: ${warnings.length}`);
}
