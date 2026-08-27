#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Python mirror of scripts/lib/dual_domain_policy.cjs::routeFor.

Cloudflare Pages serves this repo with clean URLs:
    foo.html        answers 200 at /foo    and /foo.html 301s to /foo
    foo/index.html  answers 200 at /foo/   and /foo    308s to /foo/

The canonical route is therefore the form that answers 200 without a hop.
Keep this in lockstep with the JavaScript contract - the two are compared by
scripts/validation/validate_route_policy_parity.mjs.

download.html is the one deliberate exception: it is the revenue surface and
its bytes are frozen at a known hash, so its on-page canonical cannot be
rewritten. The route contract keeps the .html form for it so the tag, the
sitemap and the route manifests continue to agree with each other.
"""
from __future__ import annotations

# Mirrors scripts/lib/dual_domain_policy.cjs. Kept empty and in sync: the owner
# authorised removing `.html` from download.html's canonical and og:url, so its
# route is now /download like every other page. Two policy files that disagree
# about routing is how a page ends up declaring one URL while the sitemap
# advertises another.
FROZEN_HTML_ROUTES: set[str] = set()


def route_for(rel: str) -> str:
    path = str(rel).replace("\\", "/")
    if path == "index.html":
        return "/"
    if path == "faq/index.html":
        return "/faq"
    if path == "billionaire-high-performance-coach/index.html":
        return "/billionaire-high-performance-coach"
    if path.endswith("/index.html"):
        return "/" + path[: -len("/index.html")] + "/"
    if path in FROZEN_HTML_ROUTES:
        return "/" + path
    if path.endswith(".html"):
        return "/" + path[: -len(".html")]
    return "/" + path
