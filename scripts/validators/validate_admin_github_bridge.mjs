import fs from 'node:fs';
import { onRequestPost as login } from '../../functions/api/admin/login.js';
import { onRequestPost as action } from '../../functions/api/admin/action.js';
import { onRequestPost as status } from '../../functions/api/admin/action-status.js';
import { ACTIONS } from '../../functions/_lib/github-admin.js';

const env = {
  APP_SESSION_SECRET: 'hostile-review-test-secret-1234567890',
  GITHUB_ADMIN_TOKEN: 'test-token',
  GITHUB_REPOSITORY: 'seq23/sprylabs-hpc-site'
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const workflowFiles = new Set(fs.readdirSync('.github/workflows').filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')));
for (const [id, spec] of Object.entries(ACTIONS)) {
  assert(workflowFiles.has(spec.workflow), `${id}: workflow missing: ${spec.workflow}`);
}

const badLogin = await login({
  request: new Request('https://example.test/api/admin/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({password:'wrong'}) }),
  env
});
assert(badLogin.status === 401, `wrong password expected 401, received ${badLogin.status}`);

const goodLogin = await login({
  request: new Request('https://example.test/api/admin/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({password:'blackgirlmagic'}) }),
  env
});
assert(goodLogin.status === 200, `valid password expected 200, received ${goodLogin.status}`);
const setCookie = goodLogin.headers.get('set-cookie') || '';
assert(setCookie.includes('HttpOnly'), 'session cookie must be HttpOnly');
assert(setCookie.includes('Secure'), 'session cookie must be Secure');
assert(setCookie.includes('SameSite=Strict'), 'session cookie must use SameSite=Strict');
const cookie = setCookie.split(';')[0];

const unauthenticated = await action({
  request: new Request('https://example.test/api/admin/action', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({action:'run_zero_dollar'}) }),
  env
});
assert(unauthenticated.status === 401, `unauthenticated action expected 401, received ${unauthenticated.status}`);

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({url:String(url), method:options.method || 'GET', body:options.body || ''});
  if (String(url).includes('/dispatches')) return new Response(null, {status:204});
  if (String(url).includes('/runs?')) return Response.json({workflow_runs:[{
    id: 101,
    name: 'Daily Citation Intelligence',
    status: 'completed',
    conclusion: 'success',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    html_url: 'https://github.test/run/101',
    head_sha: 'abc123'
  }]});
  if (String(url).includes('/commits?')) return Response.json([{sha:'abc123', html_url:'https://github.test/commit/abc123', commit:{message:'test commit'}}]);
  return new Response('not found', {status:404});
};

try {
  const dispatched = await action({
    request: new Request('https://example.test/api/admin/action', {
      method: 'POST',
      headers: {'content-type':'application/json', cookie},
      body: JSON.stringify({action:'run_zero_dollar', workflow:'untrusted.yml', inputs:{shell:'rm -rf /'}})
    }),
    env
  });
  assert(dispatched.status === 202, `allowed action expected 202, received ${dispatched.status}`);
  const payload = await dispatched.json();
  assert(payload.receipt.workflow === 'daily-citation-intelligence.yml', 'client-supplied workflow must be ignored');
  assert(calls[0].url.endsWith('/actions/workflows/daily-citation-intelligence.yml/dispatches'), 'dispatch must use allowlisted workflow');
  assert(!calls[0].body.includes('untrusted.yml') && !calls[0].body.includes('rm -rf'), 'untrusted client fields leaked into GitHub request');

  const denied = await action({
    request: new Request('https://example.test/api/admin/action', {method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({action:'arbitrary_action'})}),
    env
  });
  assert(denied.status === 400, `unknown action expected 400, received ${denied.status}`);

  const checked = await status({
    request: new Request('https://example.test/api/admin/action-status', {method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({receipt:payload.receipt})}),
    env
  });
  assert(checked.status === 200, `status endpoint expected 200, received ${checked.status}`);
  const checkedPayload = await checked.json();
  assert(checkedPayload.status === 'SUCCEEDED', `status expected SUCCEEDED, received ${checkedPayload.status}`);
  assert(checkedPayload.commit?.sha === 'abc123', 'status endpoint must return resulting commit receipt');
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`[validate:admin-github-bridge] PASS actions=${Object.keys(ACTIONS).length}`);
