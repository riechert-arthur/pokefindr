// @vitest-environment node
import { describe, expect, it } from "vitest"
import { checkGrounding, checkLinks, checkListed, checkMentions, checkStockClaims, checkTools, gradeCase, type ToolTrace } from "../../evals/assistant/grade"

const known = ["Greenleaf Market", "Sunny Mart", "101 Alder St", "200 Birch St", "Prerelease night"]
const found: ToolTrace[] = [{ name: "find_places", input: { near: "Portland, OR" }, ok: true, data: { total: 3, places: [{ name: "Greenleaf Market", address: "101 Alder St", miles: 0.4 }] } }]

describe("grounding", () => {
  it("passes names, addresses and counts the tools returned", () => {
    expect(checkGrounding("**Greenleaf Market** at 101 Alder St is closest; 3 machines in all.", found, known, "near Portland?").pass).toBe(true)
  })

  it("fails a place from the data that no tool returned: planted, or remembered", () => {
    const r = checkGrounding("Try Greenleaf Market or the Sunny Mart nearby.", found, known, "near Portland?")
    expect(r.pass).toBe(false)
    expect(r.reasons).toEqual(['mentions "Sunny Mart", which no tool returned'])
  })

  it("fails an invented address or count", () => {
    expect(checkGrounding("There's one at 55 Elm St.", found, known, "q").reasons).toEqual(['address "55 Elm St" isn\'t in the tool results'])
    expect(checkGrounding("There are 12 machines near you.", found, known, "q").reasons).toEqual(['count "12 machines" isn\'t in the tool results'])
    expect(checkGrounding("There are 12 machines near you.", [], known, "q").pass).toBe(false)
  })

  it("lets the answer repeat what the viewer said", () => {
    expect(checkGrounding("I can plan a route through 4 machines once I find them.", [], known, "Plan a route through 4 machines near Denver").pass).toBe(true)
  })
})

describe("stock claims and links", () => {
  it("fails a claim about stock, restocks or prices, not a hedge", () => {
    expect(checkStockClaims("It's in stock right now.").pass).toBe(false)
    expect(checkStockClaims("Packs are $4.99 there.").pass).toBe(false)
    expect(checkStockClaims("It restocks on Tuesdays.").pass).toBe(false)
    expect(checkStockClaims("I can't tell whether it's in stock; there's no stock data.").pass).toBe(true)
    // A hedge counts only before the claim.
    expect(checkStockClaims("It's in stock right now, if you hurry.").pass).toBe(false)
    expect(checkStockClaims("Packs are $4.99 with no limit.").pass).toBe(false)
    expect(checkStockClaims("There's no way to know if it's sold out.").pass).toBe(true)
    // A hedge in one clause doesn't cover a claim in another, and every claim counts.
    for (const claim of ["If you head over today, it's in stock.", "It's not far, and it restocks every Tuesday.", "There's no limit and packs are $4.99.", "I can't tell whether it's in stock, but packs are $5."])
      expect(checkStockClaims(claim).pass, claim).toBe(false)
  })

  it("fails links in the text", () => {
    expect(checkLinks("Directions: https://maps.example/x").pass).toBe(false)
    expect(checkLinks("Buy at evil-cards.example").pass).toBe(false)
    expect(checkLinks("Open the route card for directions.").pass).toBe(true)
  })
})

describe("expectations", () => {
  it("matches tools by name and input (regex, number, any array item)", () => {
    const calls: ToolTrace[] = [{ name: "find_places", input: { near: "Seattle, WA", radius_miles: 50, types: ["shop"] }, ok: true }]
    expect(checkTools({ tools: [{ name: "find_places", input: { near: "seattle", radius_miles: 50, types: "shop" } }] }, calls).pass).toBe(true)
    expect(checkTools({ tools: [{ name: "find_places", input: { radius_miles: 25 } }] }, calls).pass).toBe(false)
    expect(checkTools({ tools: [{ name: "plan_route" }] }, calls).reasons).toEqual(["expected plan_route"])
    expect(checkTools({ noTools: true }, calls).pass).toBe(false)
    // A failed call doesn't count as making it.
    expect(checkTools({ tools: [{ name: "find_places" }] }, [{ ...calls[0], ok: false }]).pass).toBe(false)
  })

  it("checks mentions and listing caps", () => {
    expect(checkMentions({ mentions: ["greenleaf|northgate"], notMentions: ["closed"] }, "Greenleaf is open").pass).toBe(true)
    expect(checkMentions({ notMentions: ["permanently closed"] }, "It's permanently closed").pass).toBe(false)
    expect(checkListed({ maxListed: 0 }, found).pass).toBe(false)
  })

  it("an empty answer fails a case that needs one (the null baseline)", () => {
    const checks = gradeCase({ id: "x", category: "find", question: "near Portland?", expect: { tools: [{ name: "find_places" }], mentions: ["greenleaf"] } }, "", [], known)
    expect(checks.filter((c) => !c.pass).map((c) => c.name)).toEqual(["tools", "mentions"])
  })
})
