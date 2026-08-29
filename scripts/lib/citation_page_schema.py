"""The one serialization of <script id="CITATION_PAGE_SCHEMA">.

The Python half of scripts/lib/citation_page_schema.cjs; read the reasoning
there. In short: JS writers used JSON.stringify (compact), two Python writers
used json.dumps with Python's default separators (a space after every comma and
colon), so one build step rewrote a page's schema spaced and the next rewrote it
compact with no editorial change between them - about 2,200 pages modified by a
clean `npm run build:all`, and modified back by the next one.

Both files must agree byte for byte. serialize_schema below is the exact
equivalent of JSON.stringify(value).replace(/</g,'\\u003c'): compact separators,
no ASCII escaping beyond '<', and dict insertion order preserved.
"""

import json
import re

SCHEMA_SCRIPT_ID = "CITATION_PAGE_SCHEMA"

SCHEMA_SCRIPT_RE = re.compile(
    r'(<script\b[^>]*\bid=["\']CITATION_PAGE_SCHEMA["\'][^>]*>)(.*?)(</script>)',
    re.S | re.I,
)


def serialize_schema(value) -> str:
    """Compact JSON with '<' escaped, identical to the JS serializer's output."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def main_entity_of_page(canonical):
    """The one shape for mainEntityOfPage."""
    return {"@id": canonical}


def main_entity_of_page_id(value):
    """The canonical URL a mainEntityOfPage value points at, in any of its shapes."""
    if not value:
        return None
    return value if isinstance(value, str) else value.get("@id")


def render_schema_script(value) -> str:
    return (
        f'<script id="{SCHEMA_SCRIPT_ID}" type="application/ld+json">'
        f"{serialize_schema(value)}</script>"
    )


# download.html is the revenue surface and its bytes are frozen at a known
# sha256. Its schema block predates this contract; normalising it would break a
# harder contract than this one, so it is exempt BY NAME.
SERIALIZATION_EXEMPT = {"download.html"}
