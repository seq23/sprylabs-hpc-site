#!/usr/bin/env node
import fs from 'node:fs';
const action=process.env.ADMIN_ACTION;
const allowed=new Set(['pause_autopublishing','resume_autopublishing','set_aggressiveness','suppress_topic','rebuild_admin','emergency_stop']);
if(!allowed.has(action))throw new Error(`Unregistered admin command: ${action}`);
const p='data/admin/runtime_control.json';
const state=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{schema_version:'1.0',autopublishing:'running',emergency_stop:false,aggressiveness:'aggressive',suppressed_topics:[]};
if(action==='pause_autopublishing'){state.autopublishing='paused';state.emergency_stop=false}
if(action==='emergency_stop'){state.autopublishing='paused';state.emergency_stop=true}
if(action==='resume_autopublishing'){state.autopublishing='running';state.emergency_stop=false}
if(action==='set_aggressiveness'&&['normal','aggressive','maximum'].includes(process.env.ADMIN_TARGET))state.aggressiveness=process.env.ADMIN_TARGET;
if(action==='suppress_topic'&&process.env.ADMIN_TARGET&&!state.suppressed_topics.includes(process.env.ADMIN_TARGET))state.suppressed_topics.push(process.env.ADMIN_TARGET);
state.last_action={action,target:process.env.ADMIN_TARGET||'',reason:process.env.ADMIN_REASON||'',at:new Date().toISOString()};
fs.mkdirSync('data/admin',{recursive:true});fs.writeFileSync(p,JSON.stringify(state,null,2)+'\n');console.log(`[admin-command] PASS ${action}`);
