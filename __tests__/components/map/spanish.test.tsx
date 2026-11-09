import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "../../helpers/intl"
import { MapStatusPill } from "@/components/map/MapStatusPill"
import { ResultsSheet } from "@/components/map/ResultsSheet"
import { ReportForm } from "@/components/map/ReportForm"
import { ReviewSummary } from "@/components/map/Reviews"
import { MapFailed } from "@/components/map/MapStatus"
import { TypeChip } from "@/components/pokefindr/TypeChip"
import type { ReviewsState } from "@/components/map/useLocationReviews"
import type { NearbyLocations } from "@/lib/types/locations"
import { submissionSchema } from "@/lib/submissions/schemas"

afterEach(() => vi.unstubAllGlobals())

const feature = (id: string, retailer: string, distance: number) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [-99.13, 19.43] },
  properties: { id, machineID: id, retailer, address: "Av. Juárez 1", city: "Ciudad de México", state: "CDMX", kind: "vending" as const, distance },
})
const RESULTS: NearbyLocations = { type: "FeatureCollection", features: [feature("a", "Walmart", 1)], counts: { vending: 1 }, total: 1, truncated: false }

describe("the map in Spanish (#179)", () => {
  it("words the status pill with Spanish counts", () => {
    render(<MapStatusPill zoomedOut={false} total={null} inView={1457} status="ready" truncated={false} kinds={["vending", "shop"]} />, { locale: "es" })
    expect(screen.getByRole("status")).toHaveTextContent("1457 lugares a la vista · cargados para esta zona")
  })

  it("lists results in kilometers for a browser in Mexico", () => {
    vi.stubGlobal("navigator", { ...navigator, languages: ["es-MX"], language: "es-MX" })
    render(<ResultsSheet label="Ciudad de México" radius={5} onRadiusChange={() => {}} kinds={["vending"]} nearby={{ status: "ready", results: RESULTS, reload: () => {} }} onOpen={() => {}} />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "1 máquina expendedora cerca de Ciudad de México" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "8 km" })).toBeInTheDocument()
    expect(screen.getByText("1,6 km")).toBeInTheDocument()
  })

  it("agrees with the kind's gender in the report form", () => {
    const { unmount } = render(<ReportForm locationId="a" kind="vending" signedIn onClose={() => {}} />, { locale: "es" })
    expect(screen.getByText("¿Qué pasa con esta máquina expendedora?")).toBeInTheDocument()
    unmount()
    render(<ReportForm locationId="a" kind="event" signedIn={false} onClose={() => {}} />, { locale: "es" })
    expect(screen.getByText(/para reportar un problema con este evento\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Inicia sesión" })).toHaveAttribute("href", "/es/login")
  })

  it("writes ratings and chips in Spanish", () => {
    const reviews = { status: "ready", reviews: [], count: 2, average: 4.5 } as unknown as ReviewsState
    render(<ReviewSummary reviews={reviews} />, { locale: "es" })
    expect(screen.getByText("4,5 · 2 reseñas")).toBeInTheDocument()
    render(<TypeChip kind="shop" pressed onPressedChange={() => {}} short />, { locale: "es" })
    expect(screen.getByRole("button", { name: "Tiendas" })).toBeInTheDocument()
  })

  it("explains a map that couldn't start", () => {
    render(<MapFailed failure="webgl" />, { locale: "es" })
    expect(screen.getByRole("alert")).toHaveTextContent("Este navegador no pudo iniciar el mapa")
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument()
  })

  it("names each schema message's catalog key, so the form can translate it", () => {
    const parsed = submissionSchema.safeParse({ kind: "shop", name: "x", lng: 0, lat: 0, city: "", website: "ftp://x" })
    expect(parsed.success).toBe(false)
    const keys = parsed.error!.issues.filter((i) => i.code === "custom").map((i) => (i.params as { key: string }).key)
    expect(keys).toEqual(expect.arrayContaining(["name", "city", "link"]))
  })
})
