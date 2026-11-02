import { describe, it, expect } from "vitest"
import { sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { profiles, subscriptions } from "@/server/db/schema"
import {
  UsernameTakenError,
  getOnboardingState,
  getProfile,
  getSessionTier,
  updateProfile,
} from "@/server/services/users"

describe("users service", () => {
  it("reads and updates a profile", async () => {
    const id = crypto.randomUUID()
    await getDb().insert(profiles).values({ id, username: "pending" })

    expect(await getOnboardingState(id)).toEqual({ onboarded: false })
    expect(await updateProfile(id, { username: "ash", fullName: "Ash K", onboarded: true })).toBe(true)
    expect(await getProfile(id)).toEqual({ id, username: "ash", full_name: "Ash K", metadata: null })
    expect(await getOnboardingState(id)).toEqual({ onboarded: true })
  })

  it("reports missing profiles", async () => {
    const missing = crypto.randomUUID()
    expect(await getProfile(missing)).toBeNull()
    expect(await updateProfile(missing, { username: "x" })).toBe(false)
    expect(await updateProfile(missing, {})).toBe(true) // nothing to change
  })

  it("maps a duplicate username to UsernameTakenError", async () => {
    const db = getDb()
    // Production enforces unique usernames; add the same rule to this test DB.
    await db.execute(sql`create unique index if not exists profiles_username_test_key on profiles (username)`)
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()]
    await db.insert(profiles).values([
      { id: a, username: "ash" },
      { id: b, username: "misty" },
    ])
    await expect(updateProfile(b, { username: "ash" })).rejects.toBeInstanceOf(UsernameTakenError)
    await db.execute(sql`drop index profiles_username_test_key`)
  })

  it("derives the session tier from subscriptions", async () => {
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(profiles).values({ id, username: "brock" })
    expect(await getSessionTier(id)).toBe("free")

    await db.insert(subscriptions).values({
      userId: id,
      planName: "pro",
      price: 5,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
    })
    expect(await getSessionTier(id)).toBe("paid")
  })
})
