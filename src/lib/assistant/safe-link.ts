/**
 * Where an assistant card may link: our own pages (a path, never `//host`)
 * and Google Maps directions. Anything else, including `javascript:` and
 * other sites, gets no link. Model output never becomes a link; only card
 * fields the tools built pass through here.
 */
export function safeHref(href: string | null | undefined): string | null {
  // Browsers drop tabs and newlines inside URLs ("/\t/evil" opens //evil), so any whitespace or control character is refused.
  if (!href || /[\u0000-\u0020\u007f-\u009f]/.test(href)) return null
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return href
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol === "https:" && url.hostname === "www.google.com" && url.pathname.startsWith("/maps/dir/")) return url.toString()
  return null
}
