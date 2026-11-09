import "server-only"
import { z } from "zod/v3"
import { zodToJsonSchema } from "zod-to-json-schema"
import { eventDateProblem, submissionSchema, type SubmissionInput } from "@/lib/submissions/schemas"
import { REJECT_REASON_LABELS, SHOP_SELLS } from "@/lib/submissions/constants"
import type { McpAccountScope } from "@/lib/mcp/scopes"
import { STATES } from "@/lib/map/states"
import { listUserReviews } from "@/server/services/reviews"
import { createSubmission, listMySubmissions } from "@/server/services/submissions"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { ToolInputError, type ToolContext } from "@/server/assistant/tools"
import { USER_WRITTEN_NOTE, plainUserText } from "@/server/assistant/untrusted"

/**
 * The tools that act as the signed-in person (#134): their reviews and
 * submissions, and adding a card shop or event for review. Each needs a
 * scope the person approved on the consent page.
 */

export interface AccountToolContext {
  tools: ToolContext
  userId: string
  /** For links back to the site. */
  appUrl: string
}

export interface AccountTool<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  title: string
  description: string
  scope: McpAccountScope
  input: I
  readOnly: boolean
  run(input: z.infer<I>, ctx: AccountToolContext): Promise<Record<string, unknown>>
}

const tool = <I extends z.ZodTypeAny>(t: AccountTool<I>) => t

/** Most rows a list returns: recent ones are what people ask about. */
export const MAX_ROWS = 20

const placeLink = (appUrl: string, id: string) => `${new URL("/map", appUrl)}?location=${encodeURIComponent(id)}`

export const myReviews = tool({
  name: "my_reviews",
  title: "My reviews",
  description: "The signed-in person's PokeFindr reviews, newest first (at most 20): the place, its rating out of 5, the text and the date.",
  scope: "account:read",
  input: z.object({}),
  readOnly: true,
  async run(_input, { tools, userId, appUrl }) {
    const reviews = await listUserReviews(userId, tools.db)
    return {
      total: reviews.length,
      note: `Review text is the person's own. ${USER_WRITTEN_NOTE}`,
      reviews: reviews.slice(0, MAX_ROWS).map((r) => ({
        rating: r.rating,
        date: r.created ? new Date(r.created).toISOString().slice(0, 10) : null,
        untrusted_text: plainUserText(r.comment ?? "", 500),
        place: {
          id: r.location.id,
          name: plainUserText(r.location.name ?? "", 100) || "Unnamed place",
          city: plainUserText(r.location.city ?? "", 60),
          state: plainUserText(r.location.state ?? "", 4),
          url: placeLink(appUrl, r.location.id),
        },
      })),
    }
  },
})

export const mySubmissions = tool({
  name: "my_submissions",
  title: "My submissions",
  description:
    "Card shops and events the signed-in person submitted, newest first (at most 20), with their review status: pending (a moderator hasn't checked it yet), approved (on the map) or rejected (with the reason).",
  scope: "account:read",
  input: z.object({}),
  readOnly: true,
  async run(_input, { tools, userId, appUrl }) {
    const rows = await listMySubmissions(userId, tools.db, MAX_ROWS)
    return {
      submissions: rows.map((s) => ({
        id: s.id,
        type: s.kind === "shop" ? "card shop" : "event",
        name: plainUserText(s.name, 100),
        city: plainUserText(s.city, 60),
        state: plainUserText(s.state, 4),
        status: s.status === "approved" && s.locationActive === false ? (s.kind === "event" ? "ended" : "removed") : s.status,
        ...(s.rejectReason ? { reason: REJECT_REASON_LABELS[s.rejectReason] } : {}),
        ...(s.startsAt ? { starts_at: s.startsAt } : {}),
        submitted: s.createdAt.slice(0, 10),
        ...(s.locationId && s.locationActive ? { url: placeLink(appUrl, s.locationId) } : {}),
      })),
    }
  },
})

const STATE_CODES = Object.keys(STATES) as [string, ...string[]]

