import path from 'node:path';

export const FINDING_CLASSES = Object.freeze({
  SAFE_NOISE: 'SAFE_NOISE',
  WARNING: 'WARNING',
  SELF_HEALABLE: 'SELF_HEALABLE',
  ITEM_SKIP: 'ITEM_SKIP',
  TRUE_BLOCKER: 'TRUE_BLOCKER',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const TRANSIENT_ROOTS = new Set([
  '.validation-cache',
  '.validation-runtime',
  '.cache',
  '.tmp',
  'node_modules',
  'playwright-report',
  'test-results',
  'coverage',
]);

export function normalizeRepoPath(value = '') {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isTransientRuntimePath(value = '') {
  const normalized = normalizeRepoPath(value);
  const root = normalized.split('/')[0];
  return TRANSIENT_ROOTS.has(root);
}

export function classifyFinding(finding = {}) {
  const kind = String(finding.kind || '').toLowerCase();
  const file = normalizeRepoPath(finding.file || finding.path || '');

  if (finding.internalError || kind === 'internal_error') return FINDING_CLASSES.INTERNAL_ERROR;
  if (isTransientRuntimePath(file)) return FINDING_CLASSES.SAFE_NOISE;
  if (finding.repairable === true) return FINDING_CLASSES.SELF_HEALABLE;
  if (finding.itemScoped === true && finding.safeToExclude !== false) return FINDING_CLASSES.ITEM_SKIP;
  if (finding.optional === true || finding.material === false) return FINDING_CLASSES.WARNING;

  const blockerKinds = new Set([
    'secret_exposure',
    'protected_lane_mutation',
    'canonical_corruption',
    'fabricated_evidence',
    'required_output_missing',
    'workflow_failed',
    'validation_failed',
    'provenance_loss',
    'unsafe_provider_mutation',
  ]);
  if (blockerKinds.has(kind)) return FINDING_CLASSES.TRUE_BLOCKER;

  return finding.defaultClass || FINDING_CLASSES.WARNING;
}

export function makeFinding(input = {}) {
  const finding = {
    id: input.id || null,
    kind: input.kind || 'unspecified',
    message: String(input.message || ''),
    file: input.file ? normalizeRepoPath(input.file) : null,
    material: input.material ?? null,
    repairable: input.repairable === true,
    item_scoped: input.itemScoped === true,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
  };
  finding.classification = classifyFinding({...input, file: finding.file});
  return finding;
}

export function summarizeFindings(findings = []) {
  const counts = Object.fromEntries(Object.values(FINDING_CLASSES).map(key => [key, 0]));
  for (const finding of findings) {
    const classification = finding.classification || classifyFinding(finding);
    counts[classification] = (counts[classification] || 0) + 1;
  }
  return {
    counts,
    blocking_count: counts.TRUE_BLOCKER + counts.INTERNAL_ERROR,
    warning_count: counts.WARNING,
    safe_noise_count: counts.SAFE_NOISE,
    self_healable_count: counts.SELF_HEALABLE,
    item_skip_count: counts.ITEM_SKIP,
  };
}

export function shouldBlock(findings = []) {
  const {counts} = summarizeFindings(findings);
  return counts.TRUE_BLOCKER > 0 || counts.INTERNAL_ERROR > 0;
}

export function findingStatus(findings = []) {
  const summary = summarizeFindings(findings);
  if (summary.counts.INTERNAL_ERROR > 0) return 'INTERNAL_ERROR';
  if (summary.counts.TRUE_BLOCKER > 0) return 'FAIL';
  if (summary.counts.WARNING > 0 || summary.counts.SELF_HEALABLE > 0 || summary.counts.ITEM_SKIP > 0) return 'PASS_WITH_WARNING';
  return 'PASS';
}

export function runGovernanceFindingSelfTest() {
  const fixtures = [
    {name: 'runtime certificate is noise', finding: {kind: 'secret_exposure', file: '.validation-runtime/venv/cacert.pem'}, expected: FINDING_CLASSES.SAFE_NOISE},
    {name: 'cache mutation is noise', finding: {kind: 'unexpected_output', file: '.validation-cache/objects/a.json'}, expected: FINDING_CLASSES.SAFE_NOISE},
    {name: 'optional metadata warns', finding: {kind: 'metadata_gap', optional: true}, expected: FINDING_CLASSES.WARNING},
    {name: 'known repair is self-healable', finding: {kind: 'derived_manifest_drift', repairable: true}, expected: FINDING_CLASSES.SELF_HEALABLE},
    {name: 'bad optional item can skip', finding: {kind: 'unsupported_claim', itemScoped: true, safeToExclude: true}, expected: FINDING_CLASSES.ITEM_SKIP},
    {name: 'private key in source blocks', finding: {kind: 'secret_exposure', file: 'config/private.key'}, expected: FINDING_CLASSES.TRUE_BLOCKER},
    {name: 'protected mutation blocks', finding: {kind: 'protected_lane_mutation', file: 'data/agent/raw/run.json'}, expected: FINDING_CLASSES.TRUE_BLOCKER},
    {name: 'missing required output blocks', finding: {kind: 'required_output_missing', file: 'public/sitemap.xml'}, expected: FINDING_CLASSES.TRUE_BLOCKER},
  ];
  const failures = fixtures.filter(fixture => classifyFinding(fixture.finding) !== fixture.expected);
  return {fixtures: fixtures.length, failures};
}
