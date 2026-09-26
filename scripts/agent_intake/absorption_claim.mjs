// THE ONE DEFINITION of "who may claim a new agent run".
//
// A READY_FOR_ABSORPTION run is claimed (absorbed: normalized, bridged, turned
// into page repairs) only by the absorber lane, Spry Content Release, which sets
// BHPC_ABSORB_READY_RUNS=1 at the top of its workflow. Everywhere else - Validate
// Repo, the pre-push profile, other lanes' convergence - a READY run is PENDING:
// inert, named, and required to be cleanly pending (nothing derived from it on
// disk yet). Before 2026-09-26 Validate Repo absorbed it while validating it and
// failed the drop commit on the pages it had just rewritten (Validate Repo
// 36245892704).
//
// Read by the absorber and by every validator that asks "must this run already
// be normalized?", so the producer and the checks cannot disagree about it.

export const CLAIM_SWITCH = 'BHPC_ABSORB_READY_RUNS';

export function claimsNewRuns(env = process.env) {
  return env[CLAIM_SWITCH] === '1';
}

export function isPendingForAbsorber(entry, env = process.env) {
  return entry?.manifest?.status === 'READY_FOR_ABSORPTION' && !claimsNewRuns(env);
}
