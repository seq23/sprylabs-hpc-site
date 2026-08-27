import {json,validSession} from '../../_runtime/admin.js';
import {ACTIONS,configured,dispatch} from '../../_lib/github-admin.js';
export async function onRequestPost({request,env}){
  // Authentication first. This endpoint dispatches GitHub workflows; it previously
  // checked configuration and the action allowlist but never who was asking.
  const sessionSecret=env.APP_SESSION_SECRET;
  if(!sessionSecret||!await validSession(request,sessionSecret)) return json({error:'Unauthorized'},401);

  if(!configured(env))return json({error:'GitHub bridge not configured. Add GITHUB_ADMIN_TOKEN and GITHUB_REPOSITORY in Cloudflare.'},503);
  const body=await request.json().catch(()=>({}));
  if(!ACTIONS[body.action])return json({error:'Action not allowed'},400);
  try{return json({status:'QUEUED',receipt:await dispatch(env,body.action)},202)}
  catch(error){return json({error:error.message||'Workflow dispatch failed'},502)}
}
