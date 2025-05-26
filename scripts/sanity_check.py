#!/usr/bin/env python3
"""
scripts/sanity_check.py

Perform sanity checks on the weekly vending-machines update:
- Ensure not too many entries were removed relative to the old dataset
- Ensure not too many entries were flagged relative to the new dataset

Usage:
    python3 scripts/sanity_check.py

Exits with 0 on success, 1 on failure.
"""
import json
import sys

# Configurable thresholds
MAX_REMOVAL_FRACTION = 0.10   # no more than 10% of old entries removed
MAX_FLAGGED_FRACTION = 0.10   # no more than 10% flagged (removed)

# Paths (relative to repo root)
MERGED_JSON = "src/data/vending_machines.json"
DIFF_JSON   = "src/data/vending_machines_diff.json"


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Failed to load {path}: {e}")
        sys.exit(1)


def main():
    merged_data = load_json(MERGED_JSON)
    diff_data   = load_json(DIFF_JSON)

    new_count = len(merged_data.get("features", []))
    added     = len(diff_data.get("added", []))
    updated   = len(diff_data.get("updated", []))
    removed   = len(diff_data.get("removed", []))

    # old_count = new_count + removed
    old_count = new_count + removed

    removal_fraction = removed / old_count if old_count else 0
    flagged_fraction = removed / new_count if new_count else 0

    print(f"Old count     : {old_count}")
    print(f"New count     : {new_count}")
    print(f"Added         : {added}")
    print(f"Updated       : {updated}")
    print(f"Removed       : {removed}")
    print(f"Removal frac  : {removal_fraction:.2%} (threshold: {MAX_REMOVAL_FRACTION:.2%})")
    print(f"Flagged frac  : {flagged_fraction:.2%} (threshold: {MAX_FLAGGED_FRACTION:.2%})")

    if removal_fraction > MAX_REMOVAL_FRACTION:
        print(f"❌ Too many entries removed ({removal_fraction:.2%}) exceeds threshold.")
        sys.exit(1)
    if flagged_fraction > MAX_FLAGGED_FRACTION:
        print(f"❌ Too many flagged ({flagged_fraction:.2%}) exceeds threshold.")
        sys.exit(1)

    print("✅ Sanity checks passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
