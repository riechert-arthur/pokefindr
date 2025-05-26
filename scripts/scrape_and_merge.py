
#!/usr/bin/env python3
"""
scripts/scrape_and_merge.py

1) Scrape & batch-geocode
2) Merge with old JSON (preserving _manual_override)
3) Add feature_index to each feature
4) Write out:
     - vending_machines.json         (merged)
     - vending_machines_mod.json     (merged + indexed)
     - vending_machines_diff.json    (diff summary)
     - vending_machines_flagged.json (removed features)
"""
import os
import json
import sys
import requests
import cloudscraper
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ───────────────────────────────────────────────
BASE_URL       = "https://support.pokemoncenter.com"
SEED_URL       = (
    f"{BASE_URL}/hc/en-us/sections/13360842288916-"
    "Pok%C3%A9mon-Automated-Retail-Vending-Machines"
)
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY")
OLD_JSON       = "src/data/vending_machines.json"
OUT_JSON       = "src/data/vending_machines.json"
MOD_JSON       = "src/data/vending_machines_mod.json"
DIFF_JSON      = "src/data/vending_machines_diff.json"
FLAG_JSON      = "src/data/vending_machines_flagged.json"
CHUNK_SIZE     = 50

if not MAPBOX_API_KEY:
    sys.exit("❌ Please set MAPBOX_API_KEY in env")

# ─── SCRAPER HELPERS ──────────────────────────────────────
def init_scraper():
    return cloudscraper.create_scraper()

def get_list_of_links(scraper):
    resp = scraper.get(SEED_URL); resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    anchors = soup.select(".article-list-item a[href]")
    return [
        (BASE_URL + a["href"]) if a["href"].startswith("/") else a["href"]
        for a in anchors
    ]

def extract_data_from_row(row):
    cols = row.select("td span")
    if len(cols) < 4:
        return None
    retailer = cols[0].text.strip()
    mid      = cols[1].text.strip()
    addr     = cols[2].text.strip()
    city_st  = cols[3].text.split(",",1)
    city     = city_st[0].strip()
    state    = city_st[1].strip() if len(city_st)>1 else ""
    return {"retailer":retailer,"machineID":mid,"address":addr,"city":city,"state":state}

def parse_table(html):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for tr in soup.select("tr"):
        d = extract_data_from_row(tr)
        if d: out.append(d)
    return out

def visit_all_links(scraper, links):
    all_data = []
    for url in links:
        resp = scraper.get(url); resp.raise_for_status()
        all_data.extend(parse_table(resp.text))
    return all_data

def batch_geocode(locs):
    endpoint = "https://api.mapbox.com/search/geocode/v6/batch"
    params   = {"access_token": MAPBOX_API_KEY}
    results  = []
    for i in range(0, len(locs), CHUNK_SIZE):
        batch = locs[i:i+CHUNK_SIZE]
        q = []
        for loc in batch:
            parts = loc["address"].split(" ",1)
            q.append({
                "country":"us",
                "address_number":parts[0],
                "street":parts[1] if len(parts)>1 else "",
                "place":loc["city"],
                "region":loc["state"],
                "limit":1,
                "autocomplete":False
            })
        r = requests.post(endpoint, params=params, json=q)
        r.raise_for_status()
        results.extend(r.json().get("batch", []))
    return results

def build_geojson(locs, batch_results):
    feats = []
    for loc, res in zip(locs, batch_results):
        flist = res.get("features", [])
        if flist:
            f0   = flist[0]
            geom = f0.get("geometry")
            props= {**loc, **f0.get("properties", {})}
        else:
            geom, props = None, loc.copy()
        feats.append({"type":"Feature","geometry":geom,"properties":props})
    return {"type":"FeatureCollection","features":feats}

# ─── MERGE / DIFF HELPERS ─────────────────────────────────
def load_old():
    if os.path.isfile(OLD_JSON):
        return json.load(open(OLD_JSON, encoding="utf-8"))
    return {"type":"FeatureCollection","features":[]}

def get_mid(feat):
    return feat["properties"].get("machineID")

def get_accuracy(feat):
    return feat["properties"].get("coordinates", {}).get("accuracy")

def accuracy_score(a):
    order={"rooftop":4,"parcel":3,"point":2,"interpolated":1,"approximate":0,None:-1}
    return order.get(a, -1)

def merge_and_diff(old_feats, new_feats):
    old_map = {get_mid(f):f for f in old_feats}
    new_map = {get_mid(f):f for f in new_feats}

    # preserve manual overrides
    for mid, of in old_map.items():
        if of["properties"].get("_manual_override"):
            new_map[mid] = of

    merged = []; diff={"added":[], "updated":[], "removed":[]}

    # additions & updates
    for mid, nf in new_map.items():
        of = old_map.get(mid)
        if of is None:
            merged.append(nf); diff["added"].append(nf)
        else:
            old_acc, new_acc = get_accuracy(of), get_accuracy(nf)
            if accuracy_score(new_acc) > accuracy_score(old_acc):
                merged.append(nf)
                diff["updated"].append({"machineID":mid,"old":old_acc,"new":new_acc})
            else:
                merged.append(of)

    # removals (non-manual)
    for mid, of in old_map.items():
        if mid not in new_map and not of["properties"].get("_manual_override"):
            diff["removed"].append(of)

    return merged, diff

# ─── MAIN ────────────────────────────────────────────────
def main():
    print("🔍 Scraping…")
    sc = init_scraper()
    links = get_list_of_links(sc)
    data  = visit_all_links(sc, links)
    if not data:
        sys.exit("❌ No entries scraped")

    print(f"🔍 Geocoding {len(data)}…")
    batch = batch_geocode(data)
    geo   = build_geojson(data, batch)

    old = load_old()
    merged, diff = merge_and_diff(old["features"], geo["features"])

    # add feature_index
    for idx, feat in enumerate(merged):
        feat.setdefault("properties", {})["feature_index"] = idx

    # ensure output dir
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

    # write merged
    with open(OUT_JSON,  "w", encoding="utf-8") as f:
        json.dump({"type":"FeatureCollection","features":merged}, f, indent=2)

    # write indexed copy
    with open(MOD_JSON,  "w", encoding="utf-8") as f:
        json.dump({"type":"FeatureCollection","features":merged}, f, indent=2)

    # write diff + flagged
    with open(DIFF_JSON, "w", encoding="utf-8") as f:
        json.dump(diff, f, indent=2)
    with open(FLAG_JSON, "w", encoding="utf-8") as f:
        json.dump({"type":"FeatureCollection","features":diff["removed"]}, f, indent=2)

    # summary
    total = len(merged)
    a,u,r = map(len, (diff["added"], diff["updated"], diff["removed"]))
    missing = sum(1 for f in merged if f["geometry"] is None)
    print(f"✅ Merged: {total} features")
    print(f"   • Added:   {a}")
    print(f"   • Updated: {u}")
    print(f"   • Removed: {r}")
    print(f"ℹ️  {missing}/{total} lack geometry")
    print(f"🚩 Flagged {r} removed → {FLAG_JSON}")

if __name__=="__main__":
    main()

