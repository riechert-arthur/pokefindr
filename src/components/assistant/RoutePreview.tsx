"use client"

import { useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { hasWebGL } from "@/components/map/MapLoader"
import { useStreetRoute } from "@/components/map/useStreetRoute"
import { useDistance } from "@/i18n/useDistance"

const box = "h-[180px] w-full bg-muted"

const RoutePreviewMap = dynamic(() => import("./RoutePreviewMap"), {
  ssr: false,
  loading: () => <div aria-hidden className={`${box} animate-pulse motion-reduce:animate-none`} />,
})

const noSubscribe = () => () => {}

/**
 * A small map of an assistant route inside its card (#349), so the viewer
 * sees it without leaving the chat: the line along the streets with the
 * numbered stops, and the drive's time and distance under it. Without
 * WebGL, or when the route can't be loaded, nothing shows and the card keeps
 * its list of stops.
 */
export function RoutePreview({ ids }: { ids: readonly string[] }) {
  const t = useTranslations("assistant.cards")
  const { distance } = useDistance()
  // False on the server and in the first render, so hydration matches.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => false)
  const state = useStreetRoute(webgl ? ids : [])
  if (!webgl || state.status === "gone" || state.status === "failed") return null
  const route = state.status === "ready" ? state.route : null
  return (
    <figure aria-label={t("preview")} className="m-0 border-b border-border">
      {route ? (
        <div className={box}>
          <RoutePreviewMap route={route} />
        </div>
      ) : (
        <div aria-hidden className={`${box} animate-pulse motion-reduce:animate-none`} />
      )}
      {route && (
        <figcaption className="px-3 py-1.5 text-caption text-muted-foreground">
          {route.routed && route.minutes !== null ? t("drive", { minutes: route.minutes, distance: distance(route.miles) }) : t("straightPreview")}
        </figcaption>
      )}
    </figure>
  )
}
