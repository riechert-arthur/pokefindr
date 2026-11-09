import "server-only"
import { DEFAULT_LOCALE, type Locale } from "@/i18n/routing"
import { serverTranslator } from "@/server/i18n"
import type { MailMessage } from "@/server/ports/mailer"

/**
 * The emails PokeFindr sends, one function each, returning the subject and
 * both bodies in the recipient's language (`email` in messages/*.yml, #185).
 * Links come in already built from APP_URL (Better Auth's baseURL), never
 * from a request's Host header.
 */
export type EmailContent = Omit<MailMessage, "to">

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/**
 * Email clients can't read the app's CSS variables, so these are the design
 * tokens' light-theme values as hex (src/app/globals.css). A test checks
 * they still match.
 */
export const EMAIL_COLORS = {
  /** foreground */ fg: "#0a0a0a",
  /** muted-foreground */ muted: "#6b6b6b",
  /** border */ border: "#e5e5e5",
  /** primary */ primary: "#2563eb",
  /** primary-foreground */ onPrimary: "#f8fafc",
  /** muted */ bg: "#f5f5f5",
  /** card */ card: "#ffffff",
} as const

/** Our own copy in a text node (the catalog's): apostrophes can stay as they are. */
const escapeText = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

type T = ReturnType<typeof serverTranslator>

/** A message as plain text: tags dropped, values as they are. */
const plain = (t: T, key: Parameters<T["markup"]>[0], values: Record<string, string> = {}) => t.markup(key, { ...values, b: (chunks) => chunks })

/** A message as HTML: values escaped, <b> bold. */
const html = (t: T, key: Parameters<T["markup"]>[0], values: Record<string, string> = {}) =>
  t.markup(key, { ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, escapeHtml(v)])), b: (chunks) => `<strong>${chunks}</strong>` })

/** A plain card: wordmark, the message, then a short footer. Inline styles only, as email needs. */
function layout(t: T, locale: Locale, body: string): string {
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:24px 16px;background:${EMAIL_COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_COLORS.fg};font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:18px;font-weight:700;letter-spacing:-0.01em">PokeFindr</td></tr>
<tr><td style="padding:8px 28px 28px">${body}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;color:${EMAIL_COLORS.muted};font-size:12px">${escapeText(t("email.footer"))}</p>
</td></tr></table>
</body></html>`
}

const button = (t: T, url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${EMAIL_COLORS.primary};color:${EMAIL_COLORS.onPrimary};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(label)}</a></p>
<p style="margin:0;color:${EMAIL_COLORS.muted};font-size:13px">${escapeText(t("email.pasteLink"))}<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>`

const hi = (t: T, name: string) => (name.trim() ? t("email.hi", { name: name.trim() }) : t("email.hiAnonymous"))

const note = (text: string) => `<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">${escapeText(text)}</p>`

/**
 * An account email: greeting, a sentence ending in the link (text) or a
 * button (HTML), and a note.
 */
function accountEmail(
  locale: Locale,
  key: "verify" | "reset" | "confirmChange" | "approveChange",
  { name, url, values = {} }: { name: string; url: string; values?: Record<string, string> },
): EmailContent {
  const t = serverTranslator(locale)
  const greeting = hi(t, name)
  return {
    subject: t(`email.${key}.subject`),
    text: `${greeting}\n\n${plain(t, `email.${key}.text`, values)}\n${url}\n\n${t(`email.${key}.note`)}`,
    html: layout(
      t,
      locale,
      `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p><p style="margin:0">${html(t, `email.${key}.html`, values)}</p>${button(t, url, t(`email.${key}.button`))}${note(t(`email.${key}.note`))}`,
    ),
  }
}

type To = { locale?: Locale }

export function verifyEmail({ name, url, locale = DEFAULT_LOCALE }: { name: string; url: string } & To): EmailContent {
  return accountEmail(locale, "verify", { name, url })
}

export function resetPassword({ name, url, locale = DEFAULT_LOCALE }: { name: string; url: string } & To): EmailContent {
  return accountEmail(locale, "reset", { name, url })
}

export function confirmEmailChange({ name, newEmail, url, locale = DEFAULT_LOCALE }: { name: string; newEmail: string; url: string } & To): EmailContent {
  return accountEmail(locale, "confirmChange", { name, url, values: { email: newEmail } })
}

/**
 * To the current address, first, when someone asks to move the account to a
 * new one: nothing changes unless it's approved here, so a stolen session
 * alone can't take the account.
 */
export function approveEmailChange({ name, newEmail, url, locale = DEFAULT_LOCALE }: { name: string; newEmail: string; url: string } & To): EmailContent {
  return accountEmail(locale, "approveChange", { name, url, values: { email: newEmail } })
}

/** To moderators when someone sends a place in (#127). */
export function submissionToReview({ kind, name, place, submitter, url, locale = DEFAULT_LOCALE }: { kind: "shop" | "event"; name: string; place: string; submitter: string; url: string } & To): EmailContent {
  const t = serverTranslator(locale)
  const values = { kind, name, submitter, place: place ? `, ${place}` : "" }
  return {
    subject: t("email.toReview.subject", { kind, name }),
    text: `${plain(t, "email.toReview.body", values)}\n\n${t("email.toReview.text")}\n${url}`,
    html: layout(t, locale, `<p style="margin:0">${html(t, "email.toReview.body", values)}</p>${button(t, url, t("email.toReview.button"))}`),
  }
}

/** To the submitter once a moderator approves their place. */
export function submissionApproved({ name, kind, url, locale = DEFAULT_LOCALE }: { name: string; kind: "shop" | "event"; url: string } & To): EmailContent {
  const t = serverTranslator(locale)
  return {
    subject: t("email.approved.subject", { name }),
    text: `${plain(t, "email.approved.text", { name, kind })}\n${url}`,
    html: layout(t, locale, `<p style="margin:0">${html(t, "email.approved.html", { name, kind })}</p>${button(t, url, t("email.approved.button"))}`),
  }
}

/** To the submitter when a moderator rejects their place, with the reason (already in their language). */
export function submissionRejected({ name, reason, url, locale = DEFAULT_LOCALE }: { name: string; reason: string; url: string } & To): EmailContent {
  const t = serverTranslator(locale)
  return {
    subject: t("email.rejected.subject", { name }),
    text: `${plain(t, "email.rejected.thanks", { name })} ${t("email.rejected.reason", { reason })}\n\n${t("email.rejected.text")}\n${url}`,
    html: layout(
      t,
      locale,
      `<p style="margin:0 0 12px">${html(t, "email.rejected.thanks", { name })}</p><p style="margin:0">${escapeText(t("email.rejected.reason", { reason }))}</p>${button(t, url, t("email.rejected.button"))}${note(t("email.rejected.html"))}`,
    ),
  }
}
