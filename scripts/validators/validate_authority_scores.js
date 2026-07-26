const fs = require("fs");

const file = "data/authority/internal_authority_scores.json";

if (!fs.existsSync(file)) {
  throw new Error(`missing authority scores file: ${file}`);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ranked = data.ranked || [];

if (!ranked.length) {
  throw new Error("AUTHORITY SCORE FAIL: no ranked pages");
}

for (const page of ranked) {
  if (!page.url) throw new Error("AUTHORITY SCORE FAIL: page missing url");
  if (typeof page.score !== "number") throw new Error(`AUTHORITY SCORE FAIL: page missing numeric score: ${page.url}`);
  if (typeof page.inbound_links !== "number") throw new Error(`AUTHORITY SCORE FAIL: page missing inbound_links: ${page.url}`);
  if (typeof page.money_links !== "number") throw new Error(`AUTHORITY SCORE FAIL: page missing money_links: ${page.url}`);
}

const zeroMoney = ranked.filter(p => p.money_links === 0).slice(0, 25);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/authority_score_report.json", JSON.stringify({
  generated_at: new Date().toISOString(),
  page_count: ranked.length,
  top_20: ranked.slice(0, 20).map(p => ({ url: p.url, score: p.score, inbound_links: p.inbound_links, money_links: p.money_links })),
  zero_money_sample: zeroMoney.map(p => p.url)
}, null, 2));

console.log(`AUTHORITY SCORE PASS: pages=${ranked.length}`);
