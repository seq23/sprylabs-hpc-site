// The one place that says which files under an agent run folder are RAW
// EVIDENCE and which are DERIVED OUTPUT.
//
// The rebaseline tool, validate:ownership and
// validate:derived-absorber-reproducibility all read it, so the two halves of
// the split cannot drift apart into "two components each keeping their own list
// with no link" - the failure mode where one half quietly stops covering
// anything and the control plane still reports full protection.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, posixJoin, NORMALIZED_ROOT, runKey, safeScope} from '../agent_intake/bhpc_agent_common.mjs';

export const MANIFEST_FILENAME = 'agent_run_manifest.json';
export const DERIVED_REPRODUCIBLE_GUARD = 'npm run validate:derived-absorber-reproducibility';

// Everything the external agent dropped in the run folder EXCEPT the manifest.
// Defined by exclusion on purpose: a new artifact type an agent starts sending
// is raw evidence the moment it lands, and is protected without anyone
// remembering to add an extension to a list.
export function rawArtifactRels(entry) {
  const abs = path.join(ROOT, entry.dirRel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(name => name !== MANIFEST_FILENAME)
    .filter(name => fs.statSync(path.join(abs, name)).isFile())
    .sort()
    .map(name => posixJoin(entry.dirRel, name));
}

export function normalizedRelFor(entry) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || 'bhpc');
  return `${NORMALIZED_ROOT}/${runKey(entry.runDate, scope)}.json`;
}
