#!/usr/bin/env python3
"""Expose repair_schema_parity.py's real route logic to validate_citation_repair_reach.mjs.

Emits, as one JSON object:
  routes  - route_from_path() for each argument path
  allowed - active_mutation_routes(), i.e. the exact set the repair will select work
            from, including the contract-violation union

The guard needs the SECOND field to mean anything. An earlier version of the guard
regenerated the violation-scope file and then asserted the file contained the violating
routes, which is self-fulfilling: it was checking its own output and could never fail.
Reading active_mutation_routes() instead asserts the property that actually matters -
that the repair, as written, will select the page the validator is failing on. That
breaks if the union is removed, or if the two route normalizers drift apart.

`allowed` is null when the repair is unscoped (no mutation scope present), which already
means every page is reachable.

Usage: python3 scripts/citation/route_probe.py <path> [<path> ...]
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from repair_schema_parity import active_mutation_routes, route_from_path  # noqa: E402


def main() -> int:
    paths = sys.argv[1:]
    if not paths:
        print('route_probe: no paths given', file=sys.stderr)
        return 1
    # Probe under a SYNTHETIC restrictive mutation scope, never the ambient one.
    #
    # active_mutation_routes() returns None when no scope file exists, which is the
    # normal state outside a release run. Reading the ambient value would make the
    # guard's reachability assertion skip itself in exactly the environment it runs in
    # (container-prepush), passing vacuously - the same shape of hole as a check
    # satisfied by stale evidence. Pointing the module at a scope containing one
    # unrelated route forces the scoped code path every time, so the assertion
    # exercises the contract-violation union on every run.
    import repair_schema_parity as rsp
    with tempfile.TemporaryDirectory() as tmp:
        fake = Path(tmp) / 'active_mutation_scope.json'
        fake.write_text(json.dumps({
            'schema_version': '1.0',
            'note': 'synthetic scope written by route_probe.py to force the scoped path',
            'routes': ['/__route_probe_synthetic_scope__/'],
        }), encoding='utf-8')
        original = rsp.ACTIVE_SCOPE
        rsp.ACTIVE_SCOPE = fake
        try:
            allowed = rsp.active_mutation_routes()
        finally:
            rsp.ACTIVE_SCOPE = original
    print(json.dumps({
        'routes': {p: route_from_path(p) for p in paths},
        'allowed': None if allowed is None else sorted(allowed),
        'probe_mode': 'synthetic_restrictive_scope',
    }))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
