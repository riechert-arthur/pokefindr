"use client"

import { useEffect, useRef } from "react"
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson"
import { readTokens } from "@/lib/design/tokens"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"

/** The lower 48 and DC: the background frames the conterminous US, as in the prototype. */
const OUTSIDE = new Set(["AK", "HI", "PR", "GU", "VI", "AS", "MP"])
/** A new ping this often, each lasting PING_MS: about seven at a time. */
const PING_EVERY_MS = 260
const PING_MS = 1800

type Outlines = FeatureCollection<Polygon | MultiPolygon, { region: string }>
type Project = (lng: number, lat: number) => [number, number]

// Albers equal-area conic, the usual projection for the lower 48 (standard
// parallels 29.5° and 45.5°, centered on 37.5°N 96°W).
const RAD = Math.PI / 180
const N = (Math.sin(29.5 * RAD) + Math.sin(45.5 * RAD)) / 2
const C = Math.cos(29.5 * RAD) ** 2 + 2 * N * Math.sin(29.5 * RAD)
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(37.5 * RAD)) / N
export function albers(lng: number, lat: number): [number, number] {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N
  const theta = N * (lng + 96) * RAD
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)]
}

/** Fits the lower 48 into a W × H box (96% wide, 92% tall at most), slightly below center. */
export function fitAlbers(width: number, height: number): Project {
  const [x0] = albers(-124.5, 48.5)
  const [x1] = albers(-67, 45)
  const [, yb] = albers(-98, 25.5)
  const [, yt] = albers(-98, 49.2)
  const s = Math.min((width * 0.96) / (x1 - x0), (height * 0.92) / (yt - yb))
  const ox = (width - (x1 - x0) * s) / 2 - x0 * s
  const oy = height * 0.52 + ((yt + yb) / 2) * s
  return (lng, lat) => {
    const [x, y] = albers(lng, lat)
    return [ox + x * s, oy - y * s]
  }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`)
  return (await res.json()) as T
}

/**
 * The landing hero's background, as in the prototype: the lower 48's state
 * outlines and every vending machine as a dot, with soft pings at random
 * machines. Two canvases: the outlines and dots are drawn once (again on
 * resize or a theme change), and only the pings redraw each frame. Static
 * under prefers-reduced-motion; paused while off-screen or in a hidden tab.
 * Purely decorative and absolutely positioned, so it can't shift layout.
 */
export function HeroMap() {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const pingRef = useRef<HTMLCanvasElement>(null)
  const themeKey = useThemeKey()
  const dark = useIsDark()

  useEffect(() => {
    const base = baseRef.current
    const top = pingRef.current
    const baseCtx = base?.getContext("2d")
    const ctx = top?.getContext("2d")
    if (!base || !top || !baseCtx || !ctx) return
    const controller = new AbortController()
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const { brand, "brand-2": brand2 } = readTokens(["brand", "brand-2"])

    let outlines: Outlines | null = null
    let points: [number, number][] = []
    let project: Project | null = null
    let dpr = 1
    let width = 0
    let height = 0
    let raf = 0
    let visible = true
    let lastPing = 0
    let pings: { x: number; y: number; t0: number }[] = []

    const layout = () => {
      const box = base.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = box.width
      height = box.height
      if (!width || !height || !outlines) return false
      for (const c of [base, top]) {
        c.width = Math.round(width * dpr)
        c.height = Math.round(height * dpr)
      }
      project = fitAlbers(width, height)
      return true
    }

    const paintBase = () => {
      if (!project || !outlines) return
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      baseCtx.clearRect(0, 0, width, height)
      baseCtx.lineWidth = 1
      baseCtx.strokeStyle = brand2
      baseCtx.fillStyle = brand
      const ring = (coords: Position[]) =>
        coords.forEach(([lng, lat], k) => {
          const [x, y] = project!(lng, lat)
          if (k) baseCtx.lineTo(x, y)
          else baseCtx.moveTo(x, y)
        })
      for (const f of outlines.features) {
        if (OUTSIDE.has(f.properties.region)) continue
        const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
        for (const poly of polys) {
          baseCtx.beginPath()
          poly.forEach(ring)
          baseCtx.globalAlpha = dark ? 0.05 : 0.03
          baseCtx.fill()
          baseCtx.globalAlpha = dark ? 0.25 : 0.19
          baseCtx.stroke()
        }
      }
      baseCtx.globalAlpha = dark ? 0.69 : 0.56
      for (const [lng, lat] of points) {
        const [x, y] = project(lng, lat)
        baseCtx.beginPath()
        baseCtx.arc(x, y, 1.5, 0, 2 * Math.PI)
        baseCtx.fill()
      }
      baseCtx.globalAlpha = 1
    }

    const frame = (t: number) => {
      raf = 0
      if (!project) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      if (t - lastPing > PING_EVERY_MS && points.length) {
        lastPing = t
        const [x, y] = project(...points[(Math.random() * points.length) | 0])
        pings.push({ x, y, t0: t })
      }
      pings = pings.filter((p) => t - p.t0 < PING_MS)
      ctx.strokeStyle = brand
      ctx.fillStyle = brand
      ctx.lineWidth = 1.5
      for (const p of pings) {
        const k = (t - p.t0) / PING_MS
        ctx.globalAlpha = (1 - k) * 0.7
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3 + k * 20, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.globalAlpha = 1 - k
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.4, 0, 2 * Math.PI)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      schedule()
    }

    const running = () => !reduce && visible && !document.hidden
    function schedule() {
      if (!raf && running()) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const redraw = () => {
      if (!layout()) return
      paintBase()
      // The pings' positions are in the old size's pixels.
      pings = []
      ctx.clearRect(0, 0, top.width, top.height)
      schedule()
    }

    Promise.all([
      getJson<Outlines>("/geo/us-states.json", controller.signal),
      getJson<{ points: [number, number][] }>("/api/locations/points", controller.signal).catch(() => ({ points: [] })),
    ])
      .then(([o, p]) => {
        outlines = o
        // Only the lower 48, as the projection frames them.
        points = p.points.filter(([lng, lat]) => lng > -126 && lat > 24 && lat < 50)
        redraw()
      })
      .catch((err: unknown) => {
        // Decorative: the hero is fine without it.
        if (!controller.signal.aborted) console.warn("[landing] couldn't draw the background map", err)
      })

    const resize = new ResizeObserver(redraw)
    resize.observe(base)
    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) schedule()
      else stop()
    })
    onScreen.observe(base)
    const onVisibility = () => (document.hidden ? stop() : schedule())
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      controller.abort()
      stop()
      resize.disconnect()
      onScreen.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [themeKey, dark])

  return (
    <>
      <canvas ref={baseRef} className="absolute inset-0 size-full" />
      <canvas ref={pingRef} className="absolute inset-0 size-full" />
    </>
  )
}
