#!/usr/bin/env python3
"""
Compare Supabase 'locations' entries against local GeoJSON features.

- Fetches all rows from the 'locations' table via Supabase REST
- Loads local vending_machines.json
- Matches entries by key (name or address)
- Compares coordinates from Supabase geog vs. GeoJSON coords
- Reports missing in either source and any coordinate mismatches
"""
import os
import sys
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

GEOJSON_PATH = os.getenv("GEOJSON_PATH", "../src/data/vending_machines_mod.json")
EPSILON = 1e-6  # degrees tolerance

if not (SUPABASE_URL and SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set.")
    sys.exit(1)

# ─── Initialize Supabase client ───────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Fetch all location rows ──────────────────────────────
resp = supabase.table("locations").select("name, geog").execute()
if getattr(resp, 'error', None):
    print(f"❌ Supabase error: {resp.error}")
    sys.exit(1)
rows = resp.data or []

# ─── Parse Supabase coords ─────────────────────────────────
sb_map = {}
for r in rows:
    key = r.get("name")
    if not key:
        continue
    geog = r.get("geog")
    lon = lat = None
    # geog may be GeoJSON or WKT
    if isinstance(geog, dict):
        coords = geog.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            lon, lat = coords[0], coords[1]
    elif isinstance(geog, str) and geog.startswith("SRID=4326;POINT("):
        # parse WKT: SRID=4326;POINT(lon lat)
        try:
            pt = geog.split("POINT(")[1].rstrip(")")
            lon, lat = map(float, pt.split())
        except Exception:
            pass
    if lon is None or lat is None:
        print(f"⚠️ Supabase: cannot parse geog for '{key}'")
        continue
    sb_map[key] = (lat, lon)

# ─── Load local GeoJSON ───────────────────────────────────
try:
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geo = json.load(f)
except Exception as e:
    print(f"❌ Failed to load GeoJSON: {e}")
    sys.exit(1)

gj_map = {}
for feat in geo.get("features", []):
    props = feat.get("properties") or {}
    key = props.get("name") or props.get("address")
    if not key:
        continue
    # nested coords
    nested = props.get("coordinates") or {}
    lat = nested.get("latitude")
    lon = nested.get("longitude")
    # fallback to geometry
    if not (isinstance(lat, (int,float)) and isinstance(lon, (int,float))):
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if isinstance(coords, (list,tuple)) and len(coords) == 2:
            lon, lat = coords[0], coords[1]
    if not (isinstance(lat, (int,float)) and isinstance(lon, (int,float))):
        print(f"⚠️ GeoJSON: cannot parse coords for '{key}'")
        continue
    gj_map[key] = (lat, lon)

# ─── Compare maps ─────────────────────────────────────────
all_keys = set(sb_map) | set(gj_map)
missing_in_sb = []
missing_in_gj = []
mismatches = []

for key in sorted(all_keys):
    sb = sb_map.get(key)
    gj = gj_map.get(key)
    if sb and not gj:
        missing_in_gj.append(key)
    elif gj and not sb:
        missing_in_sb.append(key)
    else:
        # both exist: compare difference
        dlat = abs(sb[0] - gj[0])
        dlon = abs(sb[1] - gj[1])
        if dlat > EPSILON or dlon > EPSILON:
            mismatches.append((key, sb, gj))

# ─── Report ───────────────────────────────────────────────


if missing_in_sb:
    print("\nEntries in GeoJSON but not Supabase:")
    for k in missing_in_sb:
        print(f"  - {k}")
if missing_in_gj:
    print("\nEntries in Supabase but not GeoJSON:")
    for k in missing_in_gj:
        print(f"  - {k}")
if mismatches:
    print("\nCoordinate mismatches:")
    for k, sbc, gjc in mismatches:
        print(f"  - {k}: Supabase={sbc}, GeoJSON={gjc}")

print("Comparison Summary:")
print(f"  Total supabase rows   : {len(sb_map)}")
print(f"  Total geojson features: {len(gj_map)}")
print(f"  Keys missing in supabase: {len(missing_in_sb)}")
print(f"  Keys missing in geojson : {len(missing_in_gj)}")
print(f"  Coordinate mismatches   : {len(mismatches)}")

print("Done.")
