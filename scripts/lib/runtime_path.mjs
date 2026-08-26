import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve a repository-relative path.
 *
 * This replaces scripts/site_layout/lib.mjs's resolveRuntimePath, which existed
 * to translate paths while the build physically staged site/public at the
 * repository root and then moved it back. The public site now lives at the
 * repository root permanently, so nothing needs translating and this is a plain
 * resolve against the repo.
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveRuntimePath(rel) {
  return path.resolve(ROOT, String(rel || '').replace(/\\/g, '/').replace(/^\.\//, ''));
}
