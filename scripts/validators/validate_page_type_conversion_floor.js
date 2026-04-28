const fs = require("fs");
const path = require("path");

const APPROVED = [
  "https://aplayermode.com",
  "https://sprylabs.gumroad.com/l/billionaire-high-performance-coach",
  "gumroad.com",
  "/download",
  "/download.html"
];

const HIGH_INTENT_PATTERNS = [
  /pricing/i,
  /review/i,
  /worth-it/i,
  /vs-/i,
  /comparison/i,
  /comparisons\//i,
  /alternative/i,
  /best-/i,
  /buy/i,
  /download/i,
  /billionaire-high-performance-coach/i,
  /ai-executive-coach/i
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "_ops", "templates", "coverage", "reports"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = walk(".");
const failures = [];
const warnings = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const hasApproved = APPROVED.some(x => html.includes(x));
  const isHighIntent = HIGH_INTENT_PATTERNS.some(re => re.test(file));

  if (!hasApproved) {
    failures.push({ file, reason: "missing approved conversion path" });
    continue;
  }

  if (isHighIntent && !html.includes("https://aplayermode.com") && !html.includes("gumroad.com")) {
    failures.push({ file, reason: "high-intent page missing direct public conversion endpoint" });
  }

  if (!isHighIntent && !html.includes("https://aplayermode.com")) {
    warnings.push({ file, reason: "educational page has conversion path but no visible aplayermode link" });
  }
}

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/page_type_conversion_floor.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  checked_pages: files.length,
  failures,
  warnings: warnings.slice(0, 200),
  warning_count: warnings.length
}, null, 2));

if (failures.length) {
  throw new Error(`PAGE TYPE CONVERSION FLOOR FAIL: ${failures.length} failures. See reports/page_type_conversion_floor.json`);
}

console.log(`PAGE TYPE CONVERSION FLOOR PASS: ${files.length} pages checked; warnings=${warnings.length}`);
