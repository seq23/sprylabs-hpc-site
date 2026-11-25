// Shared HTML-to-text helpers (CodeQL fixes, 25 Nov 2026).
// - Element removal matches any closing-tag form: </script>, </SCRIPT >, </script foo>.
// - Tag stripping repeats until stable, so "<<b>b>" or "<scr<script>ipt>" leaves no tag behind.

/** Remove every <tag ...>...</tag ...> element (case-insensitive), repeating until none is left. */
export function removeElements(html, ...tags) {
  let out = String(html ?? '');
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\b[^>]*>`, 'gi');
    let prev;
    do { prev = out; out = out.replace(re, ' '); } while (out !== prev);
  }
  return out;
}

/** Replace every tag with `sep`, repeating until no tag is left. On ordinary HTML this is the
 *  same as one pass of /<[^>]+>/g (so content hashes built on it do not move). */
export function stripTags(html, sep = ' ') {
  let out = String(html ?? ''), prev;
  do { prev = out; out = out.replace(/<[^>]+>/g, sep); } while (out !== prev);
  return out;
}

/** Escape every RegExp metacharacter in a literal string. */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
