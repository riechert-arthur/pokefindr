import { beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import type { MailMessage } from "@/server/ports/mailer"

const { outbox, mail } = vi.hoisted(() => ({ outbox: [] as MailMessage[], mail: { down: false, bounce: "" } }))
vi.mock("@/server/container", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/container")>()),
  getMailer: () => ({
    send: async (m: MailMessage) => {
      if (mail.down || m.to === mail.bounce) throw new Error("smtp down")
      outbox.push(m)
    },
  }),
}))

import { getDb } from "@/server/db/client"
import { profiles, sentNotifications } from "@/server/db/schema"
import { createSubmission } from "@/server/services/submissions"
import { approveSubmission, rejectSubmission, undoDecision } from "@/server/services/moderation"
import { notifySubmissionCreated, notifySubmissionReviewed } from "@/server/services/submission-notifications"
import { jobs } from "@/server/lib/jobs/registry"
import type { SubmissionInput } from "@/lib/submissions/schemas"
import { insertProfiles } from "./testDatabase"

const ASH = randomUUID()
const MOD = randomUUID()
const ADMIN = randomUUID()

beforeEach(async () => {
  outbox.length = 0
  mail.down = false
  mail.bounce = ""
  await insertProfiles(getDb(), [
    { id: ASH, username: "ash" },
    { id: MOD, username: "brock" },
    { id: ADMIN, username: "jenny" },
  ])
  await getDb().update(profiles).set({ role: "moderator" }).where(eq(profiles.id, MOD))
  await getDb().update(profiles).set({ role: "admin" }).where(eq(profiles.id, ADMIN))
})

const shop: SubmissionInput = { kind: "shop", name: "Mile High Cards", lng: -104.9876, lat: 39.7392, city: "Denver", state: "CO", countryCode: "US", sells: [] }
async function submit() {
  const r = await createSubmission({ userId: ASH, input: shop })
  if (r.status !== "created") throw new Error(r.status)
  return r.id
}

describe("submission-created", () => {
  it("emails each moderator and admin once, however often the job runs", async () => {
    const id = await submit()
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 2 })
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 0 })
    expect(outbox.map((m) => m.to).sort()).toEqual([`${ADMIN}@example.test`, `${MOD}@example.test`].sort())
    expect(outbox[0]).toMatchObject({ subject: "New card shop to review: Mile High Cards" })
    expect(outbox[0].text).toContain("ash added a card shop: Mile High Cards, Denver, CO.")
    expect(outbox[0].text).toContain("/admin")
  })

  it("sends again on the retry when the mailer failed", async () => {
    const id = await submit()
    mail.down = true
    await expect(notifySubmissionCreated(id)).rejects.toThrow("2 of the moderator emails failed")
    mail.down = false
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 2 })
  })

  it("still reaches the other moderators when one address fails, and retries only that one", async () => {
    const id = await submit()
    mail.bounce = `${MOD}@example.test`
    await expect(notifySubmissionCreated(id)).rejects.toThrow("1 of the moderator emails failed")
    expect(outbox.map((m) => m.to)).toEqual([`${ADMIN}@example.test`])
    mail.bounce = ""
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 1 })
    expect(outbox.map((m) => m.to).sort()).toEqual([`${ADMIN}@example.test`, `${MOD}@example.test`].sort())
  })

  it("sends one whose run died mid-send, once its claim is stale, and not before", async () => {
    const id = await submit()
    // A run claimed both and died before sending.
    const claimedAt = new Date(Date.now() - 60_000)
    await getDb().insert(sentNotifications).values([MOD, ADMIN].map((m) => ({ key: `submission-created:${id}:${m}`, claimedAt })))
    // A redelivery soon after fails, so the queue tries again later, rather than counting it done.
    await expect(notifySubmissionCreated(id)).rejects.toThrow("2 of the moderator emails failed")
    expect(outbox).toEqual([])
    await getDb().update(sentNotifications).set({ claimedAt: new Date(Date.now() - 11 * 60_000) })
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 2 })
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 0 })
    expect((await getDb().select().from(sentNotifications)).every((r) => r.sentAt)).toBe(true)
  })

  it("sends nothing once someone decided it", async () => {
    const id = await submit()
    await rejectSubmission(id, MOD, "spam")
    expect(await notifySubmissionCreated(id)).toEqual({ sent: 0 })
  })

  it("is registered as a job with a checked payload", () => {
    expect(jobs["submission-created"].schema!.safeParse({ submissionId: "nope" }).success).toBe(false)
    expect(jobs["submission-reviewed"].schema!.safeParse({ submissionId: randomUUID(), reviewedAt: new Date().toISOString() }).success).toBe(true)
  })
})

describe("submission-reviewed", () => {
  it("tells the submitter it's on the map, once", async () => {
    const id = await submit()
    const at = new Date()
    const r = await approveSubmission(id, MOD, getDb(), at)
    expect(await notifySubmissionReviewed(id, at.toISOString())).toEqual({ sent: 1 })
    expect(await notifySubmissionReviewed(id, at.toISOString())).toEqual({ sent: 0 })
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ to: `${ASH}@example.test`, subject: "Mile High Cards is on PokeFindr" })
    expect(outbox[0].text).toContain(`/map?location=${r.status === "done" ? r.locationId : ""}`)
  })

  it("gives the reason when it was rejected", async () => {
    const id = await submit()
    const at = new Date()
    await rejectSubmission(id, MOD, "not_real", getDb(), at)
    await notifySubmissionReviewed(id, at.toISOString())
    expect(outbox[0].subject).toBe("Mile High Cards wasn't added to PokeFindr")
    expect(outbox[0].text).toContain("The reason: Not a real or public place.")
  })

  it("writes to a submitter in their language, with a link to the map in it (#185)", async () => {
    await getDb().update(profiles).set({ locale: "es" }).where(eq(profiles.id, ASH))
    const id = await submit()
    const at = new Date()
    await rejectSubmission(id, MOD, "not_real", getDb(), at)
    await notifySubmissionReviewed(id, at.toISOString())
    expect(outbox[0].subject).toBe("Mile High Cards no se agregó a PokeFindr")
    expect(outbox[0].text).toContain("El motivo: No es un lugar real o público.")
    expect(outbox[0].text).toContain("/es/map?add=shop")
    expect(outbox[0].html).toContain('<html lang="es">')
  })

  it("sends nothing for a decision that was undone or changed", async () => {
    const id = await submit()
    const first = new Date()
    await approveSubmission(id, MOD, getDb(), first)
    await undoDecision(id, MOD, getDb(), first)
    expect(await notifySubmissionReviewed(id, first.toISOString())).toEqual({ sent: 0 })
    const second = new Date(first.getTime() + 1000)
    await rejectSubmission(id, MOD, "duplicate", getDb(), second)
    expect(await notifySubmissionReviewed(id, first.toISOString())).toEqual({ sent: 0 })
    expect(await notifySubmissionReviewed(id, second.toISOString())).toEqual({ sent: 1 })
  })
})
