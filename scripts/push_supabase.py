
#!/usr/bin/env python3
import os, json
from supabase import create_client, Client

SUPABASE_URL = "url"
SUPABASE_KEY = "key"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

GEOJSON_PATH = "../src/data/vending_machines.json"

with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
    geo = json.load(f)

records = []
for i, feature in enumerate(geo.get("features", [])):
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates")
    if not (isinstance(coords, list) and len(coords) == 2):
        print(f"⚠️  Skipping feature {i}, no valid coords")
        continue

    lon, lat = coords
    wkt = f"SRID=4326;POINT({lon} {lat})"

    records.append({
        "name": feature.get("properties", {}).get("name"),
        "description": feature.get("properties", {}).get("description"),
        "is_official": True,
        "geog": wkt
    })

if not records:
    print("No valid features to insert.")
    exit(0)

res = supabase.table("locations").insert(records).execute()

if getattr(res, "status_code", 0) >= 400:
    print("🚨 Insert failed:", getattr(res, "error", res))
else:
    print(f"✅ Inserted {len(records)} rows into locations.")

