"use client"

import { useCallback, useEffect, useState } from "react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { KINDS } from "@/components/pokefindr/kinds"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { REJECT_REASON_LABELS } from "@/lib/submissions/constants"
import type { MySubmission } from "@/lib/submissions/schemas"
import { cn } from "@/lib/utils"
import { Marker } from "./engine"
import type { Pin } from "./AddPlaceSheet"

/**
 * The signed-in person's submissions (GET /api/submissions?mine), and a
 * `refresh` to call after sending one. Null while signed out or loading.
 */
export function useMySubmissions(signedIn: boolean): { submissions: MySubmission[] | null; refresh: () => void } {
  const [submissions, setSubmissions] = useState<MySubmission[] | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!signedIn) return setSubmissions(null)
    const ctl = new AbortController()
    fetch("/api/submissions?mine", { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ submissions: MySubmission[] }>) : null))
      .then((b) => b && setSubmissions(b.submissions))
      .catch(() => {})
    return () => ctl.abort()
  }, [signedIn, version])
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { submissions, refresh }
}

/** The pin being placed in Add a place: the kind's color, draggable. */
export function AddPin({ pin, kind, onMove }: { pin: Pin; kind: "shop" | "event" | null; onMove: (pin: Pin) => void }) {
  return (
    <Marker
      longitude={pin.lng}
      latitude={pin.lat}
      anchor="bottom"
      draggable
      onDragEnd={(e) => onMove({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
    >
      <span
        role="img"
        aria-label="New place's pin. Drag it to move it."
        className={cn("block size-7 cursor-grab rounded-full rounded-br-none border-[3px] border-card shadow-md [transform:rotate(45deg)] active:cursor-grabbing", kind ? KINDS[kind].bg : "bg-primary")}
      />
    </Marker>
  )
}

/** The person's pending submissions on the map: a dashed ring in the kind's color. Nobody else sees them. */
export function PendingMarkers({ submissions, onOpen }: { submissions: readonly MySubmission[]; onOpen: (s: MySubmission) => void }) {
  return (
    <>
      {submissions
        .filter((s) => s.status === "pending")
        .map((s) => (
          <Marker key={s.id} longitude={s.lng} latitude={s.lat}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              aria-label={`${s.name}, pending review`}
              title={`${s.name} · Pending review`}
              className="grid size-6 place-items-center rounded-full border-2 border-dashed border-warning bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KindDot kind={s.kind} className="size-4 [&_svg]:size-2.5" />
            </button>
          </Marker>
        ))}
    </>
  )
}

const STATUS_NOTE = {
  pending: "Only you can see it until a moderator checks it.",
  approved: "On the map for everyone.",
} as const

/** "Your submissions" in the US sheet: each with its status, and why when it wasn't approved. */
export function SubmissionRows({ submissions, onOpen }: { submissions: readonly MySubmission[]; onOpen: (s: MySubmission) => void }) {
  return (
    <>
      {submissions.slice(0, 5).map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onOpen(s)}
            className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KindDot kind={s.kind} className="mt-px" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-foreground">
                {s.name}
                {s.status === "pending" ? (
                  <StatusBadge status="pending" />
                ) : s.status === "approved" && s.locationActive === false ? (
                  <StatusBadge status="sample">{s.kind === "event" ? "Ended" : "Off the map"}</StatusBadge>
                ) : s.status === "approved" ? (
                  <StatusBadge status="live" />
                ) : (
                  <StatusBadge status="sample" className="border-destructive/40 text-destructive">
                    Not approved
                  </StatusBadge>
                )}
              </span>
              <span className="block truncate text-body text-muted-foreground">
                {s.status === "rejected"
                  ? s.rejectReason
                    ? REJECT_REASON_LABELS[s.rejectReason]
                    : "Not approved"
                  : s.status === "approved" && s.locationActive === false
                    ? s.kind === "event"
                      ? "It's over, so it's off the map."
                      : "It isn't on the map anymore."
                    : STATUS_NOTE[s.status]}
              </span>
            </span>
          </button>
        </li>
      ))}
    </>
  )
}
