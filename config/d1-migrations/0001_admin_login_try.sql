-- The admin sign-in attempt limit (functions/_runtime/login_limit.js). Additive only.
-- No raw IP is stored: key is an HMAC of the caller's network with APP_SESSION_SECRET.
-- Lives under config/ (not a root migrations/ folder) because every root entry not on
-- scripts/lib/published_surface.cjs is published by Pages, and config/ is excluded.
CREATE TABLE IF NOT EXISTS schema_version (migration TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS admin_login_try (bucket TEXT NOT NULL, key TEXT NOT NULL, tries INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (bucket, key));
INSERT OR IGNORE INTO schema_version (migration) VALUES ('0001_admin_login_try');
