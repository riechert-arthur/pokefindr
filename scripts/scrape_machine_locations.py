from bs4 import BeautifulSoup
import cloudscraper
from dotenv import load_dotenv
from supabase import create_client, Client
import os
import requests

load_dotenv()

BASE_URL = "https://support.pokemoncenter.com"
SEED_URL = f"{BASE_URL}/hc/en-us/sections/13360842288916-Pok%C3%A9mon-Automated-Retail-Vending-Machines"
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY")



def init_supabase() -> Client:
    db = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY")
    )
    return db


def init_scraper():
    return cloudscraper.create_scraper()


def get_list_of_links(scraper):
    response = scraper.get(SEED_URL)

    if response.status_code != 200:
        print(f"Failed to fetch the seed URL. Status code: {response.status_code}")
        return []

    parser = BeautifulSoup(response.text, "html.parser")
    articles = parser.select(".article-list-item a")
    links = [article.get("href") for article in articles if article.get("href")]

    # Convert relative links to absolute URLs
    return [f"{BASE_URL}{link}" if link.startswith("/") else link for link in links]


def extract_data_from_row(row):
    columns = row.select("td span")
    if len(columns) >= 4:
        city_state = columns[3].text.split(',')
        city = city_state[0].strip() if len(city_state) > 0 else ""
        state = city_state[1].strip() if len(city_state) > 1 else ""

        return {
            "retailer": columns[0].text.strip(),
            "machineID": columns[1].text.strip(),
            "address": columns[2].text.strip(),
            "city": city,
            "state": state,
        }
    return None


def parse_table(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("tr")
    data = []

    for row in rows:
        row_data = extract_data_from_row(row)
        if row_data:
            data.append(row_data)

    return data


def visit_all_links(scraper, links):
    data = []

    for link in links:
        response = scraper.get(link)

        if response.status_code != 200:
            print(f"Failed to fetch link: {link}. Status code: {response.status_code}")
            continue

        page_data = parse_table(response.text)
        data.extend(page_data)

    return data


def push_to_database(db, data):
    return db.table("Vending Machine Locations").insert(data).execute()


def get_coordinates(location):
    address = location.get("address", "")
    city = location.get("city", "")
    state = location.get("state", "")

    full_address = f"{address}, {city}, {state}"
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(full_address)}.json?access_token={MAPBOX_API_KEY}"

    response = requests.get(url)
    if response.status_code != 200:
        print(f"Error fetching coordinates for {full_address}: {response.status_code}")
        return {**location, "longitude": None, "latitude": None}

    data = response.json()
    features = data.get("features", [])
    if features:
        longitude, latitude = features[0].get("center", [None, None])
    else:
        longitude, latitude = None, None

    return {**location, "longitude": longitude, "latitude": latitude}


def add_coordinates_to_data(data):
    updated_data = []
    for item in data:
        updated_item = get_coordinates(item)
        updated_data.append(updated_item)
    return updated_data


if __name__ == "__main__":
    scraper = init_scraper()
    db = init_supabase()
    if not MAPBOX_API_KEY:
            raise ValueError("Mapbox API key is not set. Please define MAPBOX_API_KEY in your environment variables.")

    links = get_list_of_links(scraper)

    if not links:
        print("No links found. Exiting.")
    else:
        data = visit_all_links(scraper, links)
        data_with_coords = add_coordinates_to_data(data)
        print("Extracted Data:")
        print(data_with_coords)
        result = push_to_database(db, data_with_coords)
        print("Finished pushing to database:", result)
