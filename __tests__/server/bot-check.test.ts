// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const { checkBotId, config } = vi.hoisted(() => ({ checkBotId: vi.fn(), config: { VERCEL: undefined as string | undefined } }))
vi.mock("server-only", () => ({}))
vi.mock("botid/server", () => ({ checkBotId }))
vi.mock("@/server/edge-config", () => ({ onVercel: () => config.VERCEL === "1" }))

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

  it("guards the routes that return places, and the geocoder", () => {
    expect(BOT_CHECKED_PATHS).toEqual(expect.arrayContaining(["/api/locations", "/api/locations/near", "/api/locations/search", "/api/geocode"]))
  })
})
