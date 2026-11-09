// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { oauthProviders } from "@/server/auth/providers"

describe("oauthProviders", () => {
  it("offers the providers that are configured, Google first", () => {
    expect(oauthProviders({ GOOGLE_CLIENT_ID: undefined, DISCORD_CLIENT_ID: undefined })).toEqual([])
    expect(oauthProviders({ GOOGLE_CLIENT_ID: "g", DISCORD_CLIENT_ID: undefined })).toEqual(["google"])
    expect(oauthProviders({ GOOGLE_CLIENT_ID: "g", DISCORD_CLIENT_ID: "d" })).toEqual(["google", "discord"])
  })
})
