import "server-only"
import type { Mailer, MailMessage } from "@/server/ports/mailer"

/**
 * Prints each email instead of sending it: the default in local dev and CI,
 * so sign-up works with no mail account (the verification link is in the
 * server log). In production it refuses, so a missing setting can't quietly
 * drop every email.
 */
export class ConsoleMailer implements Mailer {
  constructor(
    private readonly production = false,
    private readonly log: (line: string) => void = console.log,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    if (this.production) throw new Error("MAIL_PROVIDER is console, which doesn't deliver email. Set MAIL_PROVIDER=smtp and SMTP_URL.")
    this.log(`[mail] To: ${msg.to}\n[mail] Subject: ${msg.subject}\n${msg.text}`)
  }
}
