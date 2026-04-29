const fs = require("fs");
const path = require("path");

const mapPath = "data/scoring/cannibalization_map.json";
const backlogPath = "data/backlog/build_backlog.json";

if (!fs.existsSync(mapPath)) throw new Error(`missing cannibalization map: ${mapPath}`);
if (!fs.existsSync(backlogPath)) throw new Error(`missing backlog: ${backlogPath}`);

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const backlog = JSON.parse(fs.readFileSync(backlogPath, "utf8")).items || [];

if (!Array.isArray(map.intent_families) || map.intent_families.length < 5) {
  throw new Error("cannibalization map must define at least 5 intent families");
}

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const htmlFiles = walkHtml(".");
const htmlIndex = htmlFiles.map(file => {
  let text = "";
  try { text = fs.readFileSync(file, "utf8").toLowerCase(); } catch {}
  return { file, text };
});

function textForItem(item) {
  return [
    item.cluster_id,
    ...(item.queries || []),
    ...(item.target_pages || []),
    item.meta && item.meta.product_role,
    item.meta && item.meta.use_case,
    item.meta && item.meta.differentiator
  ].filter(Boolean).join(" ").toLowerCase();
}

function familyHits(text, family) {
  return family.terms.filter(t => text.includes(t.toLowerCase()));
}

function hasDifferentiator(text, family) {
  return family.allowed_differentiators.some(t => text.includes(t.toLowerCase()));
}

const collisions = [];

for (const item of backlog) {
  const text = textForItem(item);

  for (const family of map.intent_families) {
    const hits = familyHits(text, family);
    if (!hits.length) continue;

    const differentiated = hasDifferentiator(text, family);

    let existingMatches = 0;
    for (const row of htmlIndex) {
      if (family.terms.some(t => row.text.includes(t.toLowerCase()))) {
        existingMatches++;
      }
    }

    const collisionScore = Math.min(100, hits.length * 25 + Math.min(existingMatches, 5) * 10 - (differentiated ? 35 : 0));

    if (collisionScore >= map.rules.max_collision_score_for_publish && !differentiated) {
      collisions.push({
        item: item.id,
        cluster_id: item.cluster_id,
        family: family.id,
        collisionScore,
        reason: "high intent overlap without approved differentiator"
      });
    }
  }
}

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/cannibalization_report.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  checked_backlog_items: backlog.length,
  html_files_checked: htmlFiles.length,
  collisions
}, null, 2));

if (collisions.length) {
  throw new Error(`CANNIBALIZATION CONTRACT FAILED: ${collisions.length} high-risk collisions. See reports/cannibalization_report.json`);
}

console.log(`CANNIBALIZATION CONTRACT PASS: backlog=${backlog.length} html=${htmlFiles.length}`);
