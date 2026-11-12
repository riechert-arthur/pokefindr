import { describe, expect, it } from "vitest"
import { compareShops, isCoinOrStampDealer, overpassQuery, selectShops, toShop, type OsmElement } from "@/lib/osm/card-shops"

const node = (id: number, tags: Record<string, string>, at: [number, number] = [-73.99, 40.74]): OsmElement => ({ type: "node", id, lon: at[0], lat: at[1], tags })

describe("OSM card shops (#397)", () => {
  it("asks for collector and game shops, card-named hobby shops, and no board-game cafes or clubs, in the US", () => {
    const q = overpassQuery()
    expect(q).toContain(`area["ISO3166-1"="US"][admin_level=2]->.a;`)
    expect(q).toContain(`nwr["shop"="collector"]["cafe"!="board_game"]["club"!~"^board_games?$"](area.a);`)
    expect(q).toContain(`nwr["shop"="games"]["cafe"!="board_game"]["club"!~"^board_games?$"](area.a);`)
    expect(q).toContain(`nwr["shop"~"^(hobby|comics|anime|toys)$"]["name"~"card|tcg|pok",i]`)
    expect(q).toContain("out tags center;")
    expect(overpassQuery(`area["ISO3166-2"="US-NY"]`)).toContain(`area["ISO3166-2"="US-NY"]->.a;`)
  })

  describe("coin and stamp dealers", () => {
    it.each([
      ["a coin collector tag", { shop: "collector", collector: "coins", name: "Main Street Collectibles" }],
      ["coins and stamps", { shop: "collector", collector: "coins;stamps", name: "Philatelic Center" }],
      ["a coin name with no collector tag", { shop: "collector", name: "Hauser's Coins" }],
      ["a stamp name", { shop: "collector", name: "Falmouth Stamp & Coin" }],
      ["a gold buyer", { shop: "collector", name: "The Gold Experts" }],
      ["stamps and postcards (postcards aren't cards)", { shop: "collector", collector: "stamps;postcards", name: "Coast Philatelics" }],
    ])("drops %s", (_, tags) => expect(isCoinOrStampDealer(tags)).toBe(true))

    it.each([
      ["a card shop", { shop: "collector", name: "Dave & Adam's" }],
      ["cards and coins", { shop: "collector", name: "Arundel Cards & Coins" }],
      ["a collector tag naming cards", { shop: "collector", collector: "coins;trading_cards", name: "Smitty's" }],
      ["a game store with 'silver' in its name", { shop: "games", name: "Silver Dragon Games" }],
      ["a game store with 'golden'", { shop: "games", name: "Golden Rhino Games" }],
      ["a sports card shop with no tag", { shop: "collector", name: "Bleecker Trading" }],
    ])("keeps %s", (_, tags) => expect(isCoinOrStampDealer(tags)).toBe(false))
  })

  it("maps a place to a shop: address, website with a scheme, hours, and the state from its position first", () => {
    const shop = toShop(
      node(777464960, { name: "Al's House of Sports Cards", "addr:housenumber": "1729", "addr:street": "State Street", "addr:city": "Schenectady", "addr:state": "New York", "addr:postcode": "12304", website: "alscards.com", opening_hours: "Mo-Sa 11:00-18:00", shop: "collector" }),
      () => "NY",
    )
    expect(shop).toEqual({
      externalId: "node/777464960",
      name: "Al's House of Sports Cards",
      address: "1729 State Street",
      city: "Schenectady",
      state: "NY",
      postalCode: "12304",
      lng: -73.99,
      lat: 40.74,
      website: "https://alscards.com",
      hours: "Mo-Sa 11:00-18:00",
      tags: expect.objectContaining({ shop: "collector" }),
    })
  })

  it("falls back to addr:state outside every outline, takes a way's center, and drops places without a name or position", () => {
    const way: OsmElement = { type: "way", id: 638604285, center: { lat: 41.93, lon: -74.0 }, tags: { name: "Hudson Valley Sports Cards", "addr:state": "ny" } }
    expect(toShop(way, () => null)).toMatchObject({ externalId: "way/638604285", lng: -74.0, lat: 41.93, state: "NY", address: null, website: null })
    expect(toShop({ type: "node", id: 1, tags: { name: "No position" } })).toBeNull()
    expect(toShop(node(2, { shop: "games" }))).toBeNull()
  })

  it("selects shops: coin dealers and unusable places left out and listed, each id once, sorted by id", () => {
    const { shops, dropped } = selectShops([
      node(3, { shop: "games", name: "Twenty Sided Store" }),
      node(2, { shop: "collector", name: "Federal Coin Exchange" }),
      node(1, { shop: "collector", name: "Bleecker Trading" }),
      node(3, { shop: "games", name: "Twenty Sided Store" }),
      node(4, { shop: "games" }),
    ])
    expect(shops.map((s) => s.externalId)).toEqual(["node/1", "node/3"])
    expect(dropped).toEqual({ coinOrStamp: [{ externalId: "node/2", name: "Federal Coin Exchange" }], unusable: ["node/4"] })
  })

  it("compares a fetch with the snapshot for --dry-run: added, removed and changed ids", () => {
    const a = { externalId: "node/1", name: "A" }
    expect(compareShops([a, { externalId: "node/2", name: "B" }], [{ ...a, name: "A2" }, { externalId: "node/3", name: "C" }])).toEqual({ added: ["node/3"], removed: ["node/2"], changed: ["node/1"] })
  })
})
