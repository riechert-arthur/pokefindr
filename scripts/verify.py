#!/usr/bin/env python3
"""
Check that the number of vending machines scraped matches the number of valid entries
in vending_machines.json.

Usage: python check_counts.py

This script re-runs the scraping pipeline (without geocoding) to count raw entries,
then compares it to the number of features in vending_machines.json.
"""
import os
import sys
import json
import cloudscraper
from bs4 import BeautifulSoup
import requests

# --- Configuration: adjust these if your script locations differ ---
BASE_URL = "https://support.pokemoncenter.com"
SEED_URL = (
    f"{BASE_URL}/hc/en-us/sections/13360842288916-"
    "Pok%C3%A9mon-Automated-Retail-Vending-Machines"
)
MAIN_JSON = "vending_machines.json"

# --- Scraping functions ---

def init_scraper():
    return cloudscraper.create_scraper()


def get_list_of_links(scraper):
    resp = scraper.get(SEED_URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    anchors = soup.select(".article-list-item a[href]")
    links = []
    for a in anchors:
        href = a["href"]
        if href.startswith("/"):
            links.append(BASE_URL + href)
        else:
            links.append(href)
    return links


def extract_data_from_row(row):
    cols = row.select("td span")
    if len(cols) < 4:
        return None
    return True  # just count rows with >=4 cols


def parse_table(html):
    soup = BeautifulSoup(html, "html.parser")
    count = 0
    for row in soup.select("tr"):
        if extract_data_from_row(row):
            count += 1
    return count


def visit_all_links(scraper, links):
    total = 0
    for url in links:
        resp = scraper.get(url)
        resp.raise_for_status()
        total += parse_table(resp.text)
    return total


def main():
    # 1) raw scraped count
    scraper = init_scraper()
    try:
        links = get_list_of_links(scraper)
    except Exception as e:
        print(f"❌ Failed to fetch links: {e}")
        sys.exit(1)

    scraped_count = visit_all_links(scraper, links)

    # 2) valid entries count
    if not os.path.exists(MAIN_JSON):
        print(f"❌ {MAIN_JSON} not found.")
        sys.exit(1)
    with open(MAIN_JSON, encoding="utf-8") as f:
        vm = json.load(f)
    valid_count = len(vm.get("features", []))

    # 3) report
    print(f"Scraped count         : {scraped_count}")
    print(f"Valid JSON entries    : {valid_count}")
    if scraped_count == valid_count:
        print("✅ Counts match.")
        sys.exit(0)
    else:
        diff = scraped_count - valid_count
        print(f"❌ Counts differ by {diff}.")
        sys.exit(1)

if __name__ == "__main__":
    main()
