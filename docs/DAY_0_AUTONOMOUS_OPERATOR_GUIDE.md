# Day 0 Autonomous Operator Guide

1. Configure `APP_SESSION_SECRET`, `GITHUB_ADMIN_TOKEN`, and `GITHUB_REPOSITORY` in Cloudflare.
2. The built-in admin gate password is `blackgirlmagic`. `ADMIN_GATE_PASSWORD` remains optional and may be set later only to override that default.
2. Confirm GitHub Actions are enabled.
3. Confirm the daily citation workflow and weekly paid-agent process remain scheduled.
4. Use `/admin/` for visibility and emergency controls only.
5. Do not manually approve routine pages; Safe Harbor handles normal publication.


## Admin GitHub bridge

The command center uses a fine-grained GitHub token stored only in Cloudflare Pages. Configure these environment variables once:

- `ADMIN_GATE_PASSWORD` — optional override; the built-in default remains the approved admin password.
- `APP_SESSION_SECRET` — long random value used to sign the HttpOnly admin session cookie.
- `GITHUB_ADMIN_TOKEN` — fine-grained token restricted to `seq23/sprylabs-hpc-site` with **Actions: read/write** and **Contents: read/write**.
- `GITHUB_REPOSITORY` — `seq23/sprylabs-hpc-site`.

The browser never receives the token. Every button maps to a hardcoded allowlisted workflow and fixed inputs. Arbitrary workflows, branches, commands, and repository paths are rejected.
