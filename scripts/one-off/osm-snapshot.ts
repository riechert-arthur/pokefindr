import path from "node:path"
import { ROOT_DIR } from "../db/env"

/** The OpenStreetMap card shop snapshot (#397): written by db:fetch-osm-shops, read by db:import-osm-shops. */
export const SNAPSHOT_FILE = path.join(ROOT_DIR, "src/data/osm_card_shops.json")
