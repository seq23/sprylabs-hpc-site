// Attempt limit for the admin sign-in (functions/api/admin/login.js), audit row #5 (23 Nov 2026).
//
// Every try is taken from the caller's own buckets BEFORE the password is compared, so a guess costs a try whatever it
// is. Buckets are per network only: one caller locks out only its own network, never a different address, and there is
// no shared cap a stranger could fill to lock out the owner. The network is Cloudflare's cf-connecting-ip (a client
// cannot set it at the edge; x-forwarded-for is never read), IPv4 whole, IPv6 by its /64, plus a /48 bucket so one
// tunnel-broker account (65,536 /64s) cannot multiply its tries.
//
// The store is the D1 database bound as ADMIN_DB (table: config/d1-migrations/0001_admin_login_try.sql). No binding, a
// missing table or a failed read is a plain 503 refusal, never a sign-in and never a 500.
//
// Copied from: keepmyproof site/server/review.mjs @ 4b0e64a4dffaa76727dbaaa1f2c4bdf5db26f17d (ipPrefix, hmac, take, the
// prune of expired rows), which copied approvalprep functions/_runtime/review.js @ 540a42a9dcf551844733c9740e276c11fb088edf.

export const LIMITS = { perMinute: 5, perNetworkDaily: 20, perNet48Daily: 40 };
const MINUTE = 60_000, DAY = 86_400_000;

/** The caller's network for limits. IPv4 is kept whole. IPv6 is cut to its /64 (bits 64): one home or phone holds a whole
 * /64, so the full address would give one person 2^64 "IPs". bits 48 gives the site-sized block one tunnel-broker
 * account hands out. An IPv4-mapped IPv6 address (::ffff:192.0.2.1 or ::ffff:c000:201) is the IPv4 it carries. */
export function ipPrefix(ip, bits = 64) {
  const text = String(ip || '').trim().toLowerCase();
  if (!text.includes(':')) return text || 'unknown';
  const [head, tail = ''] = text.split('::');
  const hexGroups = (part) => (part ? part.split(':') : []).flatMap((g) => {
    if (!g.includes('.')) return [g];
    const o = g.split('.').map(Number); // a dotted IPv4 tail fills the last two groups
    return [((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16)];
  });
  const left = hexGroups(head), right = hexGroups(tail);
  const groups = (text.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left)
    .map((g) => parseInt(g || '0', 16) || 0);
  if (groups.length === 8 && groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff)
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  return groups.slice(0, bits / 16).map((g) => g.toString(16)).join(':') + `::/${bits}`;
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One atomic try against a cap: the bucket's count after this try (1 or more) when taken, 0 when the bucket is full. */
async function take(db, bucket, key, cap, until) {
  const row = await db.prepare('INSERT INTO admin_login_try (bucket, key, tries, until) VALUES (?, ?, 1, ?) ON CONFLICT(bucket, key) DO UPDATE SET tries = tries + 1 WHERE tries < ? RETURNING tries')
    .bind(bucket, key, until, cap).first();
  return Number(row?.tries ?? 0);
}

/**
 * Takes one sign-in try for this caller. Returns null when the try may go on to the password compare, or the refusal
 * as { status, error }: 403 no Cloudflare client address, 429 this network's limit, 503 the store is unbound or down.
 */
export async function takeLoginTry(request, env, now = Date.now()) {
  const db = env.ADMIN_DB;
  if (!db || typeof db.prepare !== 'function') return { status: 503, error: 'Admin sign-in is unavailable: its attempt limit store is not bound.' };
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return { status: 403, error: 'Sign-in refused: no client address.' };
  try {
    const secret = env.APP_SESSION_SECRET;
    const [net, net48] = await Promise.all([hmacHex(secret, `ip:${ipPrefix(ip)}`), hmacHex(secret, `net48:${ipPrefix(ip, 48)}`)]);
    const day = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / MINUTE);
    await db.prepare('DELETE FROM admin_login_try WHERE until < ?').bind(now).run();
    if (!(await take(db, `min:${minute}`, net, LIMITS.perMinute, now + 2 * MINUTE))) return { status: 429, error: 'Too many sign-in tries. Wait a minute.' };
    if (!(await take(db, `day:${day}`, net, LIMITS.perNetworkDaily, now + 2 * DAY))) return { status: 429, error: 'Too many sign-in tries today from this network.' };
    if (!(await take(db, `net48:${day}`, net48, LIMITS.perNet48Daily, now + 2 * DAY))) return { status: 429, error: 'Too many sign-in tries today from this network.' };
    return null;
  } catch {
    return { status: 503, error: 'Admin sign-in is unavailable right now. Try again later.' };
  }
}
