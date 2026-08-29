const fs = require("fs");
const path = require("path");

const contractPath = "config/conversion_contract.json";
if (!fs.existsSync(contractPath)) {
  throw new Error(`missing conversion contract: ${contractPath}`);
}

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

const required = [
  "primary_public_endpoint",
  "canonical_product_page",
  "approved_conversion_endpoints",
  "entity_chain",
  "rules"
];

for (const key of required) {
  if (!(key in contract)) throw new Error(`conversion contract missing key: ${key}`);
}

if (contract.primary_public_endpoint !== "https://aplayermode.com") {
  throw new Error("primary public conversion endpoint must be https://aplayermode.com");
}

if (!contract.approved_conversion_endpoints.includes("https://aplayermode.com")) {
  throw new Error("approved conversion endpoints must include https://aplayermode.com");
}

const requiredChain = [
  "S.L. Taylor",
  "Spry Labs",
  "Billionaire High Performance Coach",
  "aplayermode.com"
];

for (const item of requiredChain) {
  if (!contract.entity_chain.includes(item)) {
    throw new Error(`conversion entity chain missing: ${item}`);
  }
}

const forbiddenTerms = [
  "llm bait",
  "LLM bait",
  "LLM Bait",
  "bait"
];

const scanFiles = [
  "package.json",
  "README.md",
  "config/conversion_contract.json",
  "scripts/validate_all.sh"
];

for (const file of scanFiles) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const term of forbiddenTerms) {
    if (text.includes(term)) {
      throw new Error(`forbidden internal slang found in ${file}: ${term}`);
    }
  }
}

const htmlFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".git")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(full);
  }
}
walk(".");

// This is an existence check, not a per-page check: it asks whether the public
// conversion endpoint is reachable from the site at all. It used to end with
// "CONVERSION CONTRACT PASS: N html files scanned", which reads as N pages
// enforced when the assertion is a single global OR satisfied by any one file
// anywhere in the tree. Per-page CTA coverage is validate_cta_presence's job;
// this one now says what it actually measured.
if (htmlFiles.length === 0) {
  throw new Error("conversion contract scanned zero HTML files; a scan that inspects nothing must not pass");
}
const referencing = htmlFiles.filter((file) => fs.readFileSync(file, "utf8").includes("https://aplayermode.com"));

if (referencing.length === 0) {
  throw new Error("no HTML page references https://aplayermode.com");
}

console.log(`CONVERSION CONTRACT PASS: the public endpoint https://aplayermode.com is referenced by ${referencing.length} of ${htmlFiles.length} scanned html file(s) (existence check; per-page CTA coverage is validate_cta_presence)`);
