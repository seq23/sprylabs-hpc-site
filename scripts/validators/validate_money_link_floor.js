const fs = require("fs");
const path = require("path");

const APPROVED_ENDPOINTS = [
  'href="/download.html"',
  "https://aplayermode.com",
  "billionairehighperformancecoach.com/download",
  "gumroad.com",
  "https://gumroad.com"
];

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "_ops" || entry.name === "templates" || entry.name === "coverage") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = walkHtml(".");
const failures = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");

  const hasApprovedPath = APPROVED_ENDPOINTS.some(endpoint => html.includes(endpoint));

  if (!hasApprovedPath) {
    failures.push(file);
  }
}

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/conversion_path_report.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  checked_pages: files.length,
  approved_endpoints: APPROVED_ENDPOINTS,
  failures
}, null, 2));

if (failures.length) {
  throw new Error(`CONVERSION PATH FLOOR FAILED: ${failures.length} public pages missing approved conversion path. See reports/conversion_path_report.json`);
}

console.log(`CONVERSION PATH FLOOR PASS: ${files.length} public pages checked`);
