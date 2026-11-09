"use client"

import { cloneElement, useEffect, useId, useRef, useState, type ComponentProps, type ReactElement } from "react"
import { ArrowLeftIcon, MapPinIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { KINDS } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { searchPlaces, type GeocodeResult } from "@/lib/geocode/client"
import { SHOP_SELLS, SHOP_SELLS_LABELS, type SubmissionKind } from "@/lib/submissions/constants"
import { submissionSchema, type DuplicateCandidate } from "@/lib/submissions/schemas"
import { cn } from "@/lib/utils"
import { STATE_ZONES, browserZone, formatInZone, zoneName, zonedToIso } from "@/lib/time/zones"
import { track } from "@/lib/analytics"

type InputProps = ComponentProps<typeof Input>

export interface Pin {
  lng: number
  lat: number
}

const STEPS = ["Type", "Location", "Details", "Review"] as const

/** The form's fields as typed, all strings (checkboxes aside), for both kinds. */
interface Draft {
  name: string
  address: string
  city: string
  state: string
  website: string
  hours: string
  sells: string[]
  venue: string
  startsAt: string
  endsAt: string
  link: string
  cost: "free" | "paid" | ""
}
const EMPTY: Draft = { name: "", address: "", city: "", state: "", website: "", hours: "", sells: [], venue: "", startsAt: "", endsAt: "", link: "", cost: "" }

/**
 * The zone an event's times are typed in: its state's (the event's local
 * time), or the viewer's until a state is filled in.
 */
const eventZone = (d: Draft) => STATE_ZONES[d.state.trim().toUpperCase()] ?? browserZone()

/** What goes to POST /api/submissions. Event times are read as wall-clock times in the event's zone. */
function toSubmission(kind: SubmissionKind, pin: Pin, d: Draft) {
  const toIso = (local: string) => zonedToIso(local, eventZone(d))
  const place = { name: d.name, lng: pin.lng, lat: pin.lat, address: d.address, city: d.city, state: d.state, countryCode: "US" }
  return kind === "shop"
    ? { kind, ...place, website: d.website, hours: d.hours, sells: d.sells }
    : { kind, ...place, venue: d.venue, startsAt: toIso(d.startsAt), endsAt: toIso(d.endsAt), link: d.link, isFree: d.cost ? d.cost === "free" : undefined }
}

/**
 * "1450 Grant St, Denver, CO 80203" → street, city and state, to start the
 * details step from. People can change any of it there.
 */
function splitLabel(r: GeocodeResult): Pick<Draft, "address" | "city" | "state"> {
  const parts = r.label.split(",").map((p) => p.trim())
  const state = r.state ?? ""
  if (r.kind === "address" && parts.length >= 3) return { address: parts[0], city: parts[1], state }
  if (r.kind === "city" || r.kind === "postcode") return { address: "", city: parts[0], state }
  return { address: "", city: "", state }
}

interface AddPlaceSheetProps {
  /** Where the pin is: set by a map click, a drag, or a search pick here. */
  pin: Pin | null
  onPinChange: (pin: Pin) => void
  /** Leave without sending. */
  onCancel: () => void
  /** Sent: the panel closes and the place shows as pending to its author. */
  onSubmitted: (result: { id: string; name: string }) => void
  /** The kind chosen in step 1, so the map can draw the pin in its color. */
  onKindChange?: (kind: SubmissionKind) => void
  /** Already chosen (`add=shop` in the URL): starts at the location step. */
  initialKind?: SubmissionKind | null
  /** The step shown (0 type, 1 location, 2 details, 3 review): the map only moves the pin on the location step. */
  onStepChange?: (step: number) => void
}

/**
 * Add a place, in the map's left panel, as the prototype has it: type →
 * location (search, a click on the map, or dragging the pin) → details →
 * review. Places of the same kind within 150 m show as a warning; sending
 * one anyway needs a tick. Errors show next to their field.
 */
export function AddPlaceSheet({ pin, onPinChange, onCancel, onSubmitted, onKindChange, onStepChange, initialKind = null }: AddPlaceSheetProps) {
  const [step, setStep] = useState(initialKind ? 1 : 0)
  const [kind, setKind] = useState<SubmissionKind | null>(initialKind)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft | "form", string>>>({})
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const id = useId()

  // Focus the step's heading when the step changes, so screen readers hear where they are.
  useEffect(() => {
    headingRef.current?.focus()
    onStepChange?.(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Places of this kind near the pin, as soon as it's placed or moved.
  const pinKey = pin ? `${pin.lng.toFixed(5)},${pin.lat.toFixed(5)}` : ""
  useEffect(() => {
    if (!pin || !kind) return setDuplicates([])
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/submissions/duplicates?kind=${kind}&lng=${pin.lng}&lat=${pin.lat}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { duplicates: [] }))
        .then((b: { duplicates: DuplicateCandidate[] }) => {
          setDuplicates(b.duplicates)
          setConfirmed(false)
        })
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, kind])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  /** Checks the details as the server will; shows the first problem per field. */
  const validate = (): boolean => {
    if (!kind || !pin) return false
    const parsed = submissionSchema.safeParse(toSubmission(kind, pin, draft))
    const next: typeof errors = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]) as keyof Draft
        const key: keyof Draft = field === ("isFree" as keyof Draft) ? "cost" : field
        next[key] ??= issue.message === "Required" || issue.message.startsWith("Invalid") ? "Check this field." : issue.message
      }
    }
    if (kind === "event" && !draft.startsAt) next.startsAt = "Pick when it starts."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const next = () => {
    if (step === 2 && !validate()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const back = () => (step === 0 ? onCancel() : setStep((s) => s - 1))

  const submit = async () => {
    if (!kind || !pin || sending) return
    setSending(true)
    setErrors({})
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submission: toSubmission(kind, pin, draft), confirmDuplicate: confirmed }),
      })
      const body = await res.json().catch(() => ({}))
      track("add_place_submit", { kind, outcome: res.status === 201 ? "sent" : res.status === 409 ? "duplicate" : "error" })
      if (res.status === 201) return onSubmitted({ id: body.id, name: draft.name.trim() })
      if (res.status === 409) {
        setDuplicates(body.duplicates ?? [])
        setConfirmed(false)
        return setErrors({ form: "Places like this are close by. Check them, then tick the box to send it anyway." })
      }
      if (res.status === 400 && body.field && body.field in EMPTY) {
        setErrors({ [body.field]: body.error })
        return setStep(2)
      }
      if (res.status === 401) return setErrors({ form: "Your session ended. Log in again to send this." })
      setErrors({ form: body.error ?? "Couldn't send it. Try again." })
    } catch {
      setErrors({ form: "Couldn't reach PokeFindr. Check your connection and try again." })
    } finally {
      setSending(false)
    }
  }

  const canNext = step === 0 ? Boolean(kind) : step === 1 ? Boolean(pin) : true
  const needsConfirm = duplicates.length > 0 && !confirmed

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-4 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={back} className="-ml-2 text-muted-foreground">
            <ArrowLeftIcon aria-hidden />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <span className="flex-1" />
          {step > 0 && (
            <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="size-8 text-muted-foreground" aria-label="Cancel adding a place">
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-heading text-foreground outline-none">
          {kind ? `Add a ${KINDS[kind].one}` : "Add a place"}
        </h2>
        <ol className="flex gap-1.5" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col gap-1" aria-current={i === step ? "step" : undefined}>
              <span aria-hidden className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
              <span className={cn("text-caption", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                <span className="sr-only">Step {i + 1} of {STEPS.length}: </span>
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-3">
        {step === 0 && (
          <RadioGroup
            value={kind ?? ""}
            onValueChange={(v) => {
              setKind(v as SubmissionKind)
              onKindChange?.(v as SubmissionKind)
            }}
            aria-label="What are you adding?"
            className="gap-2"
          >
            {(["shop", "event"] as const).map((k) => (
              <Label
                key={k}
                htmlFor={`${id}-${k}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`${id}-${k}`} value={k} className="mt-0.5" />
                <KindDot kind={k} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-subheading">{k === "shop" ? "Card shop" : "Event"}</span>
                  <span className="text-body font-normal text-muted-foreground">
                    {k === "shop" ? "A store that sells cards: singles, sealed product or supplies." : "A tournament, league night, prerelease, card show or trade night."}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}

        {step === 1 && kind && (
          <div className="flex flex-col gap-3">
            <AddressSearch
              onPick={(r) => {
                onPinChange({ lng: r.lng, lat: r.lat })
                setDraft((d) => ({ ...d, ...splitLabel(r) }))
              }}
            />
            <p className="text-body text-muted-foreground">
              <MapPinIcon className="mr-1 inline size-4 align-[-3px]" aria-hidden />
              Or click the map to drop the pin there. Drag the pin to put it on the entrance.
            </p>
            {pin && (
              <p className="text-caption text-muted-foreground tabular-nums">
                Pin at {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </p>
            )}
            <DuplicateWarning duplicates={duplicates} kind={kind} />
          </div>
        )}

        {step === 2 && kind && (
          <div className="flex flex-col gap-3">
            <Field id={`${id}-name`} label="Name" required error={errors.name}>
              <Input id={`${id}-name`} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={kind === "shop" ? "Mile High Cards" : "League night"} />
            </Field>
            {kind === "event" && (
              <>
                <Field id={`${id}-venue`} label="Venue" hint="Where it's held, if it has a name." error={errors.venue}>
                  <Input id={`${id}-venue`} value={draft.venue} onChange={(e) => set("venue", e.target.value)} />
                </Field>
                <p className="-mb-1 text-caption text-muted-foreground">
                  In the event&apos;s local time: {zoneName(eventZone(draft))}
                  {STATE_ZONES[draft.state.trim().toUpperCase()] ? "" : ", yours. Fill in the state below to use the event's."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field id={`${id}-starts`} label="Starts" required error={errors.startsAt}>
                    <Input id={`${id}-starts`} type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
                  </Field>
                  <Field id={`${id}-ends`} label="Ends" error={errors.endsAt}>
                    <Input id={`${id}-ends`} type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
                  </Field>
                </div>
              </>
            )}
            <Field id={`${id}-address`} label="Street address" hint={kind === "shop" ? "Moderators check shops have one." : undefined} error={errors.address}>
              <Input id={`${id}-address`} value={draft.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <Field id={`${id}-city`} label="City" required error={errors.city}>
                <Input id={`${id}-city`} value={draft.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />
              </Field>
              <Field id={`${id}-state`} label="State" error={errors.state}>
                <Input id={`${id}-state`} value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase())} maxLength={2} autoComplete="address-level1" />
              </Field>
            </div>
            {kind === "shop" ? (
              <>
                <Field id={`${id}-website`} label="Website" error={errors.website}>
                  <Input id={`${id}-website`} type="url" inputMode="url" value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
                </Field>
                <Field id={`${id}-hours`} label="Hours" hint="For example: Mon–Sat 11 AM–8 PM" error={errors.hours}>
                  <Input id={`${id}-hours`} value={draft.hours} onChange={(e) => set("hours", e.target.value)} />
                </Field>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-body font-medium">Sells</legend>
                  {SHOP_SELLS.map((s) => (
                    <Label key={s} htmlFor={`${id}-sells-${s}`} className="flex items-center gap-2 font-normal">
                      <Checkbox
                        id={`${id}-sells-${s}`}
                        checked={draft.sells.includes(s)}
                        onCheckedChange={(on) => set("sells", on ? [...draft.sells, s] : draft.sells.filter((x) => x !== s))}
                      />
                      {SHOP_SELLS_LABELS[s]}
                    </Label>
                  ))}
                </fieldset>
              </>
            ) : (
              <>
                <Field id={`${id}-link`} label="Link" hint="The organizer's page or sign-up." error={errors.link}>
                  <Input id={`${id}-link`} type="url" inputMode="url" value={draft.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" />
                </Field>
                <fieldset>
                  <legend className="mb-2 text-body font-medium">Entry</legend>
                  <RadioGroup value={draft.cost} onValueChange={(v) => set("cost", v as Draft["cost"])} className="flex gap-4">
                    {(["free", "paid"] as const).map((c) => (
                      <Label key={c} htmlFor={`${id}-cost-${c}`} className="flex items-center gap-2 font-normal">
                        <RadioGroupItem id={`${id}-cost-${c}`} value={c} />
                        {c === "free" ? "Free" : "Paid"}
                      </Label>
                    ))}
                  </RadioGroup>
                </fieldset>
              </>
            )}
          </div>
        )}

        {step === 3 && kind && pin && (
          <div className="flex flex-col gap-3">
            <Review kind={kind} draft={draft} />
            <DuplicateWarning duplicates={duplicates} kind={kind} />
            {duplicates.length > 0 && (
              <Label htmlFor={`${id}-confirm`} className="flex items-start gap-2 font-normal">
                <Checkbox id={`${id}-confirm`} checked={confirmed} onCheckedChange={(on) => setConfirmed(on === true)} className="mt-0.5" />
                I checked these. This is a different place.
              </Label>
            )}
            <p className="text-body text-muted-foreground">
              A moderator checks it before it goes on the map. Until then only you can see it, marked Pending review.
            </p>
          </div>
        )}

        {errors.form && (
          <p role="alert" className="mt-3 text-body text-destructive">
            {errors.form}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t border-border px-3 py-2.5">
        {step < 3 ? (
          <Button type="button" className="flex-1" onClick={next} disabled={!canNext}>
            {step === 1 && !pin ? "Place the pin to continue" : "Continue"}
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={submit} disabled={sending || needsConfirm}>
            {sending ? "Sending…" : "Send for review"}
          </Button>
        )}
      </div>
    </>
  )
}

/** A labelled input, its hint, and its error, which the input points at (aria-describedby) while it's invalid. */
function Field({ id, label, hint, required, error, children }: { id: string; label: string; hint?: string; required?: boolean; error?: string; children: ReactElement<InputProps> }) {
  const note = error || hint ? `${id}-note` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": note,
        "aria-required": required || undefined,
        className: cn(children.props.className, error && "border-destructive"),
      })}
      {note && (
        <p id={note} className={cn("text-caption", error ? "text-destructive" : "text-muted-foreground")}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

function DuplicateWarning({ duplicates, kind }: { duplicates: DuplicateCandidate[]; kind: SubmissionKind }) {
  if (!duplicates.length) return null
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-warning/45 bg-warning/5 p-3">
      <p className="flex items-center gap-1.5 text-body font-semibold text-foreground">
        <TriangleAlertIcon className="size-4 text-warning" aria-hidden />
        This might already be on the map
      </p>
      <ul className="flex flex-col gap-1">
        {duplicates.map((d) => (
          <li key={d.id} className="text-body text-muted-foreground">
            <span className="font-medium text-foreground">{d.name || `A ${KINDS[kind].one}`}</span>
            {d.source === "submission" ? " (yours, waiting for review)" : ""} · {d.meters} m away
            {d.address ? ` · ${d.address}` : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Review({ kind, draft }: { kind: SubmissionKind; draft: Draft }) {
  const zone = eventZone(draft)
  const when = (v: string) => (v ? `${formatInZone(zonedToIso(v, zone), zone)}` : "")
  const rows: [string, string][] = [
    ["Name", draft.name],
    ...(kind === "event"
      ? ([["Venue", draft.venue], ["When", [[when(draft.startsAt), when(draft.endsAt)].filter(Boolean).join(" – "), draft.startsAt ? zoneName(zone) : ""].filter(Boolean).join(", ")]] as [string, string][])
      : []),
    ["Address", [draft.address, [draft.city, draft.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")],
    ...(kind === "shop"
      ? ([["Website", draft.website], ["Hours", draft.hours], ["Sells", draft.sells.map((s) => SHOP_SELLS_LABELS[s as keyof typeof SHOP_SELLS_LABELS]).join(", ")]] as [string, string][])
      : ([["Link", draft.link], ["Entry", draft.cost === "free" ? "Free" : draft.cost === "paid" ? "Paid" : ""]] as [string, string][])),
  ]
  return (
    <dl className="grid">
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-border py-2">
          <dt className="text-body text-muted-foreground">{term}</dt>
          <dd className="m-0 min-w-0 break-words text-body">{value || <span className="text-muted-foreground">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A small address search for the location step: picks move the pin. */
function AddressSearch({ onPick }: { onPick: (r: GeocodeResult) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<GeocodeResult[] | null>(null)
  const [failed, setFailed] = useState(false)
  const id = useId()
  // The label of the result just picked: showing it in the box isn't a new search.
  const picked = useRef<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 3 || q === picked.current) return setResults(null)
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchPlaces(q, { limit: 5, signal: ctl.signal })
        .then((r) => {
          setResults(r)
          setFailed(false)
        })
        .catch((e) => {
          if (!ctl.signal.aborted) setFailed(Boolean(e))
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-q`}>Search an address</Label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={`${id}-q`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" placeholder="1450 Grant St, Denver" autoComplete="off" />
      </div>
      {failed && <p className="text-caption text-destructive">Search isn&apos;t working right now. Click the map instead.</p>}
      {results && (
        <ul className="flex flex-col rounded-lg border border-border p-1" aria-label="Addresses">
          {results.length ? (
            results.map((r) => (
              <li key={`${r.label}-${r.lng}-${r.lat}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r)
                    picked.current = r.label
                    setResults(null)
                    setQ(r.label)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {r.label}
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-1.5 text-body text-muted-foreground">No match. Try a street and city, or click the map.</li>
          )}
        </ul>
      )}
    </div>
  )
}
