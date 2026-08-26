'use strict';

// The inverse of scripts/lib/dual_domain_policy.cjs::routeFor.
//
// A route is the URL that answers 200 without a redirect hop, which since the
// canonical contract moved off the .html form means `/foo` (served by foo.html)
// or `/foo/` (served by foo/index.html). Every validator that needs to check a
// route exists on disk used to do `path.join(ROOT, route.replace(/^\//, ''))`,
// which only worked while routes carried their extension. That is one bug in
// several places, so there is one resolver.

const fs = require('fs');
const path = require('path');

function candidatesFor(route) {
  const rel = String(route).replace(/^\/+/, '');
  if (rel === '') return ['index.html'];
  const bare = rel.replace(/\/+$/, '');
  return [rel, `${bare}.html`, path.posix.join(bare, 'index.html')];
}

// Absolute path of the file that serves `route`, or null if nothing does.
function fileForRoute(root, route) {
  for (const candidate of candidatesFor(route)) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function routeExists(root, route) {
  return fileForRoute(root, route) !== null;
}

module.exports = { candidatesFor, fileForRoute, routeExists };
