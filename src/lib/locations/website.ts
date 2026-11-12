/**
 * A shop's website as a link (#399), or null. Websites come from people's
 * submissions and from OpenStreetMap, so only a web address becomes a link:
 * never `javascript:`, `data:` or anything else. The label is the address
 * without its scheme, `www.` or trailing slash: "example.com/cards".
 */
export function websiteLink(url: string | null | undefined): { href: string; label: string } | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "")
  return { href: parsed.href, label: parsed.host.replace(/^www\./, "") + path }
}
