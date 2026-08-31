#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path.cwd()
MODE = sys.argv[1] if len(sys.argv) > 1 else ''
SNAP = ROOT / 'artifacts/validation/extraction-surface-snapshot.json'
OUT = ROOT / 'artifacts/validation/extraction-surface-guard.json'
VENDOR = ROOT / 'scripts/_vendor'
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))
from bs4 import BeautifulSoup


def sha(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def html_surface(path: Path) -> dict:
    raw = path.read_text(encoding='utf-8', errors='ignore')
    soup = BeautifulSoup(raw, 'lxml')
    blocks = soup.select('[data-llm-answer="true"]')
    schemas = []
    for node in soup.select('script[type="application/ld+json"]'):
        node_id = node.get('id', '')
        if node_id in {'CITATION_PAGE_SCHEMA', 'BHPC_CITATION_SCHEMA'}:
            text = node.string or node.get_text() or ''
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = text.strip()
            schemas.append({'id': node_id, 'data': parsed})
    return {
        'blocks': [
            {
                'type': block.get('data-extraction-type'),
                'framework': block.get('data-named-framework'),
                'html': str(block),
            }
            for block in blocks
        ],
        'schemas': sorted(schemas, key=lambda item: item['id']),
    }


def projection(path: str, rows: list[dict], fields: tuple[str, ...]) -> list[dict]:
    projected = []
    for row in rows:
        projected.append({field: row.get(field) for field in fields})
    projected.sort(key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
    return projected


def hard_fail(message: str) -> None:
    print(f'[extraction-surface-guard] FAIL: {message}', file=sys.stderr)
    raise SystemExit(1)


def build_state() -> dict[str, str]:
    citable = json.loads((ROOT / 'data/citation/citable_pages.json').read_text(encoding='utf-8'))
    query_registry = json.loads((ROOT / 'data/citation/query_registry.json').read_text(encoding='utf-8'))
    admission = json.loads((ROOT / 'data/content/page_admission_registry.json').read_text(encoding='utf-8'))

    # Each of the three registries below is hashed independently, and each can
    # empty on its own. sha() of an empty projection is a perfectly stable
    # constant, so an emptied registry snapshots and re-checks clean forever.
    if not citable.get('pages'):
        hard_fail('data/citation/citable_pages.json lists no pages; expected at least one governed page. '
                  'Hashing an empty governed set proves nothing.')
    if not query_registry.get('queries'):
        hard_fail('data/citation/query_registry.json lists no queries; expected at least one query owner. '
                  'Hashing an empty registry projection proves nothing.')
    if not admission.get('records'):
        hard_fail('data/content/page_admission_registry.json lists no records; expected at least one admitted page. '
                  'Hashing an empty registry projection proves nothing.')

    state: dict[str, str] = {}
    # `if page.is_file()` used to drop a governed page that is not on disk. That
    # is the one failure this guard should shout about: a governed HTML surface
    # can disappear and the run still prints PASS because its hash simply left
    # the state. A missing governed page is now reported instead of dropped.
    missing = []
    for row in citable.get('pages', []):
        rel = row.get('path', '')
        page = ROOT / rel
        if page.is_file():
            state[f'html:{rel}'] = sha(html_surface(page))
        else:
            missing.append(rel)
    if missing:
        hard_fail(f'{len(missing)} governed page(s) named in data/citation/citable_pages.json are not files on disk, '
                  f'so their extraction surfaces were never hashed: {", ".join(sorted(missing)[:20])}')
    # A run that hashed no HTML surface at all protects no extraction block and
    # no citation schema, and `check` would then compare two empty states as PASS.
    if not any(key.startswith('html:') for key in state):
        hard_fail('hashed 0 HTML extraction surfaces; expected one per page in data/citation/citable_pages.json. '
                  'A surface guard that reads no page proves nothing.')

    state['registry:citable-pages'] = sha(projection(
        'citable-pages', citable.get('pages', []),
        ('path', 'canonical_url', 'query', 'framework', 'extraction_type', 'schema_type', 'status')
    ))
    state['registry:query-owners'] = sha(projection(
        'query-owners', query_registry.get('queries', []),
        ('query_id', 'query', 'intent_class', 'primary_page', 'canonical_domain', 'release_status', 'aliases')
    ))
    state['registry:page-admission'] = sha(projection(
        'page-admission', admission.get('records', []),
        ('path', 'canonical_domain', 'generation_lane', 'admission_level', 'status', 'primary_query', 'intent', 'framework', 'artifact_type')
    ))
    return state


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


state = build_state()
if MODE == 'snapshot':
    write_json(SNAP, state)
    print(f'[extraction-surface-guard] snapshot {len(state)} governed surfaces')
    raise SystemExit(0)
if MODE == 'check':
    old = json.loads(SNAP.read_text(encoding='utf-8')) if SNAP.exists() else {}
    changed = [key for key in sorted(set(old) | set(state)) if old.get(key) != state.get(key)]
    write_json(OUT, {'status': 'PASS' if not changed else 'FAIL', 'changed': changed})
    if changed:
        print(f'[extraction-surface-guard] FAIL: {len(changed)} governed surfaces changed')
        for key in changed[:50]:
            print(' -', key)
        raise SystemExit(1)
    print('[extraction-surface-guard] PASS')
    raise SystemExit(0)
print('usage: extraction_surface_guard.py snapshot|check')
raise SystemExit(2)
