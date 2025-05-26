#!/usr/bin/env python3
"""
fill_geometry.py

Fill missing or null geometry.coordinates in your GeoJSON by copying
latitude/longitude from properties.coordinates.

Usage:
    python3 scripts/fill_geometry.py [input.json] [output.json]

If output is the same as input, it overwrites the file in-place.
"""
import json
import sys
from pathlib import Path

def load_geojson(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def save_geojson(data, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    if len(sys.argv) < 2:
        print("Usage: fill_geometry.py input.json [output.json]")
        sys.exit(1)
    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else in_path

    geo = load_geojson(in_path)
    features = geo.get('features', [])
    fixed_count = 0

    for feat in features:
        geom = feat.get('geometry')
        coords = None
        # check current geometry
        if geom and isinstance(geom.get('coordinates'), (list, tuple)) and len(geom['coordinates']) == 2:
            continue  # geometry exists, skip
        # try to pull nested coords
        props = feat.get('properties', {})
        nested = props.get('coordinates', {}) or {}
        lat = nested.get('latitude')
        lon = nested.get('longitude')
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            coords = [lon, lat]
        if coords:
            # assign geometry object
            feat['geometry'] = { 'type': 'Point', 'coordinates': coords }
            fixed_count += 1

    if fixed_count > 0:
        save_geojson(geo, out_path)
        print(f"✅ Filled geometry for {fixed_count} features → {out_path}")
    else:
        print("ℹ️  No missing geometries to fill.")

if __name__ == '__main__':
    main()
