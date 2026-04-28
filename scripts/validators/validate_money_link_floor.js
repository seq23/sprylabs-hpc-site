const fs = require("fs");
const path = require("path");

const MONEY_URL = "https://aplayermode.com";

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
let failures = [];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");

  if (!html.includes(MONEY_URL)) {
    failures.push(file);
  }
}

if (failures.length) {
  throw new Error(`MONEY LINK FLOOR FAILED: ${failures.length} pages missing ${MONEY_URL}`);
}

console.log(`MONEY LINK FLOOR PASS: ${files.length} pages checked`);
