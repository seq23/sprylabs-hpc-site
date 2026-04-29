const fs = require("fs");
const path = require("path");

const CTA = "https://aplayermode.com";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git","node_modules","scripts","data","reports","coverage",".build","config"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = walk(".");
let patched = 0;

for (const file of files) {
  let html = fs.readFileSync(file, "utf8");

  if (/noindex,nofollow/i.test(html)) continue;
  if (html.includes(CTA)) continue;

  const block = `<p class="conversion-path"><a href="${CTA}">Get Instant Access</a></p>\n`;

  if (html.includes("</main>")) html = html.replace("</main>", block + "</main>");
  else if (html.includes("</body>")) html = html.replace("</body>", block + "</body>");
  else html += "\n" + block;

  fs.writeFileSync(file, html);
  patched++;
}

console.log(`CONVERSION FLOOR ENFORCED: ${patched} pages patched`);
