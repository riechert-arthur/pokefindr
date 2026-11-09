import { describe, expect, it } from "vitest"
import { SmtpMailer } from "@/server/adapters/mailer/smtp"

// Needs Mailpit (`docker compose up -d mail`, started by CI's integration job).
const api = process.env.TEST_MAILPIT_URL

describe.skipIf(!api)("SmtpMailer through Mailpit", () => {
  it("delivers a message that reads back the same", async () => {
    const to = `mailer-${Date.now()}@example.com`
    await new SmtpMailer(process.env.TEST_SMTP_URL ?? "smtp://localhost:1025", "PokeFindr <no-reply@pokefindr.test>").send({
      to,
      subject: "Hello from the test",
      text: "Plain body",
      html: "<p>HTML body</p>",
    })
    const { messages } = (await (await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages: { ID: string }[] }
    expect(messages).toHaveLength(1)
    const got = (await (await fetch(`${api}/api/v1/message/${messages[0].ID}`)).json()) as { Subject: string; Text: string; HTML: string; From: { Address: string } }
    expect(got.Subject).toBe("Hello from the test")
    expect(got.Text.trim()).toBe("Plain body")
    expect(got.HTML).toContain("HTML body")
    expect(got.From.Address).toBe("no-reply@pokefindr.test")
  })
})
