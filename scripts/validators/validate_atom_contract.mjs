#!/usr/bin/env node
import fs from 'node:fs';
const registry=JSON.parse(fs.readFileSync('data/content/atom_registry.json','utf8')); const contract=JSON.parse(fs.readFileSync('data/content/atom_type_contract.json','utf8')); const required=contract.required_fields||[]; const allowed=new Set(contract.allowed_atom_types||[]); const errors=[];
for(const atom of registry.atoms||[]){ for(const f of required) if(atom[f]===undefined||atom[f]===null||(Array.isArray(atom[f])&&!atom[f].length)||(!Array.isArray(atom[f])&&String(atom[f]).trim()==='')) errors.push(`${atom.atom_id||'unknown'} missing ${f}`); if(!allowed.has(atom.atom_type)) errors.push(`${atom.atom_id}: unsupported atom_type ${atom.atom_type}`); }
if(!(registry.atoms||[]).length) errors.push('atom registry empty');
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log(`[validate:atom-contract] PASS atoms=${registry.atoms.length}`);
