# Paid Agent Publishing Architecture

The weekly BHPC AI-agent lane is canonical. Current-format runs use a dated `data/report_fixes/agent_runs/YYYY-MM-DD/bhpc/` folder containing the manifest, CSV, HTML, and JSON artifacts. Existing intake, normalization, acceptance, exact-plan, mutation, validation, and release commands remain unchanged.

Pages identified through the generated acceptance/exact-plan lineage are `paid_agent` owned. The daily `$0` lane may read their coverage and link toward them, but may not edit, refresh, replace, redirect, or compete with them.
