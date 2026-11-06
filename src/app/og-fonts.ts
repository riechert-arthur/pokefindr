/**
 * Noto Sans weights for next/og images. next/og ships one regular font, so the
 * bold headline needs real font files. Fetched from Google Fonts when the image
 * is generated (at build time for static images). Without a browser user agent,
 * Google serves TTF, which next/og can read.
 *
 * If Google Fonts can't be reached (offline build, rate limit), the image uses
 * next/og's built-in font instead of failing the build.
 */
async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

async function loadWeight(weight: 500 | 700 | 800): Promise<ArrayBuffer> {
  const css = await (await fetchOk(`https://fonts.googleapis.com/css2?family=Noto+Sans:wght@${weight}&display=swap`)).text()
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1]
  if (!url) throw new Error(`No TTF for Noto Sans ${weight}`)
  return (await fetchOk(url)).arrayBuffer()
}

export async function ogFonts() {
  const weights = [500, 700, 800] as const
  try {
    const data = await Promise.all(weights.map(loadWeight))
    return weights.map((weight, i) => ({ name: "Noto Sans", data: data[i], weight, style: "normal" as const }))
  } catch (error) {
    console.warn(`og-fonts: using the default font (${error instanceof Error ? error.message : error})`)
    return []
  }
}
