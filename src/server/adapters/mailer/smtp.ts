import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import type { Mailer, MailMessage } from "@/server/ports/mailer"

/**
 * Sends through any SMTP server, from a URL such as
 * `smtps://user:pass@smtp.example.com:465` or `smtp://localhost:1025`
 * (Mailpit, in the local stack).
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url)
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
  }
}
