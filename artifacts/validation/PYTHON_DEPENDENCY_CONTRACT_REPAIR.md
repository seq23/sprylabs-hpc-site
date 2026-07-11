# Python Dependency Contract Repair

## Implemented
- Added pinned PyYAML runtime dependency.
- Expanded managed runtime probe to verify yaml, bs4, and lxml.
- Added complete AST import inventory for repo-owned Python scripts.
- Added pinned-requirement comparison and managed-runtime import proof.
- Added compile proof for every repo-owned Python file.
- Removed the unmanaged host-python bypass from the programmatic lane.
- Admitted the dependency-contract validator in registry and matrix.

## Proof
- 27 repo-owned Python files scanned.
- Third-party imports declared and importable.
- Exact workflow topology fixture passed: 8 GitHub YAML workflows, 33 faux scenarios.
- Managed runtime self-test passed with PyYAML, lxml, and Beautiful Soup.
- Host Python bypass audit: zero.
- Validation registry: 158 records, 157 matrix entries.

## Validation Boundary
The full container-prepush profile completed runtime bootstrap, build, citation postbuild, 1,400-page expansion, and the 501-record agent chain. The execution environment timed out during the long repository-wide citation repair step without reporting a validator or dependency failure. Local updater validation remains required.
