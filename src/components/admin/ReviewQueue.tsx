"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { CheckIcon, InboxIcon, ShieldAlertIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KindDot } from "@/components/pokefindr/KindDot"
import { KINDS } from "@/components/pokefindr/kinds"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Map, Marker, MAP_STYLES } from "@/components/map/engine"
import { useIsDark } from "@/lib/design/useThemeKey"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { REJECT_REASONS, REJECT_REASON_LABELS, SHOP_SELLS_LABELS, type RejectReason } from "@/lib/submissions/constants"
import { canUndo, type ModerationItem } from "@/lib/submissions/moderation"
import { cn } from "@/lib/utils"

type Load = { status: "loading" } | { status: "forbidden" } | { status: "error" } | { status: "ready"; queue: ModerationItem[]; decided: ModerationItem[] }

/** "3 h ago", "2 d ago". */
function ago(iso: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "")
const flags = (item: ModerationItem) => item.checks.filter((c) => !c.ok).length

/**
 * Moderation → Review queue (#126), as in the prototype's admin view:
 * pending submissions on the left, oldest first, with how many checks
 * flagged each; the selected one on the right with a map preview, its
 * checks and fields, and Approve and publish or Reject with a reason.
 * Decisions made here can be undone for an hour, from the Decided list.
 */
