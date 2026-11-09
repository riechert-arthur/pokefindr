// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { makeMailer } from "@/server/container"
import { ConsoleMailer } from "@/server/adapters/mailer/console"
import { SmtpMailer } from "@/server/adapters/mailer/smtp"
import type { ServerConfig } from "@/server/config"

const msg = { to: "ash@example.com", subject: "Confirm your PokeFindr account", text: "Confirm: https://pokefindr.example/verify?token=t", html: "<p>Confirm</p>" }

describe("ConsoleMailer", () => {
  it("prints the recipient, subject and text body", async () => {
    const lines: string[] = []
    await new ConsoleMailer(false, (l) => lines.push(l)).send(msg)
    expect(lines.join("\n")).toContain("To: ash@example.com")
    expect(lines.join("\n")).toContain("Subject: Confirm your PokeFindr account")
    expect(lines.join("\n")).toContain("https://pokefindr.example/verify?token=t")
  })

  it("refuses in production instead of dropping the email", async () => {
    const lines: string[] = []
    await expect(new ConsoleMailer(true, (l) => lines.push(l)).send(msg)).rejects.toThrow(/MAIL_PROVIDER=smtp/)
    expect(lines).toEqual([])
  })
})

describe("makeMailer", () => {
  const config = (o: Partial<ServerConfig>) => ({ MAIL_PROVIDER: "console", MAIL_FROM: "PokeFindr <no-reply@localhost>", NODE_ENV: "test", ...o }) as ServerConfig

  it("builds the adapter the config names", () => {
    expect(makeMailer(config({}))).toBeInstanceOf(ConsoleMailer)
    expect(makeMailer(config({ MAIL_PROVIDER: "smtp", SMTP_URL: "smtp://localhost:1025" }))).toBeInstanceOf(SmtpMailer)
  })
})
