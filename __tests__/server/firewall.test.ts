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

const rule = (name: string) => rules.find((r) => r.name === name)!

const matches = (rule: Rule, p: string) =>
  rule.conditionGroup.some((g) => g.conditions.every((c) => (c.op === "pre" ? p.startsWith(c.value) : c.op === "re" ? new RegExp(c.value).test(p) : false)))

describe("the Vercel firewall rules (#197, docs/scraping.md)", () => {
  it("turns on Bot Protection and names every rule once", () => {
    expect(config.firewallEnabled).toBe(true)
    expect(config.managedRules.bot_protection).toEqual({ active: true, action: "challenge" })
    expect(new Set(rules.map((r) => r.name)).size).toBe(rules.length)
  })

  it("blocks a loop of 300 requests a minute on the location data, and lets normal use through", () => {
    const deny = rule("Location data: block heavy scrapers")
    const limit = rule("Location data: rate limit")
    // A rate limit whose limit action denies: a plain "deny" would block every request.
    expect(deny.action.mitigate).toMatchObject({ action: "rate_limit", actionDuration: "1h" })
    expect(deny.action.mitigate.rateLimit).toMatchObject({ window: 60, keys: ["ip"], action: "deny" })
    expect(limit.action.mitigate).toMatchObject({ action: "rate_limit" })
    expect(deny.action.mitigate.rateLimit!.limit).toBeLessThan(300)
    // Panning and searching the map makes a few requests a minute; several people can share an IP.
    expect(limit.action.mitigate.rateLimit!.limit).toBeGreaterThanOrEqual(120)
    expect(limit.action.mitigate.rateLimit!.limit).toBeLessThan(deny.action.mitigate.rateLimit!.limit)
  })

  it("covers every location data route, and only those", () => {
    const routes = apiRoutes()
    const data = routes.filter((p) => matches(rule("Location data: rate limit"), p))
    expect(data).toEqual(expect.arrayContaining(["/api/locations", "/api/locations/near", "/api/locations/x", "/api/geocode", "/api/highlights"]))
    expect(data.every((p) => /^\/api\/(locations|highlights|geocode)(\/|$)/.test(p))).toBe(true)
    expect(routes.every((p) => matches(rule("API: rate limit"), p))).toBe(true)
  })

  it("lets machine clients past the browser checks, first, and nothing else", () => {
    const bypass = rule("Machine clients: skip the browser checks")
    expect(rules[0]).toBe(bypass)
    expect(bypass.action.mitigate.action).toBe("bypass")
    const skipped = apiRoutes().filter((p) => matches(bypass, p))
    expect(skipped).toEqual(expect.arrayContaining(["/api/mcp", "/api/queues/jobs"]))
    expect(skipped.every((p) => /^\/api\/(mcp|identity|jobs|queues)(\/|$)/.test(p))).toBe(true)
    expect(matches(bypass, "/api/locations")).toBe(false)
  })
})
