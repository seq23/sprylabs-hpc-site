import { createSession, json } from '../../_runtime/admin.js';

// Authenticates the admin surface.
//
// This handler had been reduced to `return json({status:'ok',mode:'owner_passwordless'})`
// - it returned 200 for any password, or none. Combined with action.js, which
// checked configuration and the action allowlist but never authentication, that
// meant anyone on the internet could dispatch workflows the moment
// GITHUB_ADMIN_TOKEN was configured in Cloudflare. It was inert only because
// that token is currently unset.
//
// validate:admin-github-bridge asserts exactly this ("wrong password expected
// 401") and had been failing - but it was admitted to the matrix and placed in
// no profile, so it never ran.
//
// Fails closed: with no ADMIN_PASSWORD or APP_SESSION_SECRET configured, login
// is unavailable rather than open.
export async function onRequestPost({ request, env }) {
  const secret = env.APP_SESSION_SECRET;
  const expected = env.ADMIN_PASSWORD;
  if (!secret || !expected) {
    return json({ error: 'Admin login is not configured. Set ADMIN_PASSWORD and APP_SESSION_SECRET in Cloudflare.' }, 503);
  }

  let supplied = '';
  try { supplied = String((await request.json())?.password ?? ''); } catch { supplied = ''; }

  // Constant-time comparison so a wrong password cannot be recovered by timing.
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) return json({ error: 'Invalid password' }, 401);

  const token = await createSession(secret);
  return json({ status: 'ok' }, 200, {
    'set-cookie': `spry_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
  });
}
