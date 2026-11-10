"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useQueryState } from "nuqs"
import { MenuIcon } from "lucide-react"
import { ReviewQueue } from "@/components/admin/ReviewQueue"
import { ReportsTable } from "@/components/admin/ReportsTable"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import { moderationCounts, useAdminSummary } from "@/components/admin/useAdminSummary"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFormat } from "@/i18n/format"
import { cn } from "@/lib/utils"

export const MODERATE_TABS = ["queue", "reports"] as const
export type ModerateTab = (typeof MODERATE_TABS)[number]

/** `?tab=`: the one asked for, else the review queue. */
export const tabFor = (param: string | null | undefined): ModerateTab => MODERATE_TABS.find((t) => t === param) ?? "queue"

/**
 * /moderate (#293): the review queue and Reports as two tabs, picked with
 * `?tab=` (so each has a link and Back works), inside the normal app layout.
 * The same components and APIs as /admin's Moderation group; the counts come
 * from /api/admin/summary, which gives moderators only these two.
 */
export function ModerateDashboard() {
  const t = useTranslations("moderate")
  const f = useFormat()
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const [param, setParam] = useQueryState("tab", { history: "push" })
  const tab = tabFor(param)
  const [summary, refreshSummary] = useAdminSummary()
  const counts = moderationCounts(summary)

  useEffect(() => {
    document.title = `${t(`tabs.${tab}`)} · ${t("title")} · PokeFindr`
  }, [t, tab])

  return (
    <RefreshSummary.Provider value={refreshSummary}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex items-start gap-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="mt-0.5 rounded p-1 sm:hidden"
            aria-label={t("openNav")}
            aria-controls={APP_NAV_ID}
            aria-expanded={isSidebarOpen}
          >
            <MenuIcon className="size-6 text-muted-foreground" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="text-title text-foreground">{t("title")}</h1>
            <p className="text-body text-muted-foreground">{t("intro")}</p>
          </div>
        </header>
        <Tabs value={tab} onValueChange={(v) => void setParam(v === "queue" ? null : v)}>
          <TabsList>
            {MODERATE_TABS.map((id) => {
              const c = counts[id]
              return (
                <TabsTrigger key={id} value={id} className="gap-1.5">
                  {t(`tabs.${id}`)}
                  {c && (
                    <span
                      aria-label={t("tabs.waiting", { count: c.count })}
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-center text-caption font-semibold tabular-nums",
                        c.hot ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {f.count(c.count)}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {/* English only, like /admin (docs/i18n.md). */}
          <TabsContent value="queue" lang="en" className="mt-4">
            <ReviewQueue />
          </TabsContent>
          <TabsContent value="reports" lang="en" className="mt-4">
            <ReportsTable />
          </TabsContent>
        </Tabs>
      </div>
    </RefreshSummary.Provider>
  )
}
