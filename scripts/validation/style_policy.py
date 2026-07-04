#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared content-quality severity policy for validation scripts.

This policy intentionally separates release-blocking integrity failures from
minor editorial/style drift. Generated citation pages should stay readable,
but normal 4-5 sentence paragraphs are not repo-integrity failures.
"""
from __future__ import annotations
import json, re
from pathlib import Path

SENTENCE_RE = re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')
SPLIT_RE = re.compile(r'(?<=[.!?])(?:[”’"\']*)\s+')

DEFAULT_POLICY = {
    "paragraph_sentence_target": 3,
    "paragraph_sentence_warn_at": 4,
    "paragraph_sentence_fail_at": 8,
    "definition_warn_at": 5,
    "definition_fail_at": 7,
    "max_warning_only_paragraphs_per_page": 999,
    "fail_on_minor_style_drift": False,
}


def _load_policy() -> dict:
    root = Path.cwd()
    path = root / 'data/validation/content_quality_policy.json'
    if not path.exists():
        return dict(DEFAULT_POLICY)
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        out = dict(DEFAULT_POLICY)
        out.update(payload.get('citation_contract', payload))
        return out
    except Exception:
        return dict(DEFAULT_POLICY)

POLICY = _load_policy()


def sentence_count(text: str) -> int:
    text = ' '.join((text or '').split())
    if not text:
        return 0
    # Use the same punctuation-based detector the legacy validators used.
    return len(SENTENCE_RE.findall(text))


def sentence_count_split(text: str) -> int:
    text = ' '.join((text or '').split())
    if not text:
        return 0
    return len([x for x in SPLIT_RE.split(text) if x.strip()])


def paragraph_sentence_severity(count: int, *, paragraph_kind: str = 'normal') -> str:
    """Return PASS/WARN/FAIL for a paragraph sentence count.

    Integrity remains strict for extreme walls of text, but ordinary 4-5
    sentence paragraphs are warnings only.
    """
    fail_at = int(POLICY.get('paragraph_sentence_fail_at', 8))
    warn_at = int(POLICY.get('paragraph_sentence_warn_at', 4))
    if paragraph_kind == 'definition':
        fail_at = int(POLICY.get('definition_fail_at', fail_at))
        warn_at = int(POLICY.get('definition_warn_at', warn_at))
    if count >= fail_at:
        return 'FAIL'
    if count >= warn_at:
        return 'WARN'
    return 'PASS'


def paragraph_sentence_message(path: str, index: int | None, count: int, *, paragraph_kind: str = 'normal') -> str:
    label = f'paragraph {index + 1}' if index is not None else 'paragraph'
    target = int(POLICY.get('paragraph_sentence_target', 3))
    return f'{path}: {label} has {count} sentences; target is {target}, treated as {paragraph_sentence_severity(count, paragraph_kind=paragraph_kind)} by content-quality policy'
