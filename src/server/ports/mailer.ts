/**
 * Sends transactional email: account verification, password reset, email
 * change. Adapters live in `src/server/adapters/mailer/`; `getMailer()`
 * (src/server/container.ts) picks one from config, so the provider is a
 * config change (any SMTP service: SES, Postmark, Resend, Mailgun, Mailpit).
 */
export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface Mailer {
  /** Resolves once the provider accepted the message; rejects if it didn't. */
  send(msg: MailMessage): Promise<void>
}
