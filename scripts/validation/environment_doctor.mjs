import fs from 'node:fs';
import {writeSummary,fail,pass} from './common.mjs';

const requireBrowser=process.argv.includes('--require-browser');
let chromium=null;
let playwrightImportError=null;
try{
  ({chromium}=await import('@playwright/test'));
}catch(error){
  playwrightImportError=error instanceof Error?error.message:String(error);
}
const executable=chromium?.executablePath?.()||null;
const present=Boolean(executable&&fs.existsSync(executable));
const nodeMajor=Number(process.versions.node.split('.')[0]);
const nodeOk=nodeMajor>=24;
const modulePresent=Boolean(chromium);
const reasons=[];
if(!nodeOk)reasons.push(`Node 24 or newer is required; found ${process.versions.node}`);
if(requireBrowser&&!modulePresent)reasons.push('@playwright/test is not installed');
if(requireBrowser&&modulePresent&&!present)reasons.push('Playwright Chromium is not installed');
const payload={
  browser_binary_present:present,
  browser_executable:executable,
  playwright_module_present:modulePresent,
  playwright_import_error:playwrightImportError,
  node_version:process.versions.node,
  node_24_or_newer:nodeOk,
  selected_profile:process.env.RELEASE_EXECUTION_ENV==='local'?'local':'container',
  require_browser:requireBrowser,
  fallback_command:'npm run validate:browserless-mock-backup',
  reasons,
};
writeSummary('environment-doctor',{status:reasons.length?'FAIL':'PASS',...payload});
if(reasons.length)fail(`[environment-doctor] FAIL: ${reasons.join('; ')}`);
pass(`[environment-doctor] OK: Node ${process.versions.node}; browser ${present?'available':'not required for container profile'}`);
