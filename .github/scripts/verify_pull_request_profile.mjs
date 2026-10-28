#!/usr/bin/env node
// Reconcile the PR receipt against repository data, including commands and SHA.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function verifyProfile(matrix, receipt, sha) {
  const expected = new Map();
  function add(name, stack = []) {
    if (stack.includes(name)) throw new Error(`profile cycle: ${name}`);
    const profile = matrix.profiles?.[name];
    if (!profile) throw new Error(`missing profile: ${name}`);
    for (const parent of profile.extends || []) add(parent, [...stack, name]);
    for (const step of profile.steps || []) {
      const id = step.id || step.command;
      if (!expected.has(id)) expected.set(id, step.command);
    }
  }
  add('changed');
  if (!expected.size) throw new Error('changed profile contains zero steps');
  if (!sha || receipt.head_sha !== sha) throw new Error('receipt does not name this commit SHA');
  if (receipt.profile !== 'changed' || receipt.status !== 'PASS' || receipt.stopped_early_at || receipt.failure_count !== 0) {
    throw new Error('incremental profile did not pass completely');
  }
  const seen = new Set();
  for (const step of receipt.steps || []) {
    const id = step.id || step.command;
    if (seen.has(id) || !expected.has(id) || expected.get(id) !== step.command) {
      throw new Error(`unexpected, duplicate or stale command: ${id}`);
    }
    if (step.exit_code !== 0 || step.status !== 'PASS') throw new Error(`failed step: ${id}`);
    seen.add(id);
  }
  const missing = [...expected.keys()].filter(id => !seen.has(id));
  if (missing.length) throw new Error(`unexecuted steps: ${missing.join(', ')}`);
  return expected.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const matrix = JSON.parse(fs.readFileSync('_repo_validation_matrix.json', 'utf8'));
    const receipt = JSON.parse(fs.readFileSync('artifacts/validation/profile-changed.json', 'utf8'));
    const count = verifyProfile(matrix, receipt, process.env.GITHUB_SHA);
    console.log(`[pr-profile] PASS: all ${count} incremental steps passed for ${receipt.head_sha}`);
  } catch (error) {
    console.error(`[pr-profile] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
