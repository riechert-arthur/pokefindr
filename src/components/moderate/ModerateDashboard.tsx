"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useQueryState } from "nuqs"
import { ReviewQueue } from "@/components/admin/ReviewQueue"
import { ReportsTable } from "@/components/admin/ReportsTable"
import { HeldReviews } from "@/components/admin/HeldReviews"
import { CountBadge } from "@/components/admin/CountBadge"
import { RefreshSummary } from "@/components/admin/useRefreshSummary"
import { moderationCounts, useAdminSummary } from "@/components/admin/useAdminSummary"
import { OpenNavButton } from "@/components/pokefindr/OpenNavButton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { tabFor, tabsFor } from "@/lib/moderate/tabs"
import type { Role } from "@/lib/auth/roles"

/**
 * /moderate (#293): the review queue, held Reviews (#253) and Reports as
 * tabs, picked with `?tab=` (so each has a link and Back works), inside the
 * normal app layout. The same components and APIs as /admin's Moderation
 * group; the counts come from /api/admin/summary, which gives moderators
 * only these. Each tab shows to whoever has its entitlement (tabsFor).
 */
export function ModerateDashboard({ role }: { role: Role }) {
  const t = useTranslations("moderate")
  const [param, setParam] = useQueryState("tab", { history: "push" })
  const tabs = tabsFor(role)
  const asked = tabFor(param)
  const tab = tabs.includes(asked) ? asked : "queue"
  const [summary, refreshSummary] = useAdminSummary()
  const counts = moderationCounts(summary)

  useEffect(() => {
    document.title = `${t(`tabs.${tab}`)} · ${t("title")} · PokeFindr`
  }, [t, tab])

  return (
    <RefreshSummary.Provider value={refreshSummary}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex items-start gap-2">
          <OpenNavButton />
          <div className="min-w-0">
            <h1 className="text-title text-foreground">{t("title")}</h1>
            <p className="text-body text-muted-foreground">{t("intro")}</p>
          </div>
        </header>
        <Tabs value={tab} onValueChange={(v) => void setParam(v === "queue" ? null : v)}>
          <TabsList>
            {tabs.map((id) => {
              const c = counts[id]
              return (
                <TabsTrigger key={id} value={id} className="gap-1.5">
                  {t(`tabs.${id}`)}
                  {c && c.count > 0 && <CountBadge count={c.count} hot={c.hot} label={t("tabs.waiting", { count: c.count })} />}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {/* English only, like /admin (docs/i18n.md). */}
          <TabsContent value="queue" lang="en" className="mt-4">
            <ReviewQueue />
          </TabsContent>
          {tabs.includes("reviews") && (
            <TabsContent value="reviews" lang="en" className="mt-4">
              <HeldReviews />
            </TabsContent>
          )}
          <TabsContent value="reports" lang="en" className="mt-4">
            <ReportsTable />
          </TabsContent>
        </Tabs>
      </div>
    </RefreshSummary.Provider>
  )
}
