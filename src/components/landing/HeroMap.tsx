"use client"

import { useEffect, useRef } from "react"
import { OUTSIDE_LOWER_48 } from "@/lib/map/states"
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson"
import { readTokens } from "@/lib/design/tokens"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"

/** The lower 48 and DC: the background frames the conterminous US, as in the prototype. */
const OUTSIDE = new Set<string>(OUTSIDE_LOWER_48)
/**
 * The lower 48's outlines, simplified for the hero (scripts/geo/hero_outlines.py):
 * about 58 KB instead of us-states.json's 256 KB (#298). Fetched after hydration,
 * so it never holds up the first paint.
 */
export const HERO_OUTLINES_URL = "/geo/us-lower48-hero.json"
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

/** How many dots a cell of `count` machines gets: more for busier cells, but not one each, or a metro's cells fill in as solid squares. */
export const dotsFor = (count: number) => Math.min(count, 1 + Math.round(1.5 * Math.sqrt(count)))

/** Whether a point is inside a polygon's rings (even-odd, so holes are out). */
function inRings(rings: Position[][], lng: number, lat: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** A test for "on land in the lower 48", from the state outlines, with each polygon's box checked first. */
export function onLand(outlines: Outlines): (lng: number, lat: number) => boolean {
  const polys = outlines.features
    .filter((f) => !OUTSIDE.has(f.properties.region))
    .flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates))
    .map((rings) => {
      const xs = rings[0].map((p) => p[0])
      const ys = rings[0].map((p) => p[1])
      return { rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
    })
  return (lng, lat) => polys.some(({ rings, box: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n && inRings(rings, lng, lat))
}

/**
 * Grid cells (`[lng, lat, count]`, south-west corners, `size`° on a side)
 * as dots spread over the cell's land (`inside`), dotsFor(count) each. The
 * spread is seeded by the cell, so it's the same on every paint: it only
 * looks like the machines. A dot that keeps landing in water is dropped.
 */
export function scatter(cells: readonly (readonly [number, number, number])[], size: number, inside: (lng: number, lat: number) => boolean = () => true): [number, number][] {
  const dots: [number, number][] = []
  for (const [lng, lat, count] of cells) {
    let seed = (Math.round(lng / size) * 73856093) ^ (Math.round(lat / size) * 19349663)
    // mulberry32
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let k = 0; k < dotsFor(count); k++) {
      for (let tries = 0; tries < 12; tries++) {
        const dot: [number, number] = [lng + random() * size, lat + random() * size]
        if (!inside(...dot)) continue
        dots.push(dot)
        break
      }
    }
  }
  return dots
}

/**
 * The landing hero's background, as in the prototype: the lower 48's state
 * outlines and a dot per vending machine, with soft pings at random dots.
 * The dots come from `cells`, machine counts per `cellSize`° grid cell
 * (from the server, at render), scattered within each cell: no machine's
 * own location reaches the browser. Two canvases: the outlines and dots are drawn once (again on
 * resize or a theme change, without fetching again), and only the pings
 * redraw each frame. Static under prefers-reduced-motion, which it follows
 * live; paused while off-screen or in a hidden tab.
 * Purely decorative and absolutely positioned, so it can't shift layout.
 */
export function HeroMap({ cells, cellSize }: { cells: [number, number, number][]; cellSize: number }) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const pingRef = useRef<HTMLCanvasElement>(null)
  const themeKey = useThemeKey()
  const dark = useIsDark()
  // The mount effect owns the canvases and data (again if the cells change); a theme change only repaints.
  const darkRef = useRef(dark)
  const repaintRef = useRef<() => void>(() => {})

  useEffect(() => {
    const base = baseRef.current
    const top = pingRef.current
    const baseCtx = base?.getContext("2d")
    const ctx = top?.getContext("2d")
    if (!base || !top || !baseCtx || !ctx) return
    const controller = new AbortController()
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reduce = motion.matches
    let colors = readTokens(["brand", "brand-2"])

    let outlines: Outlines | null = null
    // Scattered over land once the outlines arrive (only in the browser).
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
      const { brand, "brand-2": brand2 } = colors
      const dark = darkRef.current
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
      ctx.strokeStyle = colors.brand
      ctx.fillStyle = colors.brand
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

    const clearPings = () => {
      pings = []
      ctx.clearRect(0, 0, top.width, top.height)
    }
    const redraw = () => {
      if (!layout()) return
      paintBase()
      // The pings' positions are in the old size's pixels.
      clearPings()
      schedule()
    }
    repaintRef.current = () => {
      colors = readTokens(["brand", "brand-2"])
      paintBase()
      clearPings()
      schedule()
    }
    const onMotion = () => {
      reduce = motion.matches
      if (reduce) {
        stop()
        clearPings()
      } else schedule()
    }
    motion.addEventListener("change", onMotion)

    fetch(HERO_OUTLINES_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`GET ${HERO_OUTLINES_URL} failed (${res.status})`)
        return res.json() as Promise<Outlines>
      })
      .then((o) => {
        outlines = o
        points = scatter(cells, cellSize, onLand(o))
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
      motion.removeEventListener("change", onMotion)
      repaintRef.current = () => {}
    }
  }, [cells, cellSize])

  // A theme change: new colors on the same data. (Declared after the mount
  // effect, so it runs after it; before the data arrives it paints nothing.)
  useEffect(() => {
    darkRef.current = dark
    repaintRef.current()
  }, [themeKey, dark])

  return (
    <>
      <canvas ref={baseRef} className="absolute inset-0 size-full" />
      <canvas ref={pingRef} className="absolute inset-0 size-full" />
    </>
  )
}
