const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MONEY_URL = "https://aplayermode.com";

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = walkHtml(ROOT);
let patched = 0;

for (const file of files) {
  let html = fs.readFileSync(file, "utf8");

  // Skip if already has money link
  if (html.includes(MONEY_URL)) continue;

  // Inject CTA before closing body
  if (html.includes("</body>")) {
    html = html.replace(
      "</body>",
      `<div style="margin-top:40px;padding:20px;border-top:1px solid #eee;text-align:center;">
<a href="${MONEY_URL}" style="font-weight:bold;">Get the system</a>
</div>\n</body>`
    );

    fs.writeFileSync(file, html);
    patched++;
  }
}

console.log(`LINK OPTIMIZER: patched ${patched} pages`);
