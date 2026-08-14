#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,PUBLIC_ROOT,DIST_ROOT,copyTree} from './lib.mjs';
copyTree(PUBLIC_ROOT,DIST_ROOT);
const count=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?count(path.join(dir,e.name)):1),0);
console.log(`[site-layout] dist rebuilt files=${count(DIST_ROOT)}`);
