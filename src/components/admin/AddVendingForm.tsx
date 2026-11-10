"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useId, useMemo, useState } from "react"
import { LocateFixedIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KindDot } from "@/components/pokefindr/KindDot"
import { Pill } from "@/components/admin/Pill"
import { useRefreshSummary } from "@/components/admin/useRefreshSummary"
import { MACHINE_ID, normalizeMachineId } from "@/lib/locations/address"
import { OVERLAP_LABELS, formatPin, parseCityState, parsePin, type VendingOverlap } from "@/lib/admin/vending"
import { mapUrl } from "@/lib/map/url-state"
import { cn } from "@/lib/utils"

interface Draft {
  retailer: string
  machineId: string
  address: string
  cityState: string
  pin: string
}

const EMPTY: Draft = { retailer: "", machineId: "", address: "", cityState: "", pin: "" }

type Check = { status: "idle" } | { status: "checking" } | { status: "clear" } | { status: "overlap"; overlaps: VendingOverlap[] } | { status: "error" }

interface Added {
  id: string
  label: string
  undone: boolean
}

const feet = (meters: number) => `${Math.round(meters * 3.281).toLocaleString("en-US")} ft`

/** What the form has, ready to send, or null while a field is missing or malformed. */
function complete(d: Draft) {
  const place = parseCityState(d.cityState)
  const pin = parsePin(d.pin)
  const machineId = normalizeMachineId(d.machineId)
  if (!d.retailer.trim() || !MACHINE_ID.test(machineId) || !d.address.trim() || !place || !pin) return null
  return { retailer: d.retailer.trim(), machineId, address: d.address.trim(), city: place.city, state: place.state, lat: pin.lat, lng: pin.lng }
}

/** Retailers and cities to suggest (#155): the map's known ones. */
function useSuggestions(state: string | null) {
  const [retailers, setRetailers] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  useEffect(() => {
    fetch("/api/locations/retailers")
      .then((r) => (r.ok ? (r.json() as Promise<{ retailers: { retailer: string }[] }>) : null))
      .then((b) => b && setRetailers(b.retailers.map((r) => r.retailer)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!state) return setCities([])
    const ctl = new AbortController()
    fetch(`/api/locations/cities?state=${state}&types=vending`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ cities: { city: string }[] }>) : null))
      .then((b) => b && setCities(b.cities.map((c) => `${c.city}, ${state}`)))
      .catch(() => {})
    return () => ctl.abort()
  }, [state])
  return { retailers, cities }
}

/**
 * Locations → Add vending machine (#155), as in the prototype: the form,
 * and beside it a live duplicate check. Adding is disabled while anything
 * overlaps (no override; the server checks again). What was added this
 * visit is listed with View and Undo.
 */
