#!/usr/bin/env bash
set -euo pipefail

echo "Fixing admin validation + conversion warnings root causes"

python3 - <<'PY'
from pathlib import Path

# 1) Patch extractability validator: skip private/noindex admin pages.
p = Path("scripts/validators/validate_extractability.js")
s = p.read_text()

if "noindex,nofollow" not in s:
    s = s.replace(
        "const s=fs.readFileSync(f,'utf8');",
        "const s=fs.readFileSync(f,'utf8'); if (/noindex,nofollow/i.test(s) || /admin\\.html$/i.test(f)) continue;"
    )

p.write_text(s)
print("patched extractability validator to skip private admin/noindex pages")


# 2) Make conversion floor enforcement robust and deterministic.
p = Path("scripts/authority/enforce_conversion_floor.js")
s = r'''const fs = require("fs");
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
'''
p.write_text(s)
print("rewrote conversion floor enforcement")


# 3) Wire conversion enforcement into validate_all BEFORE page-type floor check.
p = Path("scripts/validate_all.sh")
s = p.read_text()

needle = "node scripts/validators/validate_page_type_conversion_floor.js"
if "node scripts/authority/enforce_conversion_floor.js" not in s:
    s = s.replace(needle, "node scripts/authority/enforce_conversion_floor.js\n" + needle)

# Make warnings illegal.
s = s.replace(
    "node scripts/validators/validate_page_type_conversion_floor.js",
    "PAGE_TYPE_CONVERSION_STRICT=1 node scripts/validators/validate_page_type_conversion_floor.js"
)

p.write_text(s)
print("wired conversion enforcement + strict warnings into validate_all")
PY

node scripts/admin/build_admin_page.js
npm run validate:all

echo "Done. Status:"
git status --short
