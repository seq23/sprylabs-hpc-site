import {validSession,json} from '../../_runtime/admin.js';
import {configured,findRun,recentCommit} from '../../_lib/github-admin.js';
export async function onRequestPost({request,env}){
  if(!await validSession(request,env.APP_SESSION_SECRET))return json({error:'Unauthorized'},401);
  if(!configured(env))return json({error:'GitHub bridge not configured'},503);
  const {receipt}=await request.json().catch(()=>({}));
  if(!receipt?.workflow||!receipt?.dispatched_at)return json({error:'Invalid action receipt'},400);
  try{
    const run=await findRun(env,receipt);
    if(!run)return json({status:'QUEUED',receipt});
    const status=run.status==='completed'?(run.conclusion==='success'?'SUCCEEDED':'FAILED'):'RUNNING';
    const commit=status==='SUCCEEDED'?await recentCommit(env,receipt.dispatched_at):null;
    return json({status,receipt,run:{id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,created_at:run.created_at,updated_at:run.updated_at,url:run.html_url,head_sha:run.head_sha},commit,deployment:{state:status==='SUCCEEDED'?'TRIGGERED_OR_COMPLETE':'PENDING',note:'Cloudflare deployment follows commits to main; distribution workflows report separately.'}})
  }catch(error){return json({error:error.message||'Unable to read workflow status'},502)}
}
