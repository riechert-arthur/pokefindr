"use client"

import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentMark } from "@/components/assistant/AgentMark"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { DEFAULT_RADIUS } from "@/lib/map/url-state"
import { LOCATE_GIVE_UP_MS } from "@/lib/map/locate"
import type { Highlights, UpcomingEvent } from "@/lib/types/highlights"
import type { RegionCount } from "@/lib/types/locations"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, type MyReview, type NearState } from "./DashboardTiles"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

/** The prototype's suggestions, one tap to ask (dashboard.suggestions in the catalog). */
export const SUGGESTIONS = ["portland", "denver", "washington", "phoenix"] as const

const chip =
  "rounded-full border border-border bg-card/85 px-3 py-1 text-body text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`)
  return (await res.json()) as T
}

/** Coordinates to ~1 km: all the dashboard and the assistant need. */
const round2 = (n: number) => Math.round(n * 100) / 100

interface DashboardProps {
  /**
   * The assistant: the composer and, while chatting, the conversation. It
   * gets the viewer's location once shared and a suggestion to ask, and says
   * when a conversation has started (the greeting and tiles then make room).
   */
  assistant: (props: { viewer: { lng: number; lat: number } | null; suggestion: string | null; onSuggestionUsed: () => void; onChattingChange: (chatting: boolean) => void }) => ReactNode
}

/**
 * The signed-in home (/home), from the prototype: a centered greeting and
 * the assistant's composer, suggestions, then tiles for what's near, your
 * reviews, your submissions and upcoming events. Once a conversation starts,
 * the greeting, suggestions and tiles step aside for it.
 */
export function Dashboard({ assistant }: DashboardProps) {
  const f = useFormat()
  const t = useTranslations("dashboard")
  const { session } = useSessionContext()
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const [vending, setVending] = useState<number | null>(null)
  const [reviews, setReviews] = useState<MyReview[] | "error" | null>(null)
  const [events, setEvents] = useState<UpcomingEvent[] | "error" | null>(null)
  const [near, setNear] = useState<NearState>({ status: "idle" })
  const [viewer, setViewer] = useState<{ lng: number; lat: number } | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [chatting, setChatting] = useState(false)

  useEffect(() => {
    const ctl = new AbortController()
    const quiet = (err: unknown) => {
      if (!ctl.signal.aborted) console.error("[home] couldn't load a tile", err)
    }
    getJson<{ counts: RegionCount[] }>("/api/locations/aggregates", ctl.signal)
      .then(({ counts }) => setVending(counts.filter((c) => c.country === "US" && c.kind === "vending").reduce((n, c) => n + c.count, 0)))
      .catch(quiet)
    getJson<{ reviews: MyReview[] }>("/api/my-reviews", ctl.signal)
      .then((r) => setReviews(r.reviews))
      .catch((err) => {
        quiet(err)
        if (!ctl.signal.aborted) setReviews("error")
      })
    getJson<Highlights>("/api/highlights", ctl.signal)
      .then((h) => setEvents(h.events))
      .catch((err) => {
        quiet(err)
        if (!ctl.signal.aborted) setEvents("error")
      })
    return () => ctl.abort()
  }, [])

  const locate = useCallback(() => {
    if (!navigator.geolocation) return setNear({ status: "denied" })
    setNear({ status: "locating" })
    // Firefox calls neither callback when the prompt is dismissed, and the timeout below
    // only starts once permission is given, so give up on our own (as the map does).
    let settled = false
    const giveUp = setTimeout(() => {
      if (!settled) setNear({ status: "denied" })
      settled = true
    }, LOCATE_GIVE_UP_MS)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return
        settled = true
        clearTimeout(giveUp)
        const at = { lng: round2(pos.coords.longitude), lat: round2(pos.coords.latitude) }
        setViewer(at)
        try {
          const { counts } = await getJson<{ counts: number[] }>(`/api/locations/counts?points=${at.lng},${at.lat}&r=${DEFAULT_RADIUS}`, new AbortController().signal)
          setNear({ status: "ready", count: counts[0] ?? 0 })
        } catch {
          setNear({ status: "ready", count: null })
        }
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(giveUp)
        setNear({ status: "denied" })
      },
      { timeout: 15_000, maximumAge: 300_000 },
    )
  }, [])

  return (
    <div className={isSidebarOpen ? "h-full max-sm:ml-16" : "h-full"}>
      <div className="relative isolate flex h-full min-w-0 flex-col overflow-hidden">
        {/* The prototype's soft glow in the logo's colors. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[-10%] top-[-30%] -z-10 h-[70%] opacity-35 blur-[70px] [background:radial-gradient(35%_45%_at_30%_40%,hsl(var(--brand)/0.5),transparent_70%),radial-gradient(35%_45%_at_70%_35%,hsl(var(--brand-2)/0.45),transparent_70%)]"
        />
        <header className="flex items-center gap-1.5 px-4 py-3 sm:px-5">
          <button type="button" onClick={toggleSidebar} className="mr-1 rounded p-1 sm:hidden" aria-label={t("openNav")} aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
            <MenuIcon className="size-6 text-muted-foreground" aria-hidden />
          </button>
          <span className="flex-1" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/map">{t("openMap")}</Link>
          </Button>
          <UserMenu userName={session?.username ?? t("guest")} size={32} />
        </header>

        <main
          className={
            chatting
              ? "mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col gap-4 px-4 pb-4 pt-2"
              : "mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col justify-start gap-[18px] overflow-y-auto px-4 pb-7 pt-4 md:justify-center md:pt-2"
          }
        >
          {!chatting && (
            <div className="grid justify-items-center gap-2.5 text-center">
              <AgentMark size="lg" />
              <h1 className="mt-1.5 text-balance text-title text-foreground">{t("greeting")}</h1>
              <p className="max-w-[52ch] text-subheading font-normal text-muted-foreground">
                {vending === null ? t("introNoCount") : t("intro", { count: f.count(vending) })}
              </p>
            </div>
          )}

          {assistant({ viewer, suggestion, onSuggestionUsed: () => setSuggestion(null), onChattingChange: setChatting })}

          {!chatting && (
            <>
              <div className="flex flex-wrap justify-center gap-2" aria-label={t("suggestionsLabel")}>
                {(viewer ? (["closest", ...SUGGESTIONS] as const) : SUGGESTIONS).map((key) => t(`suggestions.${key}`)).map((s) => (
                  <button key={s} type="button" className={chip} onClick={() => setSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 min-[861px]:grid-cols-4">
                <NearYouTile near={near} onLocate={locate} />
                <ReviewsTile reviews={reviews} />
                <SubmissionsTile />
                <EventsTile events={events} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
