#!/usr/bin/env python3
import os
import json
from supabase import create_client, Client

# ─── CONFIG ──────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

GEOJSON_PATH = os.getenv("GEOJSON_PATH", "../src/data/vending_machines_mod.json")

# ─── Load GeoJSON ─────────────────────────────────────────
try:
    with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
        geo = json.load(f)
except Exception as e:
    print(f"Failed to load '{GEOJSON_PATH}': {e}")
    sys.exit(1)

# ─── Build Records ────────────────────────────────────────
records = []
for i, feat in enumerate(geo.get("features", [])):
    # Safely get properties dict
    props = feat.get("properties") or {}

    # Determine key: prefer name, fallback to full address, then to address field
    key = props.get("name") or props.get("full_address") or props.get("address")
    if not key:
        print(f"⚠️ Skipping #{i}: missing name/full_address/address")
        continue

    # Initialize lat/lon
    lat = lon = None

    # 1) Try nested properties.coordinates
    nested = props.get("coordinates") or {}
    if isinstance(nested, dict):
        lat = nested.get("latitude")
        lon = nested.get("longitude")

    # 2) Fallback to geometry.coordinates if nested coords invalid
    if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            lon, lat = coords[0], coords[1]

    # If still invalid, skip
    if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
        print(f"⚠️ Skipping #{i} ({key}): no valid coordinates found")
        continue

    # Create WKT point
    wkt = f"SRID=4326;POINT({lon} {lat})"

    # Description: full_address > place_formatted > empty string
    description = props.get("full_address") or props.get("place_formatted") or ""

    records.append({
        "name":         key,
        "description": description,
        "is_official": True,
        "geog":        wkt
    })

if not records:
    print("No valid features to upsert.")
    sys.exit(0)

# ─── Deduplicate In-Memory by key ─────────────────────────
unique = {rec["name"]: rec for rec in records}
deduped = list(unique.values())

# ─── Upsert to Supabase (on conflict of key) ─────────────
res = (
    supabase
    .table("locations")
    .upsert(deduped, on_conflict=["name"])
    .execute()
)

# ─── Handle Result ────────────────────────────────────────
status = getattr(res, "status_code", None)
error  = getattr(res, "error", None)
if error or (status is not None and status >= 400):
    print("🚨 Upsert failed:", error or res)
    sys.exit(1)

print(f"✅ Upserted {len(deduped)} records (coords updated).")
