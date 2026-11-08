/**
 * How long to wait for a location before giving up. Firefox calls neither
 * geolocation callback when the viewer dismisses the permission prompt, and
 * the geolocation timeout only starts once permission is granted. Here, not
 * in the map's LocateControl, so pages without the map don't load it.
 */
export const LOCATE_GIVE_UP_MS = 15_000