const submitInput = z.object({
  type: z.enum(["shop", "event"]).describe("'shop' for a card shop, 'event' for a card show, league night or tournament"),
  name: z.string().min(2).max(100).describe("The shop's or event's name"),
  address: z.string().min(3).max(200).describe("Street address, e.g. '1450 Grant St'"),
  city: z.string().min(1).max(80),
  state: z.enum(STATE_CODES).describe("Two-letter US state code"),
  website: z.string().max(300).optional().describe("Shops: https:// link"),
  hours: z.string().max(200).optional().describe("Shops: opening hours as written"),
  sells: z.array(z.enum(SHOP_SELLS)).optional().describe("Shops: what it sells"),
  venue: z.string().max(120).optional().describe("Events: the venue's name"),
  starts_at: z.string().max(40).optional().describe("Events (required): when it starts, ISO 8601 with offset, e.g. '2026-11-21T18:00:00-07:00'"),
  ends_at: z.string().max(40).optional().describe("Events: when it ends, same format; at most 14 days after the start"),
  link: z.string().max(300).optional().describe("Events: https:// link to details or tickets"),
  is_free: z.boolean().optional().describe("Events: whether entry is free"),
  confirm_duplicate: z.boolean().optional().describe("Set after the person confirmed it isn't one of the places this tool reported nearby"),
})

/** Where the address is: a street-level match in the state given, or an error the model can pass on. */
async function locate(input: z.infer<typeof submitInput>, tools: ToolContext) {
  const [hit] = await tools.geocoder.search(`${input.address}, ${input.city}, ${input.state}`, { limit: 1, signal: tools.signal })
  if (!hit || hit.kind !== "address") throw new ToolInputError(`Couldn't find "${input.address}, ${input.city}, ${input.state}" as a street address. Check it with the person, or they can add it on the PokeFindr map.`)
  if (hit.state && hit.state !== input.state) throw new ToolInputError(`That address is in ${hit.state}, not ${input.state}. Check it with the person.`)
  return hit
}

export const submitPlace = tool({
  name: "submit_place",
  title: "Submit a place",
  description:
    "Add a card shop or event to PokeFindr as the signed-in person. It's pending until a moderator checks it, and only they see it until then. Confirm the details with the person first. If places of the same kind are already nearby, it returns them instead of submitting: ask the person, and call again with confirm_duplicate only if it's a different place. Five a day.",
  scope: "places:submit",
  input: submitInput,
  readOnly: false,
  async run(input, { tools, userId, appUrl }) {
    if (input.type === "event" && !input.starts_at) throw new ToolInputError("An event needs starts_at.")
    const at = await locate(input, tools)
    const raw =
      input.type === "shop"
        ? { kind: "shop", name: input.name, address: input.address, city: input.city, state: input.state, lng: at.lng, lat: at.lat, website: input.website, hours: input.hours, sells: input.sells }
        : { kind: "event", name: input.name, address: input.address, city: input.city, state: input.state, lng: at.lng, lat: at.lat, venue: input.venue, startsAt: input.starts_at, endsAt: input.ends_at, link: input.link, isFree: input.is_free }
    // The site's own checks: the same rules as the Add a place form.
    const parsed = submissionSchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ToolInputError(`${issue.path.join(".") || "input"}: ${issue.message}`)
    }
    const submission: SubmissionInput = parsed.data
    if (submission.kind === "event") {
      const problem = eventDateProblem(submission.startsAt, submission.endsAt, tools.now)
      if (problem) throw new ToolInputError(`${problem.field === "startsAt" ? "starts_at" : "ends_at"}: ${problem.error}`)
    }
    const result = await createSubmission({ userId, input: submission, confirmDuplicate: input.confirm_duplicate }, tools.db)
    if (result.status === "rate_limited") throw new ToolInputError("The person has submitted the most places allowed today (5). They can try again tomorrow.")
    if (result.status === "duplicate") {
      return {
        status: "not_submitted",
        reason: "Places of the same kind are already within 150 m. Ask the person whether it's one of these; if it isn't, call again with confirm_duplicate: true.",
        nearby: result.duplicates.map((d) => ({
          name: plainUserText(d.name, 100),
          address: plainUserText(d.address, 160),
          city: plainUserText(d.city, 60),
          meters: Math.round(d.meters),
          ...(d.source === "location" ? { url: placeLink(appUrl, d.id) } : { note: "Their own submission, still waiting for review" }),
        })),
      }
    }
    // Moderators hear about it by email; a failure to queue doesn't lose the submission.
    await enqueueJob("submission-created", { submissionId: result.id }, { idempotencyKey: `submission-created:${result.id}` }).catch((err) =>
      console.error("[mcp] couldn't queue the email to moderators", err),
    )
    return {
      status: "pending",
      id: result.id,
      note: "Submitted. A moderator checks it before it's on the map; until then only the person sees it, under Your submissions on PokeFindr.",
      located_at: at.label,
    }
  },
})

export const ACCOUNT_TOOLS: readonly AccountTool[] = [myReviews, mySubmissions, submitPlace]

export function accountInputJsonSchema(t: AccountTool) {
  const schema = zodToJsonSchema(t.input, { $refStrategy: "none" }) as Record<string, unknown>
  delete schema.$schema
  return schema
}
