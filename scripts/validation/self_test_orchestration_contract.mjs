#!/usr/bin/env node
import fs from 'node:fs';
import {buildExecutionGraph, assertReachable} from './orchestration_graph.mjs';

const cases=[];
function check(name,fn){try{fn();cases.push({name,status:'PASS'})}catch(e){cases.push({name,status:'FAIL',error:e.message})}}
function yes(v,m){if(!v) throw new Error(m)}
function no(v,m){if(v) throw new Error(m)}

check('direct inclusion',()=>{const g=buildExecutionGraph({pkg:{scripts:{'validate:all':'npm run validate:x','validate:x':'node x.mjs'}},matrix:{profiles:{}}});yes(assertReachable(g,'validate:all','validate:x'),'target unreachable')});
check('profile delegation',()=>{const g=buildExecutionGraph({pkg:{scripts:{'validate:all':'npm run validate:profile -- container-prepush','validate:profile':'node p.mjs','validate:x':'node x.mjs'}},matrix:{profiles:{'container-prepush':{steps:[{command:'npm run validate:x'}]}}}});yes(assertReachable(g,'validate:all','validate:x'),'profile target unreachable')});
check('nested alias',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run b',b:'npm run c',c:'node c.mjs'}},matrix:{profiles:{}}});yes(assertReachable(g,'a','c'),'nested target unreachable')});
check('genuinely missing target',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run b'}},matrix:{profiles:{}}});yes(g.errors.some(x=>x.includes('unknown npm target b')),'missing target not rejected')});
check('unknown profile',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run validate:profile -- nope','validate:profile':'node p.mjs'}},matrix:{profiles:{}}});yes(g.errors.some(x=>x.includes('unknown profile nope')),'unknown profile not rejected')});
check('script cycle',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run b',b:'npm run a'}},matrix:{profiles:{}}});yes(g.cycles.length>0,'script cycle not detected')});
check('profile cycle',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run validate:profile -- p','validate:profile':'node p.mjs'}},matrix:{profiles:{p:{extends:['q'],steps:[]},q:{extends:['p'],steps:[]}}}});yes(g.cycles.length>0,'profile cycle not detected')});
check('missing mandatory reachability',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'node a.mjs',b:'node b.mjs'}},matrix:{profiles:{}}});no(assertReachable(g,'a','b'),'unreachable target marked reachable')});
check('duplicate path remains finite',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'npm run b && npm run c',b:'npm run d',c:'npm run d',d:'node d.mjs'}},matrix:{profiles:{}}});yes(g.reachable('a').size===4,'duplicate paths corrupted reachability')});
check('literal command does not create false npm edge',()=>{const g=buildExecutionGraph({pkg:{scripts:{a:'node tool.mjs --text "npm run fake"'}},matrix:{profiles:{}}});yes(g.errors.length===0,'quoted text falsely parsed')});

const errors=cases.filter(x=>x.status!=='PASS');
fs.mkdirSync('artifacts/validation',{recursive:true});
fs.writeFileSync('artifacts/validation/orchestration-contract-self-test.json',JSON.stringify({status:errors.length?'FAIL':'PASS',cases},null,2)+'\n');
if(errors.length){console.error(`[orchestration:self-test] FAIL ${errors.length}/${cases.length}`);for(const e of errors) console.error(` - ${e.name}: ${e.error}`);process.exit(1)}
console.log(`[orchestration:self-test] PASS ${cases.length}/${cases.length}`);
