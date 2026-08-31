"""The Python half of scripts/lib/repo_walk.cjs; read the reasoning there.

In short: `.claude/worktrees/<id>` is a complete second checkout of this repo
inside the working tree, and a walker that descends into it rewrites another
checkout's pages and counts them as its own work. Both files must list the same
directories, and scripts/validators/validate_repo_walk_boundary.mjs fails the
build if they disagree.
"""
from __future__ import annotations
from pathlib import Path
from typing import Callable, Iterable, Optional

IGNORED_DIRS = (
    '.claude',            # agent worktrees: a complete second checkout of this repo
    '.git',
    'node_modules',
    '.build',
    '.pages-output',
    '.wrangler',
    '.clarity',
    '.validation-cache',
    '.validation-runtime',
    'coverage',
    'test-results',
    'playwright-report',
    'releases',
    '__pycache__',
    'scripts/_vendor',
)
IGNORED_SET = frozenset(IGNORED_DIRS)


def is_ignored_dir(name: str, rel_path: Optional[str] = None) -> bool:
    """Should a walk skip this directory?"""
    if name in IGNORED_SET:
        return True
    if not rel_path:
        return False
    rel = str(rel_path).replace('\\', '/').lstrip('./')
    return any(rel == d or rel.startswith(d + '/') or d in rel.split('/') for d in IGNORED_DIRS)


def walk_files(root: Path, predicate: Optional[Callable[[Path], bool]] = None) -> Iterable[Path]:
    """Recursive file walk that cannot wander into another checkout."""
    root = Path(root)
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            rel = entry.relative_to(root).as_posix()
            if entry.is_dir():
                if not is_ignored_dir(entry.name, rel):
                    stack.append(entry)
            elif entry.is_file() and (predicate is None or predicate(entry)):
                yield entry
