import { validSession, json } from '../../_runtime/admin.js';

// Reports whether the caller holds a valid admin session. This previously
// returned {authenticated:true} unconditionally, to anyone.
export async function onRequestGet({ request, env }) {
  const secret = env.APP_SESSION_SECRET;
  if (!secret) return json({ authenticated: false, error: 'Admin session is not configured.' }, 503);
  const ok = await validSession(request, secret);
  return json({ authenticated: ok }, ok ? 200 : 401);
}
