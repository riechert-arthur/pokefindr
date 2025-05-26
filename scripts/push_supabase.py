
#!/usr/bin/env python3
import os
import sys
import json
from supabase import create_client, Client

# ─── CONFIG ──────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not (SUPABASE_URL and SUPABASE_KEY):
    print("❌ SUPABASE_URL and SUPABASE_KEY must be set in the environment.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

GEOJSON_PATH = os.getenv("GEOJSON_PATH", "src/data/vending_machines_mod.json")

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
    props = feat.get("properties", {}) or {}

    # machineID is required
    machine_id = props.get("machineID")
    if not machine_id:
        print(f"⚠️  Skipping #{i}: missing machineID")
        continue

    # 1) try nested properties.coordinates
    coord_obj = props.get("coordinates") or {}
    lat = coord_obj.get("latitude")
    lon = coord_obj.get("longitude")

    # 2) fallback to geometry if nested missing/invalid
    if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            lon, lat = coords[0], coords[1]

    # 3) if still invalid, skip
    if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
        key = props.get("name") or props.get("full_address") or props.get("address", "")
        print(f"⚠️  Skipping #{i} ({key}): no valid coordinates found")
        continue

    # Build the WKT geography field
    wkt = f"SRID=4326;POINT({lon} {lat})"

    # Description: prefer full_address, fallback to place_formatted or empty
    description = props.get("full_address") or props.get("place_formatted") or ""

    records.append({
        "machineID":   machine_id,
        "name":        props.get("name") or props.get("address"),
        "description": description,
        "is_official": True,
        "geog":        wkt
    })

if not records:
    print("No valid features to upsert.")
    sys.exit(0)

# ─── Deduplicate In-Memory by machineID ──────────────────
unique = {rec["machineID"]: rec for rec in records}
deduped = list(unique.values())

# ─── Upsert to Supabase (on conflict machineID) ──────────
res = (
    supabase
      .table("locations")
      .upsert(deduped, on_conflict=["machineID"])
      .execute()
)

# ─── Handle Result ────────────────────────────────────────
status = getattr(res, "status_code", None)
error  = getattr(res, "error", None)

if error or (status is not None and status >= 400):
    print("🚨 Upsert failed:", error or res)
    sys.exit(1)

print(f"✅ Upserted {len(deduped)} records (coords updated).")

