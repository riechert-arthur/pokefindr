"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useQueryState } from "nuqs"
import { MapPinIcon, PlusIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { AdminSidebar, type SectionCount } from "@/components/admin/AdminSidebar"
import { ReviewQueue } from "@/components/admin/ReviewQueue"
import { ReportsTable } from "@/components/admin/ReportsTable"
import { AddVendingForm } from "@/components/admin/AddVendingForm"
import { CoverageView } from "@/components/admin/CoverageView"
import { JobsTable } from "@/components/admin/JobsTable"
import { SummaryCards } from "@/components/admin/SummaryCards"
import { AdsSwitches } from "@/components/admin/AdsSwitches"
import { REPORTS_HOT } from "@/lib/admin/reports"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import { DEFAULT_SECTION, groupsFor, sectionFor } from "@/lib/admin/sections"
import { queueIsLate, type AdminSummary } from "@/lib/admin/summary"
import type { StaffRole } from "@/lib/admin/roles"

/** How often the counts refresh while the admin is open. */
const SUMMARY_EVERY_MS = 60_000

function useSummary(): [AdminSummary | null, () => void] {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const refresh = useCallback(() => {
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AdminSummary>) : null))
      .then((s) => s && setSummary(s))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, SUMMARY_EVERY_MS)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [refresh])
  return [summary, refresh]
}

/** Each section's body. Later sections (#153–#159) add themselves here and in ADMIN_GROUPS. */
const SECTIONS: Record<string, () => ReactNode> = {
  queue: () => <ReviewQueue />,
  reports: () => <ReportsTable />,
  coverage: () => <CoverageView />,
  "add-vending": () => <AddVendingForm />,
  jobs: () => <JobsTable />,
  ads: () => <AdsSwitches />,
}

/**
 * The admin (#152): the sidebar, the section's title and description, and
 * the section, chosen by `?section=` (so each has a link and Back works).
 */
export function AdminApp({ role, username }: { role: StaffRole; username: string }) {
  const [param, setParam] = useQueryState("section", { history: "push" })
  const section = sectionFor(param ?? DEFAULT_SECTION, role)!
  const [summary, refreshSummary] = useSummary()
  const counts: Record<string, SectionCount> = summary
    ? {
        queue: { count: summary.queue.count, hot: queueIsLate(summary.queue) },
        reports: { count: summary.reports.locations, hot: summary.reports.maxOnOne >= REPORTS_HOT },
      }
    : {}

  useEffect(() => {
    document.title = `${section.label} · Admin · PokeFindr`
  }, [section.label])

  return (
    <RefreshSummary.Provider value={refreshSummary}>
      <div className="flex min-h-svh flex-col bg-background md:flex-row">
        <AdminSidebar groups={groupsFor(role)} current={section.id} counts={counts} onSelect={(id) => void setParam(id === DEFAULT_SECTION ? null : id)} user={{ username, role }} />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-5">
          <header className="flex flex-wrap items-start gap-3">
            {/* A full row on phones, so the buttons wrap below the title instead of squeezing it. */}
            <div className="min-w-0 flex-[1_1_100%] sm:flex-[1_1_0%]">
              <h1 className="text-title text-foreground">{section.label}</h1>
              <p className="text-body text-muted-foreground">{section.sub}</p>
            </div>
            <Link href="/map" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <MapPinIcon aria-hidden />
              Open map
            </Link>
            {role === "admin" && section.id !== "add-vending" && (
              <Button size="sm" onClick={() => void setParam("add-vending")}>
                <PlusIcon aria-hidden />
                Add vending machine
              </Button>
            )}
          </header>
          <SummaryCards summary={summary} role={role} onOpen={(id) => void setParam(id === DEFAULT_SECTION ? null : id)} />
          {SECTIONS[section.id]?.()}
        </div>
      </div>
    </RefreshSummary.Provider>
  )
}
