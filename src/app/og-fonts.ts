import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Noto Sans weights for next/og images. next/og ships one regular font, so the
 * bold headline needs real font files. They're bundled in assets/fonts
 * (subset to Latin, SIL OFL), so the build doesn't depend on Google Fonts.
 * The image routes are prerendered, so reading from disk is safe.
 */
export const OG_WEIGHTS = [500, 700, 800] as const

export async function ogFonts() {
  return Promise.all(
    OG_WEIGHTS.map(async (weight) => ({
      name: "Noto Sans",
      data: await readFile(path.join(process.cwd(), "assets/fonts", `NotoSans-${weight}.ttf`)),
      weight,
      style: "normal" as const,
    })),
  )
}
