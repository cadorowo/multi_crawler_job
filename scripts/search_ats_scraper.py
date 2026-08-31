#!/usr/bin/env python3
"""Emit normalized records from the local ats-scrapers dataset as JSON.

The Node worker invokes this bridge through `uv run --directory`, keeping the
Python dependency and the source dataset owned by the ats_scraper workspace.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

import pandas as pd
from ats_scrapers import search


def value(record: dict[str, Any], key: str) -> Any:
    item = record.get(key)
    return None if item is None else item


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--location")
    parser.add_argument("--ats", help="Hosted dataset source (for example greenhouse or lever)")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()

    frame = search(
        query=args.query,
        location=args.location or None,
        ats=args.ats or None,
        remote=True if args.remote else None,
        limit=args.limit,
    )
    # Cast first: numeric DataFrame columns otherwise keep NaN despite `where`.
    frame = frame.astype(object).where(pd.notna(frame), None)
    records = frame.to_dict(orient="records")
    print(json.dumps(records, default=str))


if __name__ == "__main__":
    main()
