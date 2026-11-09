"use client"

import { useCallback, useEffect, useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { Pill, type PillTone } from "@/components/admin/Pill"
import { resultText, type JobRow } from "@/lib/admin/jobs"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"

const th = "px-3 py-2.5 text-left text-caption font-semibold text-muted-foreground"
const td = "px-3 py-3 align-top text-body"

/** The status pill: paused first, then how the last run ended. */
function status(j: JobRow): [PillTone, string] {
  if (j.paused) return ["warn", "Paused"]
  switch (j.lastRun?.status) {
    case "succeeded":
      return ["ok", "Succeeded"]
    case "failed":
      return ["crit", "Failed"]
    case "running":
      return ["idle", "Running"]
    case "skipped":
      return ["warn", "Skipped"]
    default:
      return ["idle", "Never ran"]
  }
}

/**
 * System → Jobs (#157), as in the prototype: each background job, how it's
 * started, its last run and what it changed, and Run now. A paused job
 * says why and can't be run; Pause and Resume set its flag.
 */
export function JobsTable() {
  const f = useFormat()
  const [rows, setRows] = useState<JobRow[] | null | "error">(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs", { cache: "no-store" })
      if (!res.ok) throw new Error(`jobs answered ${res.status}`)
      setRows(((await res.json()) as { jobs: JobRow[] }).jobs)
    } catch (err) {
      console.error("[admin] couldn't load jobs", err)
      setRows((r) => (Array.isArray(r) ? r : "error"))
    }
  }, [])
  useEffect(() => void load(), [load])

  const act = async (job: JobRow, action: "run" | "pause" | "resume") => {
    setBusy(job.name)
    try {
      const res = await fetch(`/api/admin/jobs/${job.name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) toast.error(data.error ?? "That didn't work. Try again.")
      else toast.success(action === "run" ? `${job.name} started` : action === "pause" ? `${job.name} paused` : `${job.name} resumed`)
      // A run started now shows up a moment later.
      await load()
      if (action === "run") setTimeout(() => void load(), 3000)
    } finally {
      setBusy(null)
    }
  }

  if (rows === null) return <p className="text-body text-muted-foreground">Loading jobs…</p>
  if (rows === "error")
    return (
      <EmptyState icon={TriangleAlertIcon} title="Couldn't load jobs" action={<Button onClick={() => void load()}>Try again</Button>}>
        Check your connection, then try again.
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[820px] border-collapse">
          <caption className="sr-only">Background jobs</caption>
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className={th}>Job</th>
              <th scope="col" className={th}>Trigger</th>
              <th scope="col" className={th}>Last run</th>
              <th scope="col" className={th}>Result</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={cn(th, "text-right")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const [tone, label] = status(j)
              const run = j.lastRun
              return (
                <tr key={j.name} className="border-b border-border last:border-b-0">
                  <td className={td}>
                    <div className="font-mono text-caption font-semibold text-foreground">{j.name}</div>
                    <div className="text-caption text-muted-foreground">{j.description}</div>
                  </td>
                  <td className={td}>{j.trigger}</td>
                  <td className={td}>{run ? f.ago(run.startedAt) : "Never ran"}</td>
                  <td className={cn(td, "max-w-[18rem]")}>
                    {j.paused && !run ? j.paused : run?.status === "failed" ? <span className="text-destructive">{run.error ?? "Failed"}</span> : resultText(run?.result ?? null) || (run?.status === "running" ? "Running…" : "—")}
                  </td>
                  <td className={td}>
                    <Pill tone={tone}>{label}</Pill>
                    {j.paused && run && <div className="mt-1 text-caption text-muted-foreground">{j.paused}</div>}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                      {j.pausedHere ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(j, "resume")}>
                          Resume
                        </Button>
                      ) : (
                        !j.blocked &&
                        j.name !== "location-import" && (
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(j, "pause")}>
                            Pause
                          </Button>
                        )
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null || !j.runnable || j.paused !== null}
                        title={!j.runnable ? (j.blocked ?? "It runs on its own; it can't be run by hand.") : j.paused ? "Resume it first." : undefined}
                        onClick={() => void act(j, "run")}
                      >
                        Run now
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">
        Jobs run on Vercel Cron and Queues, and every run is recorded with its counts. A paused job is skipped on its schedule until it&apos;s resumed. The location import runs on
        each deploy.
      </p>
    </div>
  )
}
