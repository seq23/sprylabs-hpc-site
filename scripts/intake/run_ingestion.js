const { execSync } = require("child_process");

console.log("RUNNING SOURCE INGESTION...");

execSync("node scripts/intake/adapters/reddit.js", { stdio: "inherit" });
execSync("node scripts/intake/adapters/serp.js", { stdio: "inherit" });

console.log("INGESTION COMPLETE");
