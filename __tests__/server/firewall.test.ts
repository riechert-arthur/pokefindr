// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const config = JSON.parse(readFileSync(path.join(ROOT, "infra/vercel-firewall.json"), "utf8"))

type Rule = { name: string; conditionGroup: { conditions: { type: string; op: string; value: string }[] }[]; action: { mitigate: { action: string; rateLimit?: { limit: number; window: number; keys: string[] } } } }
const rules: Rule[] = config.rules

/** The API's route paths, from the folders under src/app/api. */
function apiRoutes(dir = path.join(ROOT, "src/app/api"), prefix = "/api"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (!statSync(full).isDirectory()) return name === "route.ts" ? [prefix] : []
    return apiRoutes(full, `${prefix}/${name.replace(/^\[\.*(\w+)\]$/, "x")}`)
  })
}

const matches = (rule: Rule, p: string) =>
  rule.conditionGroup.some((g) => g.conditions.every((c) => (c.op === "pre" ? p.startsWith(c.value) : c.op === "re" ? new RegExp(c.value).test(p) : false)))

describe("the Vercel firewall rules (#197, docs/scraping.md)", () => {
  it("turns on Bot Protection and names every rule once", () => {
    expect(config.firewallEnabled).toBe(true)
    expect(config.managedRules.bot_protection).toEqual({ active: true, action: "challenge" })
    expect(new Set(rules.map((r) => r.name)).size).toBe(rules.length)
  })

  it("blocks a loop of 300 requests a minute on the location data, and lets normal use through", () => {
    const data = rules.filter((r) => matches(r, "/api/locations"))
    const deny = data.find((r) => r.action.mitigate.action === "deny")!
    const limit = data.find((r) => r.action.mitigate.action === "rate_limit")!
    expect(deny.action.mitigate.rateLimit).toMatchObject({ window: 60, keys: ["ip"] })
    expect(deny.action.mitigate.rateLimit!.limit).toBeLessThan(300)
    // Panning and searching the map makes a few requests a minute; several people can share an IP.
    expect(limit.action.mitigate.rateLimit!.limit).toBeGreaterThanOrEqual(120)
    expect(limit.action.mitigate.rateLimit!.limit).toBeLessThan(deny.action.mitigate.rateLimit!.limit)
  })

  it("covers every location data route, and only those", () => {
    const routes = apiRoutes()
    const data = routes.filter((p) => matches(rules[0], p))
    expect(data).toEqual(expect.arrayContaining(["/api/locations", "/api/locations/near", "/api/locations/x", "/api/geocode", "/api/highlights"]))
    expect(data.every((p) => /^\/api\/(locations|highlights|geocode)/.test(p))).toBe(true)
    expect(routes.every((p) => matches(rules[rules.length - 1], p))).toBe(true)
  })
})
