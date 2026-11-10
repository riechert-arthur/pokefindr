import "server-only"

export interface RateLimiter {
  /** Takes one token for `key`; false when its bucket is empty. */
  take(key: string): boolean
}

interface Bucket {
  tokens: number
  updated: number
}

/**
 * A token bucket per key, in this server instance's memory: each key gets
 * `burst` requests at once and `perMinute` sustained. With several instances
 * (serverless), each keeps its own buckets, so the real limit is a multiple
 * of this: fine for per-user limits, while the public data routes use the
 * shared limiter (src/server/api-rate-limit.ts, #199).
 */
export function tokenBucket({ perMinute, burst, maxKeys = 10_000, now = Date.now }: { perMinute: number; burst: number; maxKeys?: number; now?: () => number }): RateLimiter {
  const buckets = new Map<string, Bucket>()
  const refillPerMs = perMinute / 60_000
  return {
    take(key) {
      const t = now()
      const b = buckets.get(key) ?? { tokens: burst, updated: t }
      b.tokens = Math.min(burst, b.tokens + (t - b.updated) * refillPerMs)
      b.updated = t
      // Re-insert so the Map's order is least recently used first.
      buckets.delete(key)
      buckets.set(key, b)
      if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!)
      if (b.tokens < 1) return false
      b.tokens -= 1
      return true
    },
  }
}

/** The caller's IP: the first X-Forwarded-For entry (set by Vercel and most proxies), else X-Real-IP. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown"
}

/**
 * The rate-limit key for an IP. IPv6 is keyed on its /64, since one client
 * (a home connection, a VPS) usually holds a whole /64 and could otherwise
 * get a fresh bucket per request. IPv4 (and IPv4-mapped IPv6) is kept as is.
 */
export function rateLimitKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return mapped[1]
  if (!ip.includes(":")) return ip
  const [head, tail = ""] = ip.toLowerCase().split("%")[0].split("::")
  const left = head ? head.split(":") : []
  const right = ip.includes("::") ? (tail ? tail.split(":") : []) : []
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`
}
