/** Profile picture limits (#290), shared by the settings page (checked before upload) and the API (checked again). */

/** The largest upload accepted: 2 MB. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
/** Stored pictures are this many pixels square. */
export const AVATAR_SIZE = 256
/** What the file picker offers. The server checks the file's bytes, not this. */
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
