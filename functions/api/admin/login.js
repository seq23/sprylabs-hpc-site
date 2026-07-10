import {createSession,json} from '../../_runtime/admin.js';

const DEFAULT_ADMIN_PASSWORD_SHA256 = 'c7ef3319e6cf6aab9035156df95f18dfec2ba2178f733940eda688758805708b';
const encoder = new TextEncoder();

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({request,env}) {
  const body = await request.json().catch(() => ({}));
  if (!env.APP_SESSION_SECRET) return json({error:'Admin session secret not configured'},503);

  const submittedPassword = typeof body.password === 'string' ? body.password : '';
  const validPassword = env.ADMIN_GATE_PASSWORD
    ? submittedPassword === env.ADMIN_GATE_PASSWORD
    : await sha256Hex(submittedPassword) === DEFAULT_ADMIN_PASSWORD_SHA256;

  if (!validPassword) return json({error:'Invalid credentials'},401);

  const token = await createSession(env.APP_SESSION_SECRET);
  return json({status:'ok'},200,{
    'set-cookie':`spry_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
  });
}
