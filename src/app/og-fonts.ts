/**
 * Noto Sans weights for next/og images. next/og ships one regular font, so the
 * bold headline needs real font files. Fetched from Google Fonts when the image
 * is generated (at build time for static images). Without a browser user agent,
 * Google serves TTF, which next/og can read.
 */
async function loadWeight(weight: 500 | 700 | 800): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans:wght@${weight}&display=swap`)).text()
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1]
  if (!url) throw new Error(`No TTF for Noto Sans ${weight}`)
  return (await fetch(url)).arrayBuffer()
}

export async function ogFonts() {
  const weights = [500, 700, 800] as const
  const data = await Promise.all(weights.map(loadWeight))
  return weights.map((weight, i) => ({ name: "Noto Sans", data: data[i], weight, style: "normal" as const }))
}
