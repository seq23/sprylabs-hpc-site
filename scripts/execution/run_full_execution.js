const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n>>> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  console.log("\n=== PHASE 7A-H: FULL EXECUTION SYSTEM ===\n");

  run("node scripts/intake/build_query_universe.js");
  run("node scripts/intake/collect_queries.js");
  run("node scripts/intake/cluster_queries.js");

  run("node scripts/intake/score_queries.js");
  run("node scripts/intake/build_backlog_full_coverage.js");

  run("node scripts/answer_surface/generate_observation_candidates.js");
  run("node scripts/answer_surface/score.js");
  run("node scripts/answer_surface/build_dashboard.js");
  run("node scripts/answer_surface/build_expansion_backlog.js");
  run("node scripts/answer_surface/build_weakness_backlog.js");

  run("node scripts/authority/build_authority_graph.js");
  run("node scripts/authority/compute_authority_scores.js");

  run("node scripts/authority/enforce_links.js");

  run("node scripts/build_synthesis_articles.js");
  run("node scripts/build_comparison_pages.js");
  run("node scripts/build_insights.js");

  run("node scripts/admin/apply_overrides.js");
  run("node scripts/admin/build_admin_page.js");

  run("node scripts/authority/enforce_conversion_floor.js");
  run("npm run validate:all");

  console.log("\n=== EXECUTION COMPLETE ===\n");
} catch (e) {
  console.error("\nEXECUTION FAILED\n");
  process.exit(1);
}
