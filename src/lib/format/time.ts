/** "just now", "5 min ago", "3 hr ago", "2 days ago", then "Mar 4" (and the year once it's not this year). */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const s = Math.max(0, (now.getTime() - then.getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  const days = Math.floor(s / 86400)
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) })
}
