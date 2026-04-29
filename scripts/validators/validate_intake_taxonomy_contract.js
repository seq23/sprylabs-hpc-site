const fs = require("fs");

const files = {
  roles: "data/intake/product_role_taxonomy.json",
  audiences: "data/intake/audience_taxonomy.json",
  useCases: "data/intake/use_case_taxonomy.json"
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`missing intake taxonomy file: ${file}`);
}

const roles = JSON.parse(fs.readFileSync(files.roles, "utf8")).required_product_roles || [];
const audiences = JSON.parse(fs.readFileSync(files.audiences, "utf8")).required_audiences || [];
const useCases = JSON.parse(fs.readFileSync(files.useCases, "utf8")).required_use_cases || [];

if (roles.length < 5) throw new Error(`intake taxonomy failed: expected at least 5 product roles, found ${roles.length}`);
if (audiences.length < 14) throw new Error(`intake taxonomy failed: expected at least 14 audiences, found ${audiences.length}`);
if (useCases.length < 24) throw new Error(`intake taxonomy failed: expected at least 24 use cases, found ${useCases.length}`);

const requiredRoleIds = [
  "executive_coach",
  "assistant",
  "chief_of_staff",
  "accountability_partner",
  "behavioral_self_regulation"
];

const requiredAudienceIds = [
  "entrepreneurs",
  "founders",
  "busy_parents",
  "athletes",
  "upwardly_mobile_executives",
  "multi_project_people",
  "body_goal_users"
];

const requiredUseCaseIds = [
  "daily_planning",
  "weekly_review",
  "prioritization",
  "decision_making",
  "execution",
  "accountability",
  "habit_consistency",
  "missed_day_recovery",
  "overplanning",
  "fitness_consistency",
  "weight_loss_adherence",
  "nutrition_discipline",
  "workout_execution"
];

function assertIds(label, items, requiredIds) {
  const ids = new Set(items.map(x => x.id));
  for (const id of requiredIds) {
    if (!ids.has(id)) throw new Error(`intake taxonomy failed: missing ${label} id: ${id}`);
  }
}

assertIds("product role", roles, requiredRoleIds);
assertIds("audience", audiences, requiredAudienceIds);
assertIds("use case", useCases, requiredUseCaseIds);

for (const item of [...roles, ...audiences, ...useCases]) {
  if (!item.id || !item.label || !item.description) {
    throw new Error(`intake taxonomy failed: item missing id/label/description: ${JSON.stringify(item)}`);
  }
}

console.log(`INTAKE TAXONOMY CONTRACT PASS: roles=${roles.length} audiences=${audiences.length} use_cases=${useCases.length}`);
