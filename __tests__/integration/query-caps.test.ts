import { beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { GET as bboxRoute } from "@/app/api/locations/route"
import { GET as nearRoute } from "@/app/api/locations/near/route"
import { GET as searchRoute } from "@/app/api/locations/search/route"
import { GET as citiesRoute } from "@/app/api/locations/cities/route"
import { GET as highlightsRoute } from "@/app/api/highlights/route"
import { BBOX_LIMIT, NEAR_LIMIT, TOP_CITIES_LIMIT } from "@/server/services/locations"
import { MAX_BBOX_AREA } from "@/lib/locations/bbox"

/** More machines around Denver than any route may return at once. */
const SEEDED = BBOX_LIMIT + 100

let ip = 0
const get = (route: (r: NextRequest) => Promise<Response>, query: string) =>
  route(new NextRequest(`http://localhost/api/x?${query}`, { headers: { "x-forwarded-for": `198.51.100.${++ip % 250}` } }))

beforeEach(async () => {
  await getDb()
    .insert(locations)
    .values(
      Array.from({ length: SEEDED }, (_, i) => ({
        machineId: `Q9${String(i).padStart(4, "0")}`,
        retailer: "King Soopers",
        address: `${i} Main St`,
        city: `Town ${i % 60}`,
        state: "CO",
        geog: { lng: -105 + (i % 30) * 0.003, lat: 39.7 + Math.floor(i / 30) * 0.003 },
      })),
    )
})

describe("no endpoint returns every location (#201, docs/scraping.md)", () => {
  it("won't list every location without a box, or a box over the limit", async () => {
    expect((await get(bboxRoute, "")).status).toBe(400)
    const side = Math.ceil(Math.sqrt(MAX_BBOX_AREA)) + 1
    expect((await get(bboxRoute, `bbox=-110,30,${-110 + side},${30 + side}`)).status).toBe(400)
  })

  it("caps each route's rows, and says when there were more", async () => {
    const box = await (await get(bboxRoute, "bbox=-106,39,-104,41")).json()
    expect(box.features).toHaveLength(BBOX_LIMIT)
    expect(box.truncated).toBe(true)

    const near = await (await get(nearRoute, "lng=-105&lat=39.7&r=50")).json()
    expect(near.features.length).toBeLessThanOrEqual(NEAR_LIMIT)
    expect(near.total).toBe(SEEDED)
    expect((await get(nearRoute, `lng=-105&lat=39.7&r=50&limit=${NEAR_LIMIT + 1}`)).status).toBe(400)

    const search = await (await get(searchRoute, "q=King&limit=20")).json()
    expect(search.features.length).toBeLessThanOrEqual(20)
    expect((await get(searchRoute, "q=King&limit=21")).status).toBe(400)

    const cities = await (await get(citiesRoute, "state=CO")).json()
    expect(cities.cities.length).toBeLessThanOrEqual(TOP_CITIES_LIMIT)

    const highlights = await (await highlightsRoute()).json()
    expect(JSON.stringify(highlights).match(/"id"/g)?.length ?? 0).toBeLessThan(20)
  })
})
