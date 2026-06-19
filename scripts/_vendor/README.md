# Vendored Python runtime dependencies

This directory contains pure-Python runtime dependencies required by the citation build and validation scripts:

- beautifulsoup4 4.14.3
- soupsieve 2.8.4
- typing-extensions 4.15.0

They are vendored so the repository's governed updater can run `npm ci` and the Python build scripts without requiring an undeclared `pip install` or network access. License texts are stored under `LICENSES/python-vendored/`.
