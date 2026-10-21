/**
 * The deployed build's id, keyed into the edge HTML cache (functions/_lib/edge_cache.js).
 *
 * Committed empty on purpose: an empty id means "bypass the cache", so a local
 * run or a build that skipped the stamp can never serve a page cached from
 * another build. scripts/assemble_pages_output.js (the Pages build command)
 * rewrites this file with the commit SHA + build time when it runs on Cloudflare
 * Pages (CF_PAGES=1), before Pages compiles functions/.
 */
export const BUILD_ID = '';
