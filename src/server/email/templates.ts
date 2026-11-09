import "server-only"
import type { MailMessage } from "@/server/ports/mailer"

/**
 * The emails PokeFindr sends, one function each, returning the subject and
 * both bodies. Links come in already built from APP_URL (Better Auth's
 * baseURL), never from a request's Host header.
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

/** A plain card: wordmark, the message, then a short footer. Inline styles only, as email needs. */
function layout(body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:24px 16px;background:${EMAIL_COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_COLORS.fg};font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:18px;font-weight:700;letter-spacing:-0.01em">PokeFindr</td></tr>
<tr><td style="padding:8px 28px 28px">${body}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;color:${EMAIL_COLORS.muted};font-size:12px">You're getting this because of an action on your PokeFindr account.</p>
</td></tr></table>
</body></html>`
}

const button = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${EMAIL_COLORS.primary};color:${EMAIL_COLORS.onPrimary};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(label)}</a></p>
<p style="margin:0;color:${EMAIL_COLORS.muted};font-size:13px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>`

const hi = (name: string) => (name.trim() ? `Hi ${name.trim()},` : "Hi,")

export function verifyEmail({ name, url }: { name: string; url: string }): EmailContent {
  return {
    subject: "Confirm your PokeFindr account",
    text: `${hi(name)}\n\nConfirm your email to finish creating your PokeFindr account:\n${url}\n\nThe link works for 24 hours. If you didn't sign up, you can ignore this email.`,
    html: layout(
      `<p style="margin:0 0 12px">${escapeHtml(hi(name))}</p><p style="margin:0">Confirm your email to finish creating your PokeFindr account.</p>${button(url, "Confirm email")}<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">The link works for 24 hours. If you didn't sign up, you can ignore this email.</p>`,
    ),
  }
}

export function resetPassword({ name, url }: { name: string; url: string }): EmailContent {
  return {
    subject: "Reset your PokeFindr password",
    text: `${hi(name)}\n\nSomeone asked to reset the password for your PokeFindr account. To choose a new one, open:\n${url}\n\nThe link works for 1 hour. If it wasn't you, ignore this email: your password stays the same.`,
    html: layout(
      `<p style="margin:0 0 12px">${escapeHtml(hi(name))}</p><p style="margin:0">Someone asked to reset the password for your PokeFindr account.</p>${button(url, "Choose a new password")}<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">The link works for 1 hour. If it wasn't you, ignore this email: your password stays the same.</p>`,
    ),
  }
}

export function confirmEmailChange({ name, newEmail, url }: { name: string; newEmail: string; url: string }): EmailContent {
  return {
    subject: "Confirm your new PokeFindr email",
    text: `${hi(name)}\n\nConfirm that ${newEmail} is the new email for your PokeFindr account:\n${url}\n\nNothing changes until you open the link, which works for 24 hours. If you didn't ask for this, ignore this email.`,
    html: layout(
      `<p style="margin:0 0 12px">${escapeHtml(hi(name))}</p><p style="margin:0">Confirm that <strong>${escapeHtml(newEmail)}</strong> is the new email for your PokeFindr account.</p>${button(url, "Confirm new email")}<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">Nothing changes until you open the link, which works for 24 hours. If you didn't ask for this, ignore this email.</p>`,
    ),
  }
}

/**
 * To the current address, first, when someone asks to move the account to a
 * new one: nothing changes unless it's approved here, so a stolen session
 * alone can't take the account.
 */
export function approveEmailChange({ name, newEmail, url }: { name: string; newEmail: string; url: string }): EmailContent {
  return {
    subject: "Approve your PokeFindr email change",
    text: `${hi(name)}\n\nSomeone asked to change your PokeFindr account's email to ${newEmail}. If it was you, approve it here, then confirm the new address from its inbox:\n${url}\n\nIf it wasn't you, ignore this email and change your password: nothing changes unless you approve.`,
    html: layout(
      `<p style="margin:0 0 12px">${escapeHtml(hi(name))}</p><p style="margin:0">Someone asked to change your PokeFindr account's email to <strong>${escapeHtml(newEmail)}</strong>. If it was you, approve it, then confirm the new address from its inbox.</p>${button(url, "Approve the change")}<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">If it wasn't you, ignore this email and change your password: nothing changes unless you approve.</p>`,
    ),
  }
}

const kindName = (kind: "shop" | "event") => (kind === "shop" ? "card shop" : "event")

/** To moderators when someone sends a place in (#127). */
export function submissionToReview({ kind, name, place, submitter, url }: { kind: "shop" | "event"; name: string; place: string; submitter: string; url: string }): EmailContent {
  return {
    subject: `New ${kindName(kind)} to review: ${name}`,
    text: `${submitter} added a ${kindName(kind)}: ${name}${place ? `, ${place}` : ""}.\n\nReview it here:\n${url}`,
    html: layout(
      `<p style="margin:0">${escapeHtml(submitter)} added a ${kindName(kind)}: <strong>${escapeHtml(name)}</strong>${place ? `, ${escapeHtml(place)}` : ""}.</p>${button(url, "Open the review queue")}`,
    ),
  }
}

/** To the submitter once a moderator approves their place. */
export function submissionApproved({ name, kind, url }: { name: string; kind: "shop" | "event"; url: string }): EmailContent {
  return {
    subject: `${name} is on PokeFindr`,
    text: `Thanks for adding ${name}. A moderator checked it, and the ${kindName(kind)} is now on the map for everyone:\n${url}`,
    html: layout(`<p style="margin:0">Thanks for adding <strong>${escapeHtml(name)}</strong>. A moderator checked it, and the ${kindName(kind)} is now on the map for everyone.</p>${button(url, "See it on the map")}`),
  }
}

/** To the submitter when a moderator rejects their place, with the reason. */
export function submissionRejected({ name, reason, url }: { name: string; reason: string; url: string }): EmailContent {
  return {
    subject: `${name} wasn't added to PokeFindr`,
    text: `Thanks for sending ${name}. A moderator didn't add it to the map. The reason: ${reason}.\n\nIf something was wrong, you can add it again with the right details:\n${url}`,
    html: layout(
      `<p style="margin:0 0 12px">Thanks for sending <strong>${escapeHtml(name)}</strong>. A moderator didn't add it to the map.</p><p style="margin:0">The reason: ${escapeHtml(reason)}.</p>${button(url, "Add it again")}<p style="margin:20px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">If something was wrong, add it again with the right details.</p>`,
    ),
  }
}
