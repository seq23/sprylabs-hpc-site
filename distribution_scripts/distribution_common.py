#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "distribution.config.json"
EXAMPLE_CONFIG_PATH = ROOT / "distribution.config.example.json"


def load_config() -> dict:
    path = CONFIG_PATH if CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def write_config(config: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def read_urls(path: str | Path) -> list[str]:
    p = Path(path)
    return [line.strip() for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def filter_urls_for_host(urls: list[str], host: str) -> list[str]:
    return [url for url in urls if urlparse(url).netloc.lower() == host.lower()]
