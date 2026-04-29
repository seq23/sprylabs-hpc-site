const fs = require("fs");

const reportPath = "reports/signal_floor_report.json";

if (!fs.existsSync(reportPath)) {
  throw new Error("signal floor report missing. run validate_signal_floor first.");
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

if (!report.publish_allowed) {
  throw new Error(
    `PUBLISH BLOCKED: insufficient signal (queries=${report.counts.raw_queries}, clusters=${report.counts.clusters}, backlog=${report.counts.backlog_items})`
  );
}

console.log("PUBLISH SIGNAL GATE PASS");
