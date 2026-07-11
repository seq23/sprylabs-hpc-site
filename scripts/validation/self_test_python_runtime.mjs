#!/usr/bin/env node
import fs from 'node:fs';import crypto from 'node:crypto';import {ensureRuntime,managedPython} from './python_runtime.mjs';import {spawnSync} from 'node:child_process';
const failures=[];let id;try{id=ensureRuntime()}catch(e){failures.push(e.message)}
if(id){if(id.parser!=='lxml')failures.push('parser identity is not lxml');if(!id.requirements_sha256)failures.push('requirements hash missing');const r=spawnSync(managedPython(),['-c',"from bs4 import BeautifulSoup; import yaml; assert BeautifulSoup('<p>x</p>','lxml').p.text=='x'; assert yaml.safe_load('a: 1')['a']==1"],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});if(r.status!==0)failures.push('managed parser smoke failed');}
fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('artifacts/validation/python-runtime-self-test.json',JSON.stringify({status:failures.length?'FAIL':'PASS',failures,identity:id||null},null,2)+'\n');
if(failures.length){console.error('[validation:python-runtime:self-test] FAIL:',failures.join('; '));process.exit(1)}console.log('[validation:python-runtime:self-test] PASS: managed runtime, lxml parser, and PyYAML available');
