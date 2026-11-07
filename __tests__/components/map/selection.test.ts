import { describe, expect, it } from "vitest"
import { NO_SELECTION, selectionReducer, type Selection, type SelectionAction } from "@/components/map/selection"

type L = { id: string }
const a: L = { id: "a" }
const b: L = { id: "b" }
const run = (...actions: SelectionAction<L>[]) =>
  actions.reduce<Selection<L>>((s, x) => selectionReducer(s, x), NO_SELECTION as Selection<L>)

describe("selectionReducer", () => {
  it("opens the popup on the selected place", () => {
    expect(run({ type: "select", location: a })).toEqual({ selected: a, popup: true, details: null })
  })

  it("closes the popup and moves to details on View details", () => {
    expect(run({ type: "select", location: a }, { type: "openDetails" })).toEqual({ selected: a, popup: false, details: a })
  })

  it("closes another place's details when a new place is picked", () => {
    expect(run({ type: "select", location: a }, { type: "openDetails" }, { type: "select", location: b })).toEqual({
      selected: b,
      popup: true,
      details: null,
    })
  })

  it("keeps the ring while that place's details are open, clears it otherwise", () => {
    expect(run({ type: "select", location: a }, { type: "openDetails" }, { type: "closePopup" })).toEqual({
      selected: a,
      popup: false,
      details: a,
    })
    expect(run({ type: "select", location: a }, { type: "closePopup" })).toEqual({ selected: null, popup: false, details: null })
  })

  it("keeps the ring when the details close", () => {
    expect(run({ type: "select", location: a }, { type: "openDetails" }, { type: "closeDetails" })).toEqual({
      selected: a,
      popup: false,
      details: null,
    })
  })
})

describe("showDetails (from the URL)", () => {
  it("selects the place and opens its details without a popup", () => {
    expect(run({ type: "showDetails", location: a })).toEqual({ selected: a, popup: false, details: a })
  })

  it("switches the panel when Back lands on another place's details", () => {
    expect(run({ type: "select", location: b }, { type: "openDetails" }, { type: "showDetails", location: a })).toEqual({
      selected: a,
      popup: false,
      details: a,
    })
  })
})
