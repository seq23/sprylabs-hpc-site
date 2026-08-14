#!/usr/bin/env python3
from __future__ import annotations
import json, os
from pathlib import Path

def _load(root: Path):
    value=os.environ.get('VALIDATION_PAGE_SCOPE_FILE','').strip()
    if not value:
        raise RuntimeError('VALIDATION_PAGE_SCOPE_FILE is required for incremental page validation')
    fp=Path(value)
    if not fp.is_absolute(): fp=root/fp
    if not fp.exists(): raise RuntimeError(f'validation page scope file missing: {fp}')
    payload=json.loads(fp.read_text(encoding='utf-8'))
    if payload.get('status')!='READY': raise RuntimeError(f'validation page scope not READY: {fp}')
    return payload

def validation_paths(root: Path):
    if str(os.environ.get('VALIDATION_CACHE_MODE','')).lower()=='full':
        return None
    payload=_load(root)
    return {str(x).lstrip('./') for x in payload.get('paths',[]) if str(x).strip()}

def repair_paths(root: Path):
    payload=_load(root)
    return {str(x).lstrip('./') for x in payload.get('repair_paths',[]) if str(x).strip()}
