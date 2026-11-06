import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * The logo mark as a data URI with fixed (light-theme) colors, for generated
 * images. Read from public/brand/mark.svg so the geometry lives in one file.
 * The image routes that use it are prerendered at build time.
 */
export const BRAND_MARK_DATA_URI =
  "data:image/svg+xml;base64," + readFileSync(path.join(process.cwd(), "public/brand/mark.svg")).toString("base64")
