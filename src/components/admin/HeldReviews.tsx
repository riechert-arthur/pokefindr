"use client"

import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useState } from "react"
import { InboxIcon, MessageSquareWarningIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KindDot } from "@/components/pokefindr/KindDot"
import { toKind } from "@/components/pokefindr/kinds"
import { StarRating } from "@/components/pokefindr/StarRating"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Pill, type PillTone } from "@/components/admin/Pill"
import { useRefreshSummary } from "@/components/admin/useRefreshSummary"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { can } from "@/lib/auth/entitlements"
import { CATEGORY_LABELS, type HeldReview, type ModerationVerdict } from "@/lib/reviews/moderation"
import { canUndo } from "@/lib/submissions/moderation"
import { mapUrl } from "@/lib/map/url-state"
import { useFormat } from "@/i18n/format"

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; held: HeldReview[]; decided: HeldReview[] }
type Action = "approve" | "remove" | "undo"

const VERDICT: Record<ModerationVerdict, [PillTone, string]> = {
  allow: ["ok", "Looks fine"],
  hold: ["warn", "Check it"],
  block: ["crit", "Suggests removing"],
}

/**
 * Moderation → Reviews (#253): reviews the automatic check held, oldest
 * first, with the model's reason, and Approve (publish) or Remove. Until
 * then only their author sees them, as "pending review". Decisions can be
 * undone for an hour, from the toast or the Decided tab, as in the review
 * queue. A separate /moderate page is coming in #293.
 */
export function HeldReviews() {
  const f = useFormat()
  const refreshSummary = useRefreshSummary()
  const { session } = useSessionContext()
  const [load, setLoad] = useState<Load>({ status: "loading" })
  const [tab, setTab] = useState<"held" | "decided">("held")
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reviews", { cache: "no-store" })
      if (!res.ok) throw new Error(`reviews answered ${res.status}`)
      setLoad({ status: "ready", ...((await res.json()) as { held: HeldReview[]; decided: HeldReview[] }) })
    } catch (err) {
      console.error("[admin] couldn't load held reviews", err)
      setLoad((l) => (l.status === "ready" ? l : { status: "error" }))
    }
  }, [])
  useEffect(() => void refresh(), [refresh])

  const act = async (review: HeldReview, action: Action) => {
    setBusy(review.id)
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) toast.error(data.error ?? "That didn't work. Try again.")
      else if (action === "undo") toast(`${review.author}'s review is back in the queue`)
      else
        toast.success(action === "approve" ? `${review.author}'s review is published` : `${review.author}'s review was removed`, {
          description: action === "approve" ? "Everyone can see it now." : "Only its author still sees it.",
          action: { label: "Undo", onClick: () => void act(review, "undo") },
        })
      await refresh()
      refreshSummary()
    } catch (err) {
      console.error("[admin] couldn't decide the review", err)
      toast.error("That didn't work. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  if (load.status === "loading") return <p className="text-body text-muted-foreground">Loading reviews…</p>
  if (load.status === "error")
    return (
      <EmptyState icon={TriangleAlertIcon} title="Couldn't load reviews" action={<Button onClick={() => void refresh()}>Try again</Button>}>
        Check your connection, then try again.
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-muted-foreground">
        {load.held.length ? `${load.held.length} waiting, oldest first.` : "All caught up."} Held reviews never show on the map, in the assistant or over MCP.
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "held" | "decided")} className="flex flex-col gap-2">
        <TabsList aria-label="Show" className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="held">Held · {load.held.length}</TabsTrigger>
          <TabsTrigger value="decided">Decided · {load.decided.length}</TabsTrigger>
        </TabsList>
        {(["held", "decided"] as const).map((which) => {
          const items = which === "held" ? load.held : load.decided
          return (
            <TabsContent key={which} value={which} className="mt-0">
              {items.length === 0 ? (
                <EmptyState icon={which === "held" ? MessageSquareWarningIcon : InboxIcon} title={which === "held" ? "No held reviews" : "Nothing decided today"}>
                  {which === "held" ? "Reviews the automatic check isn't sure about show up here." : "Reviews you approved or removed in the last day show up here."}
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((r) => {
                    const own = r.writtenByViewer && !can(session?.role, "moderation.decideOwn")
                    const disabled = busy !== null
                    const [tone, verdict] = r.check ? (r.check.failed ? (["idle", "Check didn't run"] as [PillTone, string]) : VERDICT[r.check.verdict]) : (["idle", "Not checked"] as [PillTone, string])
                    return (
                      <li key={r.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                        <div className="flex flex-wrap items-start gap-2.5">
                          <KindDot kind={toKind(r.location.kind)} className="mt-1" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground">{r.location.name || "Unnamed"}</div>
                            <div className="text-caption text-muted-foreground">
                              {[r.location.city, r.location.state].filter(Boolean).join(", ")} · by {r.author} · {f.ago(r.createdAt)}
                            </div>
                          </div>
                          <StarRating rating={r.rating} starSize={14} label={`${r.rating} out of 5`} />
                        </div>
                        <blockquote className="whitespace-pre-line break-words border-l-2 border-border pl-3 text-body">{r.text || <span className="text-muted-foreground">No text</span>}</blockquote>
                        <div className="flex flex-wrap items-center gap-1.5 text-caption">
                          <Pill tone={tone}>{verdict}</Pill>
                          {r.check?.categories.map((c) => (
                            <Pill key={c} tone="idle">
                              {CATEGORY_LABELS[c] ?? c}
                            </Pill>
                          ))}
                          {r.check && <span className="text-muted-foreground">{r.check.reason}</span>}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {which === "decided" && (
                            <span className="mr-auto text-caption text-muted-foreground">
                              {r.status === "published" ? "Approved" : "Removed"} {r.moderatedAt ? f.ago(r.moderatedAt) : ""}
                            </span>
                          )}
                          <Link href={mapUrl("/map", { location: r.location.id })} target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`View ${r.location.name || "the place"} on the map`}>
                            View place
                          </Link>
                          {which === "held" ? (
                            own ? (
                              <span className="text-caption text-muted-foreground">You wrote this one, so another moderator has to review it.</span>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(r, "approve")}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" disabled={disabled} onClick={() => void act(r, "remove")}>
                                  Remove
                                </Button>
                              </>
                            )
                          ) : canUndo(r.moderatedAt) ? (
                            <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act(r, "undo")}>
                              <Undo2Icon aria-hidden />
                              Undo
                            </Button>
                          ) : (
                            <span className="text-caption text-muted-foreground">Over an hour ago, so it can&apos;t be undone here.</span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
      <p className="text-caption text-muted-foreground">
        Approve publishes the review for everyone. Remove keeps it from everyone but its author; if they edit it, it comes back here. You can undo your own decisions for an hour.
      </p>
    </div>
  )
}
