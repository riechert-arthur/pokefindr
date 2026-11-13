"use client"

import { useCallback, useEffect, useState } from "react"
import { MegaphoneIcon } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { LoadFailed } from "@/components/admin/LoadFailed"
import { Pill } from "@/components/admin/Pill"
import type { SponsorPlacement } from "@/config/banners"

const PLACEMENTS: { id: SponsorPlacement; title: string; sub: string }[] = [
  { id: "results", title: "Map results list", sub: "One card after the third result. Never on the map itself." },
  { id: "details", title: "Location details", sub: "After the facts on a live location. Hidden while the report form is open." },
  { id: "landing", title: "Landing page strip", sub: "A band between “How it works” and the location types." },
]

type Data = { placements: Record<SponsorPlacement, boolean>; sponsors: string[] }

/**
 * System → Ads (#159), as in the prototype: one switch per sponsored
 * placement, and the rules every slot follows. A change applies to
 * everyone from their next page load.
 */
export function AdsSwitches() {
  const [data, setData] = useState<Data | null | "error">(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ads", { cache: "no-store" })
      if (!res.ok) throw new Error(`ads answered ${res.status}`)
      setData((await res.json()) as Data)
    } catch (err) {
      console.error("[admin] couldn't load ad placements", err)
      setData((d) => (d && d !== "error" ? d : "error"))
    }
  }, [])
  useEffect(() => void load(), [load])

  const flip = async (id: SponsorPlacement, on: boolean, title: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/ads/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: on }) })
      if (!res.ok) toast.error("That didn't work. Try again.")
      else toast.success(on ? `${title}: on` : `${title}: off`, { description: on ? "It shows the sponsored card again from the next page load." : "It no longer shows the sponsored card from the next page load." })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (data === null) return <p className="text-body text-muted-foreground">Loading placements…</p>
  if (data === "error") return <LoadFailed what="the placements" onRetry={() => void load()} />

  return (
    <div className="flex flex-col gap-3">
      {PLACEMENTS.map((p) => {
        const on = data.placements[p.id]
        return (
          <section key={p.id} aria-labelledby={`ad-${p.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <h2 id={`ad-${p.id}`} className="text-subheading text-foreground">
                {p.title}
              </h2>
              <p className="text-body text-muted-foreground">{p.sub}</p>
            </div>
            <Pill tone={on ? "ok" : "idle"}>{on ? "Showing" : "Off"}</Pill>
            {/* aria-disabled, not disabled, while a change saves: a disabled switch would drop keyboard focus. */}
            <Switch
              checked={on}
              aria-labelledby={`ad-${p.id}`}
              aria-disabled={busy || undefined}
              onCheckedChange={(next) => void flip(p.id, next, p.title)}
              // The prototype's sizes and colors: off on the border color, on in success.
              className="h-[22px] w-[38px] data-[state=checked]:bg-success data-[state=unchecked]:bg-border aria-disabled:opacity-50"
            />
          </section>
        )
      })}
      <p className="flex items-start gap-2 rounded-xl border border-dashed border-border p-4 text-body text-muted-foreground">
        <MegaphoneIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Every slot is labeled Sponsored, can be dismissed for the visit, and uses rel=&quot;sponsored&quot; links. Forms, the map canvas and the assistant never show ads.{" "}
          {data.sponsors.length ? `Current sponsor: ${data.sponsors.join(", ")}.` : "No sponsor is set up, so no slot shows."}
        </span>
      </p>
    </div>
  )
}
