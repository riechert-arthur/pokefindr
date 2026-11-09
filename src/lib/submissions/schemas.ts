import { z } from "zod"
import { SHOP_SELLS } from "./constants"

const DAY_MS = 24 * 60 * 60 * 1000
/** The longest an event may last, so a far-off end can't keep it listed (a restock weekend or a convention fits). */
export const MAX_EVENT_DAYS = 14

/**
 * Control and invisible format characters (NUL, zero-width spaces, bidi
 * overrides): Postgres refuses NUL in jsonb, and the rest can hide or
 * disguise a name in the review queue and on the map.
 */
const HIDDEN = /[\p{Cc}\p{Cf}]/u

/** Text people type: NFC-normalized and trimmed, without control or invisible characters. */
const text = () =>
  z
    .string()
    .transform((v) => v.normalize("NFC").trim())
    .refine((v) => !HIDDEN.test(v), { message: "Remove the hidden or control characters." })

/**
 * A link people can open: http or https only (no javascript: or data: links
 * in a moderator's queue), and like other text, no hidden or control
 * characters (a right-to-left override could disguise where it goes).
 */
const webLink = text()
  .refine((v) => v.length <= 300, { message: "Use a shorter link." })
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v), { message: "Enter a link starting with https://" })

/** Optional text: empty becomes undefined. */
const optionalText = (max: number) =>
  text()
    .refine((v) => v.length <= max, { message: `Use at most ${max} characters.` })
    .optional()
    .transform((v) => v || undefined)



/** What every kind has: a name and where it is. */
const place = {
  name: text()
    .refine((v) => v.length >= 2, { message: "Enter a name." })
    .refine((v) => v.length <= 100, { message: "Use at most 100 characters." }),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  address: optionalText(200),
  city: text()
    .refine((v) => v.length >= 1, { message: "Enter a city." })
    .refine((v) => v.length <= 80, { message: "Use at most 80 characters." }),
  /** Two-letter code in the US; the region's name elsewhere. */
  state: optionalText(80),
  countryCode: z.string().regex(/^[A-Z]{2}$/).default("US"),
}

export const shopSubmissionSchema = z.object({
  kind: z.literal("shop"),
  ...place,
  website: webLink,
  hours: optionalText(200),
  sells: z.array(z.enum(SHOP_SELLS)).max(SHOP_SELLS.length).default([]),
})

export const eventSubmissionSchema = z.object({
  kind: z.literal("event"),
  ...place,
  venue: optionalText(120),
  startsAt: z.string().datetime({ offset: true, message: "Pick when it starts." }),
  endsAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  link: webLink,
  isFree: z.boolean().optional(),
})

/** A card shop or an event, as POST /api/submissions takes it. */
export const submissionSchema = z.discriminatedUnion("kind", [shopSubmissionSchema, eventSubmissionSchema]).superRefine((s, ctx) => {
  if (s.kind !== "event" || !s.endsAt) return
  const length = Date.parse(s.endsAt) - Date.parse(s.startsAt)
  if (length < 0) ctx.addIssue({ code: "custom", message: "It has to end after it starts.", path: ["endsAt"] })
  else if (length > MAX_EVENT_DAYS * DAY_MS) ctx.addIssue({ code: "custom", message: `An event can last at most ${MAX_EVENT_DAYS} days.`, path: ["endsAt"] })
})
export type SubmissionInput = z.infer<typeof submissionSchema>
export type ShopSubmission = z.infer<typeof shopSubmissionSchema>
export type EventSubmission = z.infer<typeof eventSubmissionSchema>

/**
 * When an event may be: starting no more than a day ago (it may be on now)
 * nor more than a year out, and not already over. Checked on the server
 * with its clock; the field it's about comes with the message.
 */
export function eventDateProblem(startsAt: string, endsAt?: string, now = new Date()): { field: "startsAt" | "endsAt"; error: string } | null {
  const t = Date.parse(startsAt)
  if (t < now.getTime() - DAY_MS) return { field: "startsAt", error: "That date has passed." }
  if (t > now.getTime() + 366 * DAY_MS) return { field: "startsAt", error: "Pick a date within the next year." }
  if (endsAt && Date.parse(endsAt) < now.getTime()) return { field: "endsAt", error: "That event has already ended." }
  return null
}

/** A place near the one being added, of the same kind: maybe the same place. */
export type DuplicateCandidate = {
  id: string
  name: string
  /** A location on the map, or one of your submissions still waiting for review. */
  source: "location" | "submission"
  address: string
  city: string
  state: string
  meters: number
}

/** One of the viewer's submissions (GET /api/submissions?mine). */
export type MySubmission = {
  id: string
  kind: "shop" | "event"
  status: "pending" | "approved" | "rejected"
  rejectReason: "duplicate" | "not_real" | "wrong_details" | "spam" | null
  name: string
  address: string
  city: string
  state: string
  lng: number
  lat: number
  /** Events: when it starts. */
  startsAt: string | null
  /** Approved: the location it became. */
  locationId: string | null
  createdAt: string
  reviewedAt: string | null
}
