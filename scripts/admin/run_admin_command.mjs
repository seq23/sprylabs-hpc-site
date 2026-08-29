#!/usr/bin/env node
import fs from 'node:fs';
const action=process.env.ADMIN_ACTION;
const allowed=new Set(['pause_autopublishing','resume_autopublishing','set_aggressiveness','suppress_topic','rebuild_admin','emergency_stop']);
if(!allowed.has(action))throw new Error(`Unregistered admin command: ${action}`);

// Rule 0: no stage may exit 0 having done nothing. set_aggressiveness with an
// unregistered level, and suppress_topic with an empty target, used to fall
// through every branch, leave the control state unchanged, print
// "[admin-command] PASS <action>", exit 0 - and then the workflow committed
// "admin command: <action>" to main. The operator saw a green run and a commit
// for a change that never happened. Both now stop by name before anything is
// written.
const AGGRESSIVENESS=['normal','aggressive','maximum'];
const target=(process.env.ADMIN_TARGET||'').trim();
if(action==='set_aggressiveness'&&!AGGRESSIVENESS.includes(target)){
  console.error(`[admin-command] STOP unregistered_aggressiveness: set_aggressiveness requires ADMIN_TARGET to be one of ${AGGRESSIVENESS.join(', ')}; got ${target?`"${target}"`:'an empty value'}. Nothing was changed.`);
  process.exit(2);
}
if(action==='suppress_topic'&&!target){
  console.error('[admin-command] STOP missing_topic: suppress_topic requires a non-empty ADMIN_TARGET naming the topic to suppress. Nothing was changed.');
  process.exit(2);
}

const p='data/admin/runtime_control.json';
const state=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{schema_version:'1.0',autopublishing:'running',emergency_stop:false,aggressiveness:'aggressive',suppressed_topics:[]};
const before=JSON.stringify({autopublishing:state.autopublishing,emergency_stop:state.emergency_stop,aggressiveness:state.aggressiveness,suppressed_topics:state.suppressed_topics});
if(action==='pause_autopublishing'){state.autopublishing='paused';state.emergency_stop=false}
if(action==='emergency_stop'){state.autopublishing='paused';state.emergency_stop=true}
if(action==='resume_autopublishing'){state.autopublishing='running';state.emergency_stop=false}
if(action==='set_aggressiveness')state.aggressiveness=target;
if(action==='suppress_topic'){state.suppressed_topics=state.suppressed_topics||[];if(!state.suppressed_topics.includes(target))state.suppressed_topics.push(target)}
const after=JSON.stringify({autopublishing:state.autopublishing,emergency_stop:state.emergency_stop,aggressiveness:state.aggressiveness,suppressed_topics:state.suppressed_topics});
state.last_action={action,target,reason:process.env.ADMIN_REASON||'',at:new Date().toISOString(),changed_control_state:before!==after};
fs.mkdirSync('data/admin',{recursive:true});fs.writeFileSync(p,JSON.stringify(state,null,2)+'\n');
// rebuild_admin deliberately changes no control field - its work is done by the
// admin:build step that follows - so it is the one action allowed to report a
// no-change outcome, and it says so rather than claiming a change.
const noop=before===after;
if(noop&&action!=='rebuild_admin'){
  console.log(`[admin-command] PASS ${action}: control state already at the requested value (${target||'n/a'}); no field changed.`);
} else if(noop){
  console.log(`[admin-command] PASS ${action}: no control field changes by design; the admin rebuild that follows is this command's work.`);
} else {
  console.log(`[admin-command] PASS ${action}: ${before} -> ${after}`);
}
