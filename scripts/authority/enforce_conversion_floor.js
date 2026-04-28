const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      if (["node_modules",".git","scripts","data","reports","coverage"].includes(file)) continue;
      results = results.concat(walk(full));
    } else if (full.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

const pages = walk(".");

let patched = 0;

for (const file of pages) {
  let html = fs.readFileSync(file, "utf8");

  if (!html.includes("https://aplayermode.com")) {
    html = html.replace(
      "</body>",
      `<div class="cta"><a href="https://aplayermode.com">Get Instant Access</a></div>\n</body>`
    );
    fs.writeFileSync(file, html);
    patched++;
  }
}

console.log(`CONVERSION FLOOR ENFORCED: ${patched} pages patched`);
