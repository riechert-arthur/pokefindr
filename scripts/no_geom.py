#!/usr/bin/env python3
import json
import sys

GEOJSON = "src/data/vending_machines.json"

def main():
    try:
        with open(GEOJSON, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load {GEOJSON}: {e}")
        sys.exit(1)

    missing_geom = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        coord_obj = props.get("coordinates", {}) or {}
        lat = coord_obj.get("latitude")
        lon = coord_obj.get("longitude")
        geom = feat.get("geometry") or {}

        has_nested = isinstance(lat, (int, float)) and isinstance(lon, (int, float))
        has_geom   = isinstance(geom.get("coordinates"), (list, tuple)) and len(geom["coordinates"]) == 2

        if has_nested and not has_geom:
            missing_geom.append({
                "machineID": props.get("machineID"),
                "address":   props.get("address"),
                "lat":       lat,
                "lon":       lon
            })

    if not missing_geom:
        print("✅ All features with nested coords also have geometry!")
    else:
        print(f"⚠️  {len(missing_geom)} features have nested coords but no geometry:\n")
        for f in missing_geom:
            print(f"  • {f['machineID']:10}  {f['address']:<30}  ({f['lat']}, {f['lon']})")

if __name__ == "__main__":
    main()
