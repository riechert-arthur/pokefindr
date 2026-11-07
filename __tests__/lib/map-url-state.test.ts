import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadMapSearchParams, mapUrl } from "@/lib/map/url-state"
import { initialMapView } from "@/lib/map/initial-view"
import { boundsOf, boundsOfRadius, US_BOUNDS } from "@/lib/map/geo"
import { STATES } from "@/lib/map/states"
import type { StateCollection } from "@/components/map/useStateShading"

const load = (query: string) => loadMapSearchParams(new URLSearchParams(query))

describe("map URL parameters", () => {
  it("parses every parameter", () => {
    expect(load("q=Seattle%2C+WA&lat=47.6062&lng=-122.3321&r=25&types=vending,shop&retailer=QFC,Safeway&location=abc&state=WA&z=11&near=me")).toEqual({
      q: "Seattle, WA", lat: 47.6062, lng: -122.3321, r: 25, z: 11, state: "WA",
      types: ["vending", "shop"], retailer: ["QFC", "Safeway"], location: "abc", near: "me",
    })
  })

  it("drops values it doesn't know", () => {
    expect(load("r=7&near=you&lat=abc")).toMatchObject({ r: null, near: null, lat: null })
  })

  it("builds shareable links, leaving out what isn't set", () => {
    expect(mapUrl("/map", { near: "me", r: 10 })).toBe("/map?r=10&near=me")
    expect(mapUrl("/map", { types: ["vending", "event"], state: "WA" })).toBe("/map?state=WA&types=vending,event")
  })
})

describe("initialMapView", () => {
  it("opens on the US without parameters", () => {
    expect(initialMapView(load(""))).toEqual({ camera: { bounds: US_BOUNDS }, place: null, state: null, nearMe: false })
  })

  it("fits a place's radius", () => {
    const view = initialMapView(load("q=Seattle&lat=47.6&lng=-122.3&r=5"))
    expect(view.place).toEqual({ label: "Seattle", lng: -122.3, lat: 47.6, radius: 5 })
    expect(view.camera).toEqual({ bounds: boundsOfRadius(-122.3, 47.6, 5), maxZoom: 13 })
  })

  it("defaults the radius to 10 miles", () => {
    expect(initialMapView(load("q=Seattle&lat=47.6&lng=-122.3")).place?.radius).toBe(10)
  })

  it("fits a state, and ignores unknown codes", () => {
    expect(initialMapView(load("state=WA")).camera).toEqual({ bounds: STATES.WA.bounds, maxZoom: 7.5 })
    expect(initialMapView(load("state=ZZ"))).toMatchObject({ camera: { bounds: US_BOUNDS }, state: null })
  })

  it("restores a moved camera", () => {
    expect(initialMapView(load("lat=47.61&lng=-122.33&z=11.5")).camera).toEqual({ longitude: -122.33, latitude: 47.61, zoom: 11.5 })
  })

  it("puts a shared location first", () => {
    const view = initialMapView(load("state=WA&location=x"), { longitude: -122.6, latitude: 48.5 })
    expect(view.camera).toEqual({ longitude: -122.6, latitude: 48.5, zoom: 14 })
  })

  it("never reads coordinates for near=me", () => {
    expect(initialMapView(load("near=me&r=10&q=x&lat=47&lng=-122&z=9"))).toEqual({ camera: { bounds: US_BOUNDS }, place: null, state: null, nearMe: true })
  })

  it("ignores coordinates out of range", () => {
    expect(initialMapView(load("lat=95&lng=10&z=4")).camera).toEqual({ bounds: US_BOUNDS })
  })
})

describe("STATES", () => {
  it("matches the outlines in public/geo/us-states.json", () => {
    const file = path.join(__dirname, "../../public/geo/us-states.json")
    const outlines = JSON.parse(readFileSync(file, "utf8")) as StateCollection
    const fromFile = Object.fromEntries(
      outlines.features.filter((f) => f.properties.region).map((f) => [f.properties.region, { name: f.properties.name, bounds: boundsOf(f.geometry) }]),
    )
    expect(STATES).toEqual(fromFile)
  })
})