export function ReviewQueue() {
  const [load, setLoad] = useState<Load>({ status: "loading" })
  const [tab, setTab] = useState<"queue" | "decided">("queue")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/submissions")
      if (res.status === 403 || res.status === 401) return setLoad({ status: "forbidden" })
      if (!res.ok) return setLoad({ status: "error" })
      const body = (await res.json()) as { queue: ModerationItem[]; decided: ModerationItem[] }
      setLoad({ status: "ready", ...body })
      setSelectedId((id) => (id && [...body.queue, ...body.decided].some((i) => i.id === id) ? id : (body.queue[0]?.id ?? null)))
    } catch {
      setLoad({ status: "error" })
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const decide = async (item: ModerationItem, body: { action: "approve" } | { action: "reject"; reason: RejectReason } | { action: "undo" }) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/submissions/${item.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "That didn't work. Try again.")
        return void refresh()
      }
      const name = item.fields.name ?? "It"
      if (body.action === "undo") toast(`${name} is back in the queue`)
      else
        toast.success(body.action === "approve" ? `${name} is on the map` : `${name} was rejected`, {
          description: body.action === "reject" ? `The submitter sees: ${REJECT_REASON_LABELS[body.reason]}.` : "Everyone can see it now.",
          action: { label: "Undo", onClick: () => void decide({ ...item, status: body.action === "approve" ? "approved" : "rejected" }, { action: "undo" }) },
        })
      if (body.action !== "undo" && load.status === "ready") {
        // Move on to the next one in the queue.
        const rest = load.queue.filter((i) => i.id !== item.id)
        setSelectedId(rest[0]?.id ?? null)
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (load.status === "loading") return <Shell><p className="text-body text-muted-foreground">Loading the queue…</p></Shell>
  if (load.status === "forbidden")
    return (
      <Shell>
        <EmptyState icon={ShieldAlertIcon} title="Moderators only">
          Your account can&apos;t review submissions. Ask an admin if you should be able to.
        </EmptyState>
      </Shell>
    )
  if (load.status === "error")
    return (
      <Shell>
        <EmptyState icon={TriangleAlertIcon} title="Couldn't load the queue" action={<Button onClick={() => void refresh()}>Try again</Button>}>
          Check your connection, then try again.
        </EmptyState>
      </Shell>
    )

  const selected = [...load.queue, ...load.decided].find((i) => i.id === selectedId) ?? null

  return (
    <Shell count={load.queue.length}>
      <div className="flex flex-wrap gap-4">
        <section aria-label="Submissions" className="flex min-w-0 flex-[1_1_300px] flex-col gap-2 lg:max-w-[360px]">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "queue" | "decided")} className="flex flex-col gap-2">
            <TabsList aria-label="Show" className="grid w-full grid-cols-2">
              <TabsTrigger value="queue">Pending · {load.queue.length}</TabsTrigger>
              <TabsTrigger value="decided">Decided · {load.decided.length}</TabsTrigger>
            </TabsList>
            {(["queue", "decided"] as const).map((which) => {
              const items = which === "queue" ? load.queue : load.decided
              return (
                <TabsContent key={which} value={which} className="mt-0">
                  {items.length === 0 ? (
                    <EmptyState icon={InboxIcon} title={which === "queue" ? "Nothing to review" : "Nothing decided today"}>
                      {which === "queue" ? "New card shops and events show up here, oldest first." : "Approvals and rejections from the last day show up here."}
                    </EmptyState>
                  ) : (
                    <ul className="flex flex-col gap-1 rounded-xl border border-border bg-card p-1.5">
                      {items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-current={item.id === selectedId ? "true" : undefined}
                            className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-muted"
                          >
                            <KindDot kind={item.kind} className="mt-px" />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold">
                                {item.fields.name}
                                {item.status === "approved" && <StatusBadge status="live">Approved</StatusBadge>}
                                {item.status === "rejected" && <StatusBadge status="sample">Rejected</StatusBadge>}
                              </span>
                              <span className="block truncate text-body text-muted-foreground">
                                {[item.fields.city, item.fields.state].filter(Boolean).join(", ")} · by {item.submittedBy} · {ago(item.reviewedAt ?? item.createdAt)}
                              </span>
                            </span>
                            {item.status === "pending" && flags(item) > 0 && (
                              <span className="inline-flex items-center gap-1 text-caption font-semibold text-warning" title={`${flags(item)} check${flags(item) === 1 ? "" : "s"} flagged`}>
                                <TriangleAlertIcon className="size-3.5" aria-hidden />
                                {flags(item)}
                                <span className="sr-only"> checks flagged</span>
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        </section>

        <section aria-label="Selected submission" className="min-w-0 flex-[999_1_480px]">
          {selected ? (
            <Detail key={selected.id} item={selected} busy={busy} onDecide={(body) => decide(selected, body)} />
          ) : (
            <EmptyState icon={InboxIcon} title="Pick a submission">
              Choose one on the left to see its details and checks.
            </EmptyState>
          )}
        </section>
      </div>
    </Shell>
  )
}

function Shell({ count, children }: { count?: number; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <p className="text-overline uppercase text-muted-foreground">Moderation</p>
        <h1 className="text-title">Review queue</h1>
        {count !== undefined && <p className="text-body text-muted-foreground">{count ? `${count} waiting, oldest first.` : "All caught up."} Pending places never show on the public map.</p>}
      </header>
      {children}
    </div>
  )
}

function Detail({ item, busy, onDecide }: { item: ModerationItem; busy: boolean; onDecide: (body: { action: "approve" } | { action: "reject"; reason: RejectReason } | { action: "undo" }) => void }) {
  const isDark = useIsDark()
  const { session } = useSessionContext()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState<RejectReason | "">("")
  const id = useId()
  const f = item.fields
  const facts: [string, string][] = [
    ["Kind", KINDS[item.kind].one.replace(/^./, (c) => c.toUpperCase())],
    ["Address", [f.address, [f.city, f.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")],
    ...(item.kind === "shop"
      ? ([["Website", f.website ?? ""], ["Hours", f.hours ?? ""], ["Sells", (f.sells ?? []).map((s) => SHOP_SELLS_LABELS[s as keyof typeof SHOP_SELLS_LABELS] ?? s).join(", ")]] as [string, string][])
      : ([["Venue", f.venue ?? ""], ["When", [when(f.startsAt), when(f.endsAt)].filter(Boolean).join(" – ")], ["Link", f.link ?? ""], ["Entry", f.isFree === undefined ? "" : f.isFree ? "Free" : "Paid"]] as [string, string][])),
    ["Pin", `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`],
    ["Submitted", `by ${item.submittedBy}, ${ago(item.createdAt)}`],
  ]
  if (item.status !== "pending") facts.push(["Decision", `${item.status === "approved" ? "Approved" : `Rejected: ${item.rejectReason ? REJECT_REASON_LABELS[item.rejectReason] : ""}`} by ${item.reviewedBy ?? "a moderator"}`])

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-56 border-b border-border">
        <Map
          initialViewState={{ longitude: item.lng, latitude: item.lat, zoom: 15 }}
          mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
        >
          <Marker longitude={item.lng} latitude={item.lat} anchor="center">
            <KindDot kind={item.kind} className="ring-2 ring-card" />
          </Marker>
        </Map>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <div className={cn("inline-flex items-center gap-2 text-caption font-semibold", KINDS[item.kind].text)}>
            <KindDot kind={item.kind} />
            {KINDS[item.kind].one.replace(/^./, (c) => c.toUpperCase())}
          </div>
          <h2 className="text-heading">{f.name}</h2>
        </div>

        {item.checks.length > 0 && (
          <ul aria-label="Checks" className="flex flex-col gap-1.5">
            {item.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-body">
                {c.ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-label="Passed" /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Flagged" />}
                <span>
                  {c.label}
                  {c.detail && <span className="block text-caption text-muted-foreground">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <dl className="grid">
          {facts.map(([term, value]) => (
            <div key={term} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-border py-2">
              <dt className="text-body text-muted-foreground">{term}</dt>
              <dd className="m-0 min-w-0 break-words text-body">
                {value ? term === "Website" || term === "Link" ? <a href={value} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">{value}</a> : value : <span className="text-muted-foreground">Not given</span>}
              </dd>
            </div>
          ))}
        </dl>

        {item.status === "pending" ? (
          item.sentByViewer && session?.role !== "admin" ? (
            <p className="text-body text-muted-foreground">You sent this one, so another moderator has to review it.</p>
          ) : rejecting ? (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-body font-medium">Why reject it? The submitter sees this.</legend>
              <RadioGroup value={reason} onValueChange={(v) => setReason(v as RejectReason)} className="gap-2">
                {REJECT_REASONS.map((r) => (
                  <Label key={r} htmlFor={`${id}-${r}`} className="flex items-center gap-2 font-normal">
                    <RadioGroupItem id={`${id}-${r}`} value={r} />
                    {REJECT_REASON_LABELS[r]}
                  </Label>
                ))}
              </RadioGroup>
              <div className="flex gap-2">
                <Button variant="destructive" disabled={!reason || busy} onClick={() => reason && onDecide({ action: "reject", reason })}>
                  Reject
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => onDecide({ action: "approve" })}>
                Approve and publish
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                Reject…
              </Button>
            </div>
          )
        ) : canUndo(item.reviewedAt) ? (
          <div>
            <Button variant="outline" disabled={busy} onClick={() => onDecide({ action: "undo" })}>
              <Undo2Icon aria-hidden />
              Undo
            </Button>
            <p className="mt-1.5 text-caption text-muted-foreground">You can undo your own decisions for an hour, until people review or report the place.</p>
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">Decided over an hour ago, so it can&apos;t be undone here.</p>
        )}
      </div>
    </article>
  )
}
