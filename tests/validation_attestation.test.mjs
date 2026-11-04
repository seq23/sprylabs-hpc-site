import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const producer = path.resolve('scripts/release/create_validation_attestation.mjs');
test('validation attestations derive their verdict from a nonempty receipt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spry-attestation-'));
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(dir,file)), {recursive:true}); fs.writeFileSync(path.join(dir,file), JSON.stringify(value)); };
  try {
    fs.writeFileSync(path.join(dir,'one.html'), '<h1>One published page</h1>');
    write('_baseline_packaging_contract.json', {required_files:['one.html']});
    write('data/citation/query_registry.json', {queries:[{release_status:'ACTIVE'}]});
    write('data/content/page_admission_registry.json', {records:[{status:'ADMITTED'}]});
    for (const [status, failures, expected] of [['PASS',0,'PASS'],['FAIL',1,'FAIL'],['PASS',1,'FAIL']]) {
      write('artifacts/validation/profile-container-prepush.json', {profile:'container-prepush',status,failure_count:failures,steps:[{status:failures?'FAIL':'PASS'}]});
      execFileSync(process.execPath,[producer], {cwd:dir,env:{...process.env,VALIDATED_COMMIT_SHA:'fixture'},stdio:'pipe'});
      const result = JSON.parse(fs.readFileSync(path.join(dir,'reports/validation-attestation.json')));
      assert.equal(result.validation_status,expected);
      assert.equal(result.actionable_warnings,failures);
      assert.equal(result.profile,'container-prepush');
    }
    write('artifacts/validation/profile-container-prepush.json', {status:'PASS',steps:[]});
    assert.throws(()=>execFileSync(process.execPath,[producer], {cwd:dir,stdio:'pipe'}));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
