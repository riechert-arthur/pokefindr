import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import type { Mailer, MailMessage } from "@/server/ports/mailer"

/** How long a connection, greeting or quiet socket may take before the send fails. */
export const SMTP_TIMEOUT_MS = 20_000

/**
 * Sends through any SMTP server, from a URL such as
 * `smtps://user:pass@smtp.example.com:465` or `smtp://localhost:1025`
 * (Mailpit, in the local stack).
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(url: string, private readonly from: string) {
    // Short timeouts, so a stuck server fails the send (and the job retries)
    // well inside a function's run, rather than after nodemailer's 10 minutes.
    this.transport = nodemailer.createTransport({ url, connectionTimeout: SMTP_TIMEOUT_MS, greetingTimeout: SMTP_TIMEOUT_MS, socketTimeout: SMTP_TIMEOUT_MS })
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
  }
}
