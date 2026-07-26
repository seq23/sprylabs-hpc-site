const fs = require("fs");

function read(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch { return fallback; }
}

const backlog = read("data/backlog/build_backlog.json", { items: [] });
const intake = read("data/intake/query_clusters.json", []);
const coverage = read("reports/query_coverage_gaps.json", {});
const answerScore = read("data/answer_surface/score_history.json", {});
const answerWeak = read("data/answer_surface/weakness_backlog.json", {});
const redditQueue = read("data/reddit/publish_queue.json", {});
const authority = read("data/authority/internal_authority_scores.json", {});
const overrides = read("config/admin_overrides.json", { overrides: [] });

const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Admin Control Panel</title>
<style>
body{font-family:system-ui;margin:2rem}
section{margin-bottom:2rem}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:6px}
</style>
</head>
<body>

<h1>System Control Panel</h1>

<section>
<h2>System Health</h2>
<ul>
<li>Backlog items: ${backlog.items.length}</li>
<li>Clusters: ${intake.length}</li>
<li>Coverage uncovered: ${coverage.uncovered_count || 0}</li>
</ul>
</section>

<section>
<h2>Coverage</h2>
<pre>${JSON.stringify(coverage, null, 2)}</pre>
</section>

<section>
<h2>Backlog</h2>
<table>
<tr><th>ID</th><th>Cluster</th><th>Score</th></tr>
${(backlog.items||[]).map(x=>`
<tr>
<td>${x.id}</td>
<td>${x.cluster_id}</td>
<td>${x.score}</td>
</tr>`).join("")}
</table>
</section>

<section>
<h2>Answer Surface</h2>
<pre>${JSON.stringify(answerScore, null, 2)}</pre>
<pre>${JSON.stringify(answerWeak, null, 2)}</pre>
</section>

<section>
<h2>Reddit Pipeline</h2>
<pre>${JSON.stringify(redditQueue, null, 2)}</pre>
</section>

<section>
<h2>Authority Scores</h2>
<pre>${JSON.stringify(authority, null, 2)}</pre>
</section>

<section>
<h2>Overrides</h2>
<pre>${JSON.stringify(overrides, null, 2)}</pre>
</section>

</body>
</html>
`;

fs.writeFileSync("admin.html", html);
console.log("admin rebuilt");
