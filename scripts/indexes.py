
#!/usr/bin/env python3
"""
Add a `feature_index` field to every feature.properties in a GeoJSON file.

Usage
-----
$ python add_index.py input.json output.json
# or, to overwrite in-place
$ python add_index.py places.geojson places.geojson
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

def add_index_to_features(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mutate `data` in-place, adding feature_index to each feature.properties.
    Returns the same dict for convenience.
    """
    if data.get("type") != "FeatureCollection":
        raise ValueError("Input must be a FeatureCollection")

    features: List[Dict[str, Any]] = data.get("features", [])
    for idx, feat in enumerate(features):
        props = feat.setdefault("properties", {})
        props["feature_index"] = idx
    return data


def main(in_path: str, out_path: str) -> None:
    with Path(in_path).open("r", encoding="utf-8") as f:
        geojson = json.load(f)

    add_index_to_features(geojson)

    with Path(out_path).open("w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"✅ Added feature_index to {len(geojson['features'])} features → {out_path}")


if __name__ == "__main__":
    main("../src/data/vending_machines.json", "../src/data/vending_machines_mod.json")
