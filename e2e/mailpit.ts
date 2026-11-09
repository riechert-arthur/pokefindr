import { expect, type APIRequestContext } from "@playwright/test"

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025"

/** The newest email to `to` whose subject contains `subject`, once it arrives. */
export async function latestEmail(request: APIRequestContext, to: string, subject: string): Promise<{ subject: string; text: string }> {
  let found: { ID: string; Subject: string } | undefined
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${to}" subject:"${subject}"` } })
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] }
        found = messages[0]
        return Boolean(found)
      },
      { message: `an email to ${to} about "${subject}"`, timeout: 20_000 },
    )
    .toBe(true)
  const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as { Subject: string; Text: string }
  return { subject: msg.Subject, text: msg.Text }
}

/** The first link in an email's text. */
export const linkIn = (text: string) => text.match(/https?:\/\/\S+/)![0]
