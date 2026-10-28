#!/usr/bin/env node
/**
 * The receipt for a deploy of the aplayermode.com Worker (workers/aplayermode-com),
 * written by .github/workflows/deploy-aplayermode-worker.yml after `wrangler deploy`.
 *
 * Rule 0: that lane may not exit 0 having done nothing. The receipt names the commit
 * that was deployed, so an undeployed Worker shows up as a missing or stale receipt
 * instead of as a live site nobody compared to the repository - which is exactly how
 * the About page and the real 404 sat on main unreachable for a day (Search Readiness
 * a5, a9, b1, c2; 25-26 Oct 2026).
 *
 *   DEPLOYED_COMMIT=<sha> DEPLOY_RUN_ID=<id> node scripts/distribution/write_aplayermode_deploy_receipt.mjs
 *
 * A committed script rather than an inline `node -e`, so the step's env names have a
 * traceable reader (validate:workflow-step-env-contract).
 */
import fs from 'node:fs';
import path from 'node:path';

export const RECEIPT = 'artifacts/validation/aplayermode-worker-deploy.json';

export function receipt(env, now = new Date()) {
  const commit = String(env.DEPLOYED_COMMIT || '').trim();
  const runId = String(env.DEPLOY_RUN_ID || '').trim();
  if (!commit) throw new Error('DEPLOYED_COMMIT is required: a receipt that cannot name the deployed commit proves nothing');
  if (!runId) throw new Error('DEPLOY_RUN_ID is required: a receipt that cannot name its run proves nothing');
  return {
    schema_version: '1.0',
    repo: 'seq23/sprylabs-hpc-site',
    lane: 'aplayermode-worker-deploy',
    worker: 'aplayermode-com',
    host: 'https://aplayermode.com',
    commit,
    run_id: runId,
    deployed_at: now.toISOString(),
    status: 'DEPLOYED',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Read explicitly, not from the ambient environment: the function stays pure and
  // injectable, and the step's env names have a reader the workflow step-env
  // contract can trace (validate:workflow-step-env-contract).
  const payload = receipt({
    DEPLOYED_COMMIT: process.env.DEPLOYED_COMMIT,
    DEPLOY_RUN_ID: process.env.DEPLOY_RUN_ID,
  });
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[aplayermode-worker-deploy] ${RECEIPT}`);
  console.log(JSON.stringify(payload, null, 2));
}
