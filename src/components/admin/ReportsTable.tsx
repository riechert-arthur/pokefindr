"use client"

import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useState } from "react"
import { FlagIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KindDot } from "@/components/pokefindr/KindDot"
import { toKind } from "@/components/pokefindr/kinds"
import { Pill, type PillTone } from "@/components/admin/Pill"
import { useRefreshSummary } from "@/components/admin/useRefreshSummary"
import { REPORT_REASON_LABELS, type ReportAction } from "@/lib/locations/reports"
import { REPORTS_HOT, type ReportedLocation } from "@/lib/admin/reports"
import { mapUrl } from "@/lib/map/url-state"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; rows: ReportedLocation[] }

const STATUS: Record<ReportedLocation["status"], [PillTone, string]> = {
  open: ["warn", "Open"],
  dismissed: ["idle", "Dismissed"],
  fixed: ["ok", "Fixed"],
  hidden: ["crit", "Hidden"],
}

const DONE: Record<ReportAction, string> = { dismiss: "dismissed", fix: "marked fixed", hide: "hidden", reopen: "reopened" }

const th = "px-3 py-2.5 text-left text-caption font-semibold text-muted-foreground"
const td = "px-3 py-3 align-top text-body"

/**
 * Moderation → Reports (#153), as in the prototype: each reported location
 * once, open ones first and most reported first, with what to do about it.
 * Hiding takes it off the map for everyone; Reopen undoes the last action.
 */
export function ReportsTable() {
  const f = useFormat()
  const refreshSummary = useRefreshSummary()
  const [load, setLoad] = useState<Load>({ status: "loading" })
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports", { cache: "no-store" })
      if (!res.ok) throw new Error(`reports answered ${res.status}`)
      setLoad({ status: "ready", rows: ((await res.json()) as { locations: ReportedLocation[] }).locations })
    } catch (err) {
      console.error("[admin] couldn't load reports", err)
      setLoad((l) => (l.status === "ready" ? l : { status: "error" }))
    }
  }, [])
  useEffect(() => void refresh(), [refresh])

  const act = async (row: ReportedLocation, action: ReportAction) => {
    setBusy(row.location.id)
    try {
      const res = await fetch(`/api/admin/reports/${row.location.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) toast.error(data.error ?? "That didn't work. Try again.")
      else
        toast.success(`${row.location.name || "The location"}: ${DONE[action]}`, {
          description: action === "hide" ? "It's off the map for everyone." : action === "reopen" && row.status === "hidden" ? "It's back on the map." : undefined,
          ...(action !== "reopen" && { action: { label: "Undo", onClick: () => void act({ ...row, status: "dismissed" }, "reopen") } }),
        })
      await refresh()
      refreshSummary()
    } finally {
      setBusy(null)
    }
  }

  if (load.status === "loading") return <p className="text-body text-muted-foreground">Loading reports…</p>
  if (load.status === "error")
    return (
      <EmptyState icon={TriangleAlertIcon} title="Couldn't load reports" action={<Button onClick={() => void refresh()}>Try again</Button>}>
        Check your connection, then try again.
      </EmptyState>
    )
  if (load.rows.length === 0)
    return (
      <EmptyState icon={FlagIcon} title="Nothing reported">
        Problems people report on live locations show up here.
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[860px] border-collapse">
          <caption className="sr-only">Reported locations, open ones first</caption>
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className={th}>Location</th>
              <th scope="col" className={th}>Problem</th>
              <th scope="col" className={th}>Reports</th>
              <th scope="col" className={th}>Last report</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={cn(th, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {load.rows.map((row) => {
              const { location: l } = row
              const [tone, label] = STATUS[row.status]
              const open = row.status === "open"
              const disabled = busy !== null
              return (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className={td}>
                    <div className="flex items-start gap-2.5">
                      <KindDot kind={toKind(l.kind)} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{l.name || "Unnamed"}</div>
                        <div className="text-caption text-muted-foreground">{[l.address, [l.city, l.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</div>
                        {l.machineId && <div className="font-mono text-caption text-muted-foreground">{l.machineId}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={td}>{row.reason ? REPORT_REASON_LABELS[row.reason] : "—"}</td>
                  <td className={td}>
                    <Pill tone={open && row.open >= REPORTS_HOT ? "crit" : open ? "warn" : "idle"}>{open ? row.open : row.total}</Pill>
                  </td>
                  <td className={td}>
                    <div className="text-foreground">{f.ago(row.lastReportAt)}</div>
                    {row.lastAction && (
                      <div className="text-caption text-muted-foreground">
                        {DONE[row.lastAction.action].replace(/^./, (c) => c.toUpperCase())} by {row.lastAction.by}, {f.ago(row.lastAction.at)}
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    <Pill tone={tone}>{label}</Pill>
                  </td>
                  <td className={cn(td, "text-right")}>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!l.hidden && (
                        <Link href={mapUrl("/map", { location: l.id })} target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`View ${l.name} on the map`}>
                          View
                        </Link>
                      )}
                      {open ? (
                        <>
                          <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(row, "dismiss")}>
                            Dismiss
                          </Button>
                          <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(row, "fix")}>
                            Mark fixed
                          </Button>
                          <Button size="sm" variant="destructive" disabled={disabled} onClick={() => void act(row, "hide")}>
                            Hide location
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(row, "reopen")}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">
        Hiding a location takes it off the map for everyone, and the location import keeps it hidden. Reopen undoes the last action and brings a hidden location
        back. Resolved locations stay listed for 30 days.
      </p>
    </div>
  )
}
