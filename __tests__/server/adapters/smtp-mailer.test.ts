import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { SMTP_TIMEOUT_MS, SmtpMailer } from "@/server/adapters/mailer/smtp"

describe("SmtpMailer", () => {
  it("keeps the URL's server and login, and uses short timeouts", () => {
    const mailer = new SmtpMailer("smtps://resend:secret@smtp.resend.com:465", "PokeFindr <no-reply@pokefindr.test>")
    const options = (mailer as unknown as { transport: { transporter: { options: Record<string, unknown> } } }).transport.transporter.options
    expect(options).toMatchObject({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: "secret" },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    })
  })
})
