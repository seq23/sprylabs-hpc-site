const API='https://api.github.com';
const HEADERS=(token)=>({authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'spry-admin-command-center','x-github-api-version':'2022-11-28'});
export const ACTIONS={
  publish_new_content:{workflow:'spry-content-release.yml',inputs:{mode:'full-content-cycle'}},
  run_zero_dollar:{workflow:'daily-citation-intelligence.yml',inputs:{}},
  run_paid_agent_intake:{workflow:'spry-content-release.yml',inputs:{mode:'agent-intake'}},
  push_changes_live:{workflow:'validate-repo.yml',inputs:{}},
  rebuild_site:{workflow:'spry-full-rebuild.yml',inputs:{}},
  refresh_surfaces:{workflow:'admin-operations.yml',inputs:{operation:'refresh_surfaces'}},
  submit_updated_pages:{workflow:'admin-operations.yml',inputs:{operation:'submit_updated_pages'}},
  run_self_healing:{workflow:'admin-operations.yml',inputs:{operation:'run_self_healing'}},
  fix_failed_pages:{workflow:'admin-operations.yml',inputs:{operation:'fix_failed_pages'}},
  rerun_distribution:{workflow:'admin-operations.yml',inputs:{operation:'rerun_distribution'}},
  pause_autopublishing:{workflow:'admin-command.yml',inputs:{action:'pause_autopublishing'}},
  resume_autopublishing:{workflow:'admin-command.yml',inputs:{action:'resume_autopublishing'}},
  set_growth_normal:{workflow:'admin-command.yml',inputs:{action:'set_aggressiveness',target_id:'normal'}},
  set_growth_aggressive:{workflow:'admin-command.yml',inputs:{action:'set_aggressiveness',target_id:'aggressive'}},
  set_growth_maximum:{workflow:'admin-command.yml',inputs:{action:'set_aggressiveness',target_id:'maximum'}},
  rebuild_admin:{workflow:'admin-command.yml',inputs:{action:'rebuild_admin'}},
  emergency_stop:{workflow:'admin-command.yml',inputs:{action:'emergency_stop'}}
};
export function configured(env){return Boolean(env.GITHUB_ADMIN_TOKEN&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY||''))}
export async function gh(env,path,options={}){const r=await fetch(`${API}/repos/${env.GITHUB_REPOSITORY}${path}`,{...options,headers:{...HEADERS(env.GITHUB_ADMIN_TOKEN),...(options.headers||{})}});if(!r.ok){const t=await r.text();throw new Error(`GitHub ${r.status}: ${t.slice(0,300)}`)}if(r.status===204)return null;return r.json()}
export async function dispatch(env,actionId){const spec=ACTIONS[actionId];if(!spec)throw new Error('Action not allowed');const dispatchedAt=new Date().toISOString();await gh(env,`/actions/workflows/${encodeURIComponent(spec.workflow)}/dispatches`,{method:'POST',body:JSON.stringify({ref:env.GITHUB_DEFAULT_BRANCH||'main',inputs:spec.inputs})});return {action_id:actionId,workflow:spec.workflow,dispatched_at:dispatchedAt,repository:env.GITHUB_REPOSITORY}}
export async function findRun(env,receipt){const list=await gh(env,`/actions/workflows/${encodeURIComponent(receipt.workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(env.GITHUB_DEFAULT_BRANCH||'main')}&per_page=10`);const floor=Date.parse(receipt.dispatched_at)-10000;return (list.workflow_runs||[]).filter(x=>Date.parse(x.created_at)>=floor).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0]||null}
export async function recentCommit(env,since){const data=await gh(env,`/commits?sha=${encodeURIComponent(env.GITHUB_DEFAULT_BRANCH||'main')}&since=${encodeURIComponent(since)}&per_page=10`);return Array.isArray(data)&&data.length?{sha:data[0].sha,url:data[0].html_url,message:data[0].commit?.message||''}:null}
