/** Only same-site paths: "/login" is fine, "https://evil.example" and "//evil.example" are not. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/"
  return next
}
