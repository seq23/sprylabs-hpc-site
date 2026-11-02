"""The Python half of scripts/lib/word_floor.cjs; read the reasoning there.

Owner ruling 2 Nov 2026 (config/word_count_policy.json): over a word limit
never fails; under a floor fails only below (1 - cushion) of it.
"""
from __future__ import annotations
import json
from pathlib import Path

POLICY_PATH = Path(__file__).resolve().parents[2] / 'config' / 'word_count_policy.json'
_POLICY = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
UNDER_FLOOR_CUSHION = float(_POLICY['under_floor_cushion'])
if not (0 <= UNDER_FLOOR_CUSHION < 1):
    raise ValueError(f'[word-floor] {POLICY_PATH}: under_floor_cushion must be in [0, 1), got {UNDER_FLOOR_CUSHION}')


def hard_floor(floor) -> float:
    return float(floor) * (1 - UNDER_FLOOR_CUSHION)


def floor_verdict(words: int, floor) -> str:
    f = float(floor or 0)
    if f <= 0 or words >= f:
        return 'pass'
    return 'cushion' if words >= hard_floor(f) else 'fail'


def limit_verdict(words: int, maximum) -> str:
    m = float(maximum or 0)
    return 'over' if m > 0 and words > m else 'pass'