export function AddVendingForm() {
  const refreshSummary = useRefreshSummary()
  const ids = useId()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [check, setCheck] = useState<Check>({ status: "idle" })
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [added, setAdded] = useState<Added[]>([])
  const ready = useMemo(() => complete(draft), [draft])
  const { retailers, cities } = useSuggestions(parseCityState(draft.cityState)?.state ?? null)
  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [field]: e.target.value }))

  // The live check: what the machine ID, address and pin overlap, a moment after typing stops.
  const pin = parsePin(draft.pin)
  const place = parseCityState(draft.cityState)
  const key = JSON.stringify([normalizeMachineId(draft.machineId), draft.address.trim(), place?.state ?? "", pin])
  useEffect(() => {
    if (!pin || !place || (!draft.machineId.trim() && !draft.address.trim())) return setCheck({ status: "idle" })
    setCheck({ status: "checking" })
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch("/api/admin/vending/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machineId: normalizeMachineId(draft.machineId), address: draft.address.trim(), state: place.state, lat: pin.lat, lng: pin.lng }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ overlaps: VendingOverlap[] }>) : Promise.reject(new Error(`check answered ${r.status}`))))
        .then(({ overlaps }) => setCheck(overlaps.length ? { status: "overlap", overlaps } : { status: "clear" }))
        .catch((err) => !ctl.signal.aborted && (console.error("[admin] duplicate check failed", err), setCheck({ status: "error" })))
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // `key` covers what the check reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const fillCityCenter = async () => {
    if (!place) return setError("Fill in the city and state first, like Kirkland, WA.")
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(`${place.city}, ${place.state}`)}&limit=1`)
      const hit = ((await res.json()) as { results?: { lat: number; lng: number }[] }).results?.[0]
      if (!hit) return setError(`Couldn't find ${place.city}, ${place.state}.`)
      setError(null)
      setDraft((d) => ({ ...d, pin: formatPin(hit.lat, hit.lng) }))
    } catch {
      setError("Couldn't look up the city. Type the pin instead.")
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || check.status !== "clear" || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/vending", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ready) })
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; overlaps?: VendingOverlap[] }
      if (res.status === 201 && body.id) {
        const label = `${ready.retailer} ${ready.machineId}`
        setAdded((a) => [{ id: body.id!, label: `${label} · ${ready.city}, ${ready.state}`, undone: false }, ...a])
        toast.success(`${label} is on the map`)
        setDraft(EMPTY)
        refreshSummary()
        return
      }
      if (res.status === 409 && body.overlaps) setCheck({ status: "overlap", overlaps: body.overlaps })
      setError(body.error ?? "Couldn't add it. Try again.")
    } catch {
      setError("Couldn't reach PokeFindr. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const undo = async (item: Added) => {
    const res = await fetch(`/api/admin/vending/${item.id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) return toast.error("Couldn't undo it. Try again.")
    setAdded((a) => a.map((x) => (x.id === item.id ? { ...x, undone: true } : x)))
    toast(`${item.label.split(" · ")[0]} is off the map`)
    refreshSummary()
  }

  const field = (id: keyof Draft) => `${ids}-${id}`
  const blocked = check.status === "overlap"

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          {/* Suggestions for Retailer and City and state; outside the grids, so they take no row. */}
          <datalist id={`${ids}-retailers`}>
            {retailers.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <datalist id={`${ids}-cities`}>
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div>
            <h2 className="text-subheading text-foreground">Add a vending machine</h2>
            <p className="text-body text-muted-foreground">For machines missing from the official list. It goes live as soon as you add it.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor={field("retailer")}>
                Retailer <span aria-hidden className="text-destructive">*</span>
              </Label>
              <Input id={field("retailer")} required list={`${ids}-retailers`} autoComplete="off" value={draft.retailer} onChange={set("retailer")} placeholder="Fred Meyer" />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor={field("machineId")}>
                Machine ID <span aria-hidden className="text-destructive">*</span>
              </Label>
              <Input
                id={field("machineId")}
                required
                autoComplete="off"
                value={draft.machineId}
                onChange={set("machineId")}
                placeholder="Q01557"
                aria-describedby={`${field("machineId")}-hint`}
                aria-invalid={draft.machineId !== "" && !MACHINE_ID.test(normalizeMachineId(draft.machineId))}
                className="font-mono"
              />
              <p id={`${field("machineId")}-hint`} className="text-caption text-muted-foreground">
                Q and five digits, on the sticker on the front of the machine
              </p>
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={field("address")}>
              Street address <span aria-hidden className="text-destructive">*</span>
            </Label>
            <Input id={field("address")} required autoComplete="off" value={draft.address} onChange={set("address")} placeholder="12221 120th Ave NE" />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={field("cityState")}>
              City and state <span aria-hidden className="text-destructive">*</span>
            </Label>
            <Input id={field("cityState")} required list={`${ids}-cities`} autoComplete="off" value={draft.cityState} onChange={set("cityState")} placeholder="Kirkland, WA" />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={field("pin")}>
              Pin <span aria-hidden className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id={field("pin")}
                required
                autoComplete="off"
                inputMode="decimal"
                value={draft.pin}
                onChange={set("pin")}
                placeholder="47.70793, -122.18380"
                aria-describedby={`${field("pin")}-hint`}
                aria-invalid={draft.pin !== "" && !pin}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={() => void fillCityCenter()}>
                <LocateFixedIcon aria-hidden />
                Use city center
              </Button>
            </div>
            <p id={`${field("pin")}-hint`} className="text-caption text-muted-foreground">
              Latitude, longitude. Put it on the store entrance.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body text-foreground">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => (setDraft(EMPTY), setError(null))}>
              Clear form
            </Button>
            <Button type="submit" disabled={!ready || check.status !== "clear" || sending}>
              <PlusIcon aria-hidden />
              {sending ? "Adding…" : "Add vending machine"}
            </Button>
          </div>
        </form>

        {added.length > 0 && (
          <section aria-labelledby={`${ids}-added`} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 id={`${ids}-added`} className="text-subheading text-foreground">
              Added this visit
            </h2>
            <ul className="mt-2 flex flex-col">
              {added.map((a) => (
                <li key={a.id} className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
                  <KindDot kind="vending" />
                  <span className={cn("min-w-0 flex-1 truncate text-body", a.undone && "text-muted-foreground line-through")}>{a.label}</span>
                  {a.undone ? (
                    <Pill tone="idle">Undone</Pill>
                  ) : (
                    <>
                      <Link href={mapUrl("/map", { location: a.id })} target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        View
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => void undo(a)}>
                        Undo
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-labelledby={`${ids}-check`} aria-live="polite" className={cn("rounded-xl border bg-card", blocked ? "border-destructive" : "border-border")}>
        <div className="flex items-start gap-2 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${ids}-check`} className="text-subheading text-foreground">
              Duplicate check
            </h2>
            <p className="text-body text-muted-foreground">
              {check.status === "idle" && "Fill in the machine ID, address, city and pin to check them against the map."}
              {check.status === "checking" && "Checking…"}
              {check.status === "clear" && "Nothing on the map overlaps this machine."}
              {check.status === "overlap" && "This overlaps an existing machine, so it can't be added. Open the match to check it instead."}
              {check.status === "error" && "Couldn't run the check. Adding stays off until it runs."}
            </p>
          </div>
          {check.status === "clear" && <Pill tone="ok">No overlap</Pill>}
          {blocked && <Pill tone="crit">Already on the map</Pill>}
        </div>
        {blocked && (
          <ul className="flex flex-col">
            {check.overlaps.map((o) => (
              <li key={o.id} className="flex items-start gap-2.5 border-b border-border p-4">
                <KindDot kind="vending" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-body">
                    <span className="font-semibold text-foreground">{o.retailer}</span> <span className="font-mono text-caption text-muted-foreground">{o.machineId}</span>
                  </div>
                  <div className="text-caption text-muted-foreground">{[o.address, [o.city, o.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {o.reasons.map((r) => (
                      <Pill key={r} tone="crit">
                        {OVERLAP_LABELS[r]}
                      </Pill>
                    ))}
                    {!o.active && <Pill tone="idle">Off the map</Pill>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-caption text-muted-foreground">{feet(o.meters)}</span>
                  {o.active && (
                    <Link href={mapUrl("/map", { location: o.id })} target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Open
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="p-4 text-caption text-muted-foreground">
          Blocks a machine with the same machine ID, the same address, or a pin within 260 ft of an existing one. Addresses are compared after normalizing (Avenue = Ave,
          Northeast = NE).
        </p>
      </section>
    </div>
  )
}
