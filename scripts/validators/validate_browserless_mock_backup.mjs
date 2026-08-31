#!/usr/bin/env node
import fs from 'node:fs';
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function writeJson(p,payload){fs.mkdirSync(p.split('/').slice(0,-1).join('/')||'.',{recursive:true}); fs.writeFileSync(p,JSON.stringify(payload,null,2)+'\n');}
const fixturePath='data/mocks/browserless-route-audit-fixtures.json';
const fixture=readJson(fixturePath);
const errors=[]; const cases=[];
// An empty routes list audits no page yet still wrote a PASS artifact and a
// PASS report to reports/, so an emptied fixture would publish standing proof
// that the routes were checked when none was opened. Fail before writing.
const routes=fixture.routes||[];
if(!routes.length){console.error(`[validate:browserless-mock-backup] FAIL: ${fixturePath} lists no routes; it must name the route fixtures (id + file) this audit opens. Zero cases writes a PASS artifact proving nothing.`);process.exit(1);}
for (const route of routes) {
  if (!fs.existsSync(route.file)) { errors.push(`${route.id}: missing ${route.file}`); continue; }
  const html=fs.readFileSync(route.file,'utf8');
  const checks={has_title:/<title>[^<]{8,}<\/title>/i.test(html),has_meta_description:/<meta\s+name=["']description["']/i.test(html),no_raw_json_dump:!/[{]\s*"[a-zA-Z0-9_]+"\s*:/.test(html.slice(0,5000)),no_stack_trace:!/Error:\s|Traceback|at\s+[\w.]+\s*\(/.test(html),no_unresolved_tokens:!/(TODO|FIXME|\{\{[^}]+\}\}|%%[^%]+%%)/.test(html)};
  for (const [k,v] of Object.entries(checks)) if(!v) errors.push(`${route.id}: ${k} failed`);
  cases.push({route_id:route.id,file:route.file,checks});
}
const report={schema_version:'1.0',repo:'seq23/sprylabs-hpc-site',validator:'browserless-mock-backup',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',real_browser_proof:false,proof_boundary:'Browserless fixture fallback only; screenshots, layout geometry, deployed runtime, and GitHub Actions are not proven.',cases,errors};
writeJson('artifacts/validation/browserless-mock-audit.json',report);
writeJson('artifacts/validation/mock-browser-backup.json',report);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/browserless-mock-audit.md',`# Browserless Mock Backup Audit\n\nStatus: ${report.status}\n\nRoutes checked: ${cases.length}\n\nReal browser proof: false\n\nBoundary: ${report.proof_boundary}\n`);
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log(`[validate:browserless-mock-backup] PASS cases=${cases.length}; real_browser_proof=false`);
