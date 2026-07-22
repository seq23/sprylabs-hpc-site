import fs from 'node:fs';

const MUTATING_SCRIPT_PREFIXES = [
  'build:',
  'execute:',
  'release:',
  'repair:',
  'workflow:',
  'firehose:',
  'signals:',
  'strategy:',
  'ownership:build',
  'growth-health:build',
  'schema:repair',
  'citation:self-heal',
  'self-heal:',
  'content:pipeline',
  'authority:daily',
  'reddit:daily',
  'reddit:evening',
  'social:daily'
];

const MUTATING_EXACT_SCRIPT_NAMES = new Set([
  'validation:python-runtime:bootstrap',
  'validation:python-runtime:preflight',
  'validation:python-runtime:self-test',
  'validate:citation-contract',
  'validate:priority-citation-pages',
  'validate:agent-recommendations',
  'validate:page-admission',
  'validate:rendered-schema-parity',
  'validate:programmatic-admission',
  'validate:extraction-contract-final-state',
  'validate:extraction-contract:self-test',
  'validate:extraction-surface-guard:snapshot',
  'validate:extraction-surface-guard:check',
  'validate:incremental-page-audit',
  'validate:full-page-audit',
  'validate:python-dependency-contract',
  'validate:workflow-topology:fixtures',
  'trace:extraction-pipeline'
]);

const MUTATING_AGENT_PATTERNS = [
  /^agent:[^:]+:absorb/,
  /^agent:[^:]+:apply/,
  /^agent:[^:]+:compile/,
  /^agent:[^:]+:plan/,
  /^agent:[^:]+:trace/
];

const ALLOWED_NONVALIDATION_PATTERNS = [
  /^agent:[^:]+:validate/,
  /^agent:.*self-test/,
  /^trace:.*self-test/
];

function loadScripts() {
  return JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
}

function scriptNameFromCommand(command = '') {
  const match = String(command).match(/^npm run ([^\s]+)(?:\s|$)/);
  return match ? match[1] : null;
}

function npmRunReferences(definition = '') {
  const refs = [];
  const re = /npm run ([A-Za-z0-9:_-]+)/g;
  let match;
  while ((match = re.exec(String(definition)))) refs.push(match[1]);
  return refs;
}

function isMutatingScriptName(name = '') {
  if (!name) return false;
  if (MUTATING_EXACT_SCRIPT_NAMES.has(name)) return true;
  if (ALLOWED_NONVALIDATION_PATTERNS.some((re) => re.test(name))) return false;
  if (MUTATING_AGENT_PATTERNS.some((re) => re.test(name))) return true;
  return MUTATING_SCRIPT_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix));
}

export function explainCommandPurity(command, scripts = loadScripts(), seen = new Set()) {
  const scriptName = scriptNameFromCommand(command);
  if (!scriptName) return { pure: true, reasons: [] };
  const reasons = [];
  function visit(name, chain = []) {
    if (seen.has(name)) return;
    seen.add(name);
    if (isMutatingScriptName(name)) {
      reasons.push(`${[...chain, name].join(' -> ')} is an execution/mutation command`);
      return;
    }
    const definition = scripts[name];
    if (!definition) return;
    for (const ref of npmRunReferences(definition)) visit(ref, [...chain, name]);
  }
  visit(scriptName);
  return { pure: reasons.length === 0, reasons };
}

export function profilePurityFindings(matrix, scripts = loadScripts()) {
  const findings = [];
  for (const [profileName, profile] of Object.entries(matrix.profiles || {})) {
    for (const step of profile.steps || []) {
      const command = step.command || '';
      const result = explainCommandPurity(command, scripts, new Set());
      if (!result.pure) {
        findings.push({
          profile: profileName,
          id: step.id || command,
          command,
          reasons: result.reasons
        });
      }
    }
  }
  for (const [name, definition] of Object.entries(scripts)) {
    if (!name.startsWith('validate:')) continue;
    const reasons = [];
    for (const ref of npmRunReferences(definition)) {
      if (isMutatingScriptName(ref)) reasons.push(`${name} -> ${ref} is an execution/mutation command`);
    }
    if (reasons.length) {
      findings.push({
        profile: 'package-scripts',
        id: name,
        command: definition,
        reasons
      });
    }
  }
  return findings;
}
