#!/usr/bin/env python3
"""
Scrape Pokémon Center vending‐machine locations, batch‐geocode them via Mapbox
using Structured Input, and save the results as a GeoJSON file including
each feature’s match confidence.
"""
import os
import json
import requests
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import cloudscraper

load_dotenv()

BASE_URL = "https://support.pokemoncenter.com"
SEED_URL = (
    f"{BASE_URL}/hc/en-us/sections/13360842288916-"
    "Pok%C3%A9mon-Automated-Retail-Vending-Machines"
)
MAPBOX_API_KEY = "pk.eyJ1IjoiYW1yaWVjaGVydCIsImEiOiJjbWFmc3hzamwwNjBvMmxxMXhuODRmaGwxIn0.MIlz9n_W9XS2ft0T7t7TBw"


def init_scraper():
    return cloudscraper.create_scraper()


def get_list_of_links(scraper):
    resp = scraper.get(SEED_URL)
    resp.raise_for_status()
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
    retailer   = cols[0].text.strip()
    machine_id = cols[1].text.strip()
    address    = cols[2].text.strip()
    city_state = cols[3].text.split(",")
    city  = city_state[0].strip() if city_state else ""
    state = city_state[1].strip() if len(city_state) > 1 else ""
    return {
        "retailer":  retailer,
        "machineID": machine_id,
        "address":   address,
        "city":      city,
        "state":     state,
    }


def parse_table(html):
    soup = BeautifulSoup(html, "html.parser")
    data = []
    for row in soup.select("tr"):
        item = extract_data_from_row(row)
        if item:
            data.append(item)
    return data


def visit_all_links(scraper, links):
    all_data = []
    for url in links:
        resp = scraper.get(url)
        resp.raise_for_status()
        all_data.extend(parse_table(resp.text))
    return all_data


def batch_geocode(locations, chunk_size=50):
    """
    Break locations into chunks of up to `chunk_size`, call Mapbox batch endpoint
    using Structured Input, and return a flat list of per-query FeatureCollections.
    """
    all_results = []
    endpoint    = "https://api.mapbox.com/search/geocode/v6/batch"
    params      = { "access_token": MAPBOX_API_KEY }

    for i in range(0, len(locations), chunk_size):
        batch = locations[i : i + chunk_size]
        queries = []
        for loc in batch:
            # split "123 Main St" into number + street
            parts = loc["address"].split(" ", 1)
            number = parts[0]
            street = parts[1] if len(parts) > 1 else ""
            queries.append({
                "country":        "us",
                "address_number": number,
                "street":         street,
                "place":          loc["city"],
                "region":         loc["state"],
                "limit":          1,
                "autocomplete":   False
            })

        resp = requests.post(endpoint, params=params, json=queries)
        resp.raise_for_status()
        batch_json = resp.json().get("batch", [])
        all_results.extend(batch_json)

    return all_results


def build_geojson(locations, batch_results):
    """
    Merge each original location dict with its matching batch_results entry,
    producing one big FeatureCollection with confidence in properties.match_code.
    """
    features = []
    for loc, result in zip(locations, batch_results):
        feats = result.get("features", [])
        if feats:
            feat       = feats[0]
            geometry   = feat.get("geometry")
            properties = { **loc, **feat.get("properties", {}) }
        else:
            geometry   = None
            properties = loc.copy()
        features.append({
            "type":       "Feature",
            "geometry":   geometry,
            "properties": properties
        })

    return {
        "type":     "FeatureCollection",
        "features": features
    }


def main():
    if not MAPBOX_API_KEY:
        raise RuntimeError("Please set MAPBOX_API_KEY in your environment.")

    scraper = init_scraper()
    links   = get_list_of_links(scraper)
    if not links:
        print("❌ No pages found. Exiting.")
        return

    data = visit_all_links(scraper, links)
    if not data:
        print("❌ No vending-machine entries found.")
        return

    print(f"🔍 Geocoding {len(data)} addresses in batches…")
    batch_results = batch_geocode(data)

    geojson = build_geojson(data, batch_results)
    out_path = "vending_machines.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"✅ Saved {len(geojson['features'])} features (with match confidence) to {out_path}")


if __name__ == "__main__":
    main()