import fs from 'node:fs';
import {writeSummary,fail,pass} from './common.mjs';
const requireBrowser=process.argv.includes('--require-browser');
const nodeMajor=Number(process.versions.node.split('.')[0]);
const nodeOk=nodeMajor>=24;
let executable=null;
let present=false;
let playwrightPackagePresent=false;
let playwrightError=null;
try {
  const mod = await import('@playwright/test');
  playwrightPackagePresent = true;
  executable = mod.chromium?.executablePath?.() || null;
  present = Boolean(executable && fs.existsSync(executable));
} catch (error) {
  playwrightError = error?.code || error?.message || String(error);
}
const payload={browser_binary_present:present,browser_executable:executable||null,playwright_package_present:playwrightPackagePresent,playwright_error:playwrightError,node_version:process.versions.node,node_24_or_newer:nodeOk,selected_profile:process.env.RELEASE_EXECUTION_ENV==='local'?'local':'container',require_browser:requireBrowser};
writeSummary('environment-doctor',{status:(!requireBrowser||present)&&nodeOk?'PASS':'FAIL',...payload});
if(!nodeOk) fail(`[environment-doctor] FAIL: Node 24 or newer is required; found ${process.versions.node}`);
if(requireBrowser&&!playwrightPackagePresent) fail('[environment-doctor] FAIL: @playwright/test is not installed. Run: npm ci');
if(requireBrowser&&!present) fail('[environment-doctor] FAIL: Playwright Chromium is not installed. Run: npx playwright install chromium');
pass(`[environment-doctor] OK: Node ${process.versions.node}; browser ${present?'available':'not required for this profile'}`);
