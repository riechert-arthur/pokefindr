// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "../..")

const { checkBotId, config } = vi.hoisted(() => ({ checkBotId: vi.fn(), config: { VERCEL: undefined as string | undefined } }))
vi.mock("server-only", () => ({}))
vi.mock("botid/server", () => ({ checkBotId }))
vi.mock("@/server/edge-config", () => ({ onVercelProduction: () => config.VERCEL === "1" }))

import { refuseBots } from "@/server/bot-check"
import { BOT_CHECKED_PATHS } from "@/lib/bot-checked-paths"

afterEach(() => {
  checkBotId.mockReset()
  config.VERCEL = undefined
})

describe("BotID on the location data (#198)", () => {
  it("lets a person through and refuses a bot, verified ones included", async () => {
    checkBotId.mockResolvedValueOnce({ isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false })
    expect(await refuseBots()).toBeNull()
    checkBotId.mockResolvedValueOnce({ isHuman: false, isBot: true, isVerifiedBot: true, bypassed: false })
    const res = (await refuseBots())!
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "botBlocked" })
  })

  it("only checks for real on Vercel, so local dev and tests work", async () => {
    checkBotId.mockResolvedValue({ isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false })
    await refuseBots()
    expect(checkBotId).toHaveBeenLastCalledWith({ developmentOptions: { isDevelopment: true } })
    config.VERCEL = "1"
    await refuseBots()
    expect(checkBotId).toHaveBeenLastCalledWith({ developmentOptions: { isDevelopment: false } })
  })

  it("lets the request through when BotID itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    checkBotId.mockRejectedValueOnce(new Error("api.vercel.com unreachable"))
    expect(await refuseBots()).toBeNull()
  })

  it("guards exactly the routes listed, and each listed route checks", () => {
    expect(BOT_CHECKED_PATHS).toEqual(expect.arrayContaining(["/api/locations", "/api/locations/near", "/api/locations/search", "/api/geocode"]))
    for (const path of BOT_CHECKED_PATHS) {
      expect(path, "exact paths only").not.toContain("*")
      expect(readFileSync(join(ROOT, "src/app", path, "route.ts"), "utf8"), path).toContain("await refuseBots()")
    }
  })

  it("only real on a production build on Vercel", async () => {
    vi.unstubAllEnvs()
    const { onVercelProduction } = await vi.importActual<typeof import("@/server/edge-config")>("@/server/edge-config")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("NODE_ENV", "development")
    expect(onVercelProduction()).toBe(false)
    vi.stubEnv("NODE_ENV", "production")
    expect(onVercelProduction()).toBe(true)
    vi.unstubAllEnvs()
  })
})
