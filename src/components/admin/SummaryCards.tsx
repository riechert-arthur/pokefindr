"use client"

import { Pill, type PillTone } from "@/components/admin/Pill"
import { KINDS, KIND_ORDER, formatCount } from "@/components/pokefindr/kinds"
import { REPORTS_HOT } from "@/lib/admin/reports"
import { queueIsLate, type AdminSummary } from "@/lib/admin/summary"
import { timeAgo } from "@/lib/format/time"
import type { StaffRole } from "@/lib/admin/roles"

interface Card {
  section: string
  label: string
  value: string
  detail: string
  pill: [PillTone, string]
  /** Admin-only sections: moderators don't see these cards. */
  admin?: boolean
}

function cards(s: AdminSummary): Card[] {
  const late = queueIsLate(s.queue)
  const r = s.reports
  const sync = s.sync
  return [
    {
      section: "queue",
      label: "Waiting for review",
      value: formatCount(s.queue.count),
      detail: s.queue.oldestAt ? `Oldest ${timeAgo(s.queue.oldestAt)}` : "Queue is clear",
      pill: s.queue.count ? (late ? ["warn", "Over 24 h"] : ["ok", "On time"]) : ["idle", "Empty"],
    },
    {
      section: "reports",
      label: "Open reports",
      value: formatCount(r.locations),
      detail: r.locations ? `${formatCount(r.reports)} ${r.reports === 1 ? "report" : "reports"} on ${formatCount(r.locations)} ${r.locations === 1 ? "location" : "locations"}` : "Nothing reported",
      pill: r.maxOnOne >= REPORTS_HOT ? ["crit", `${REPORTS_HOT}+ on one place`] : r.locations ? ["warn", "Needs a look"] : ["ok", "Clear"],
    },
    {
      section: "coverage",
      label: "Live on the map",
      value: formatCount(s.live.total),
      detail: KIND_ORDER.map((k) => `${formatCount(s.live.byKind[k] ?? 0)} ${KINDS[k].short.toLowerCase()}`).join(" · "),
      pill: ["ok", "Serving"],
      admin: true,
    },
    {
      section: "jobs",
      label: "Location sync",
      value: sync.status === "paused" ? "Paused" : sync.status === "never" ? "Not run" : sync.status === "succeeded" ? "Synced" : sync.status === "failed" ? "Failed" : "Running",
      detail: sync.status === "paused" ? (sync.detail ?? "Paused") : sync.at ? `Last run ${timeAgo(sync.at)}` : "No runs yet",
      pill: sync.status === "paused" ? ["warn", "Manual import only"] : sync.status === "failed" ? ["crit", "Failed"] : sync.status === "succeeded" ? ["ok", "Healthy"] : ["idle", "Waiting"],
      admin: true,
    },
  ]
}

/**
 * The four cards above every admin section (#158): what needs attention
 * first. Each opens its section. They refresh with the sidebar's counts,
 * after every approve, reject, hide and add.
 */
export function SummaryCards({ summary, role, onOpen }: { summary: AdminSummary | null; role: StaffRole; onOpen: (section: string) => void }) {
  const shown = summary ? cards(summary).filter((c) => !c.admin || role === "admin") : []
  if (!summary) return <div aria-hidden className="h-[118px] rounded-xl bg-muted/50" />
  return (
    <ul aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {shown.map((c) => (
        <li key={c.section}>
          <button
            type="button"
            onClick={() => onOpen(c.section)}
            className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-caption text-muted-foreground">{c.label}</span>
            <span className="text-title leading-none text-foreground tabular-nums">{c.value}</span>
            <span className="text-caption text-muted-foreground">{c.detail}</span>
            <Pill tone={c.pill[0]} className="mt-1">
              {c.pill[1]}
            </Pill>
          </button>
        </li>
      ))}
    </ul>
  )
}
