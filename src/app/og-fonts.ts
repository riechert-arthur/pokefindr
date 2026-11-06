/**
 * Noto Sans weights for next/og images. next/og ships one regular font, so the
 * bold headline needs real font files. Fetched from Google Fonts when the image
 * is generated (at build time for static images). Without a browser user agent,
 * Google serves TTF, which next/og can read.
 *
 * If Google Fonts can't be reached, errors or stalls (each request times out),
 * the image uses next/og's built-in font instead of failing the build.
 */
const WEIGHTS = [500, 700, 800] as const
const TIMEOUT_MS = 10_000

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

/** The TTF URL for each weight, from one css2 request. */
export function ttfUrls(css: string): Map<number, string> {
  const urls = new Map<number, string>()
  for (const face of css.split("@font-face").slice(1)) {
    const weight = Number(face.match(/font-weight:\s*(\d+)/)?.[1])
    const url = face.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1]
    if (weight && url) urls.set(weight, url)
  }
  return urls
}

export async function ogFonts() {
  try {
    const css = await (await fetchOk(`https://fonts.googleapis.com/css2?family=Noto+Sans:wght@${WEIGHTS.join(";")}&display=swap`)).text()
    const urls = ttfUrls(css)
    const data = await Promise.all(
      WEIGHTS.map(async (weight) => {
        const url = urls.get(weight)
        if (!url) throw new Error(`No TTF for Noto Sans ${weight}`)
        return (await fetchOk(url)).arrayBuffer()
      }),
    )
    return WEIGHTS.map((weight, i) => ({ name: "Noto Sans", data: data[i], weight, style: "normal" as const }))
  } catch (error) {
    console.warn(`og-fonts: using the default font (${error instanceof Error ? error.message : error})`)
    return []
  }
}
