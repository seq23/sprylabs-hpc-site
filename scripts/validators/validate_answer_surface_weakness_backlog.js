const fs = require("fs");

const file = "data/answer_surface/weakness_backlog.json";

if (!fs.existsSync(file)) {
  throw new Error(`missing answer surface weakness backlog: ${file}`);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const items = data.items || [];

if (!items.length) {
  throw new Error("ANSWER SURFACE WEAKNESS BACKLOG FAIL: no weakness backlog items");
}

for (const item of items) {
  if (!item.cluster_id) throw new Error(`weakness backlog item missing cluster_id: ${item.id}`);
  if (!item.priority) throw new Error(`weakness backlog item missing priority: ${item.id}`);
  if (!Array.isArray(item.recommended_actions) || item.recommended_actions.length < 3) {
    throw new Error(`weakness backlog item missing recommended actions: ${item.id}`);
  }
}

console.log(`ANSWER SURFACE WEAKNESS BACKLOG PASS: ${items.length} items`);
