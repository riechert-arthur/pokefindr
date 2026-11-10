/**
 * Where the basemap's style, tiles and glyphs come from (OpenFreeMap). Its
 * own module, without the map library, so the server can preconnect to it
 * (the /map page, #298) while the map's code is still downloading.
 */
export const TILE_ORIGIN = "https://tiles.openfreemap.org"
