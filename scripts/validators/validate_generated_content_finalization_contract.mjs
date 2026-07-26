#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const pkg = read('package.json');
const contract = read('data/strategy/generated_content_finalization_contract.json');
const scripts = pkg.scripts || {};
const errors = [];
function mustScript(name, fragments) {
  const cmd = scripts[name] || '';
  if (!cmd) { errors.push(`missing_script:${name}`); return; }
  for (const fragment of fragments) if (!cmd.includes(fragment)) errors.push(`script_missing_fragment:${name}:${fragment}`);
}
mustScript('release:content-finalize', ['self-heal:generated-content','build:manual-expansion','build:aplayer-phase-expansion','agent:bhpc:apply-exact','agent:bhpc:trace-exact','validate:programmatic-admission','validate:bhpc-page-family-contract','validate:bhpc-rich-new-page-contract','validate:bhpc-no-marker-only-agent-pass','validate_claim_safety.mjs','validate_no_keyword_swap_pages.mjs']);
mustScript('release:agent-intake', ['release:content-finalize']);
mustScript('workflow:content-expansion', ['strategy:gap-fill:backlog']);
mustScript('workflow:content-authority', ['release:content-finalize']);
for (const field of ['required_finish_sequence','finish_command','forbidden_finish_states']) if (!(field in contract)) errors.push(`contract_missing:${field}`);
const report = {schema_version:'1.0', validator:'generated-content-finalization-contract', status:errors.length?'FAIL':'PASS', checked_scripts:['release:content-finalize','release:agent-intake','workflow:content-expansion','workflow:content-authority'], errors};
fs.mkdirSync(path.join(ROOT,'artifacts/validation'), {recursive:true});
fs.writeFileSync(path.join(ROOT,'artifacts/validation/generated-content-finalization-contract.json'), JSON.stringify(report,null,2)+'\n');
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log('[bhpc-generated-content-finalization-contract] PASS');
