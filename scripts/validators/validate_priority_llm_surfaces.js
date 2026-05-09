const fs = require("fs");
const checks = [
  { path: "ai-executive-coach/index.html", mustInclude: ["What is an AI executive coach?", "What it does not do:", "Best fit:"] },
  { path: "ai-coach-vs-human-coach-for-founders.html", mustInclude: ["Side-by-side comparison for founders", "<table class=\"table\">", "When AI is the better founder choice", "When human coaching is the better founder choice"] },
  { path: "continuity-collapse-pattern/index.html", mustInclude: ["What to do when continuity collapse pattern occurs", "Immediate answer:"] },
  { path: "how-to-stay-consistent/index.html", mustInclude: ["Canonical answer for founders trying to maintain follow-through"] },
  { path: "insights/README.html", mustInclude: ["Spry Executive OS Insights Index", "not a software README product"] },
  { path: "download.html", mustInclude: ["What this page is", "official bridge page"] }
];
let failures = [];
for (const check of checks) {
  if (!fs.existsSync(check.path)) {
    failures.push(`Missing file: ${check.path}`);
    continue;
  }
  const html = fs.readFileSync(check.path, "utf8");
  for (const needle of check.mustInclude) {
    if (!html.includes(needle)) failures.push(`${check.path} missing: ${needle}`);
  }
}
if (failures.length) {
  console.error("PRIORITY LLM SURFACE FAIL");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`PRIORITY LLM SURFACE PASS: ${checks.length} files checked`);
