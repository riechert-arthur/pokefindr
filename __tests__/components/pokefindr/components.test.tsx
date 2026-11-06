import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { InboxIcon } from "lucide-react"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KindDot } from "@/components/pokefindr/KindDot"
import { KIND_ORDER, KINDS, countLabel, toKind } from "@/components/pokefindr/kinds"
import { SponsoredSlot } from "@/components/pokefindr/SponsoredSlot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { TypeChip } from "@/components/pokefindr/TypeChip"

describe("kinds", () => {
  it("maps every kind to its token color", () => {
    for (const k of KIND_ORDER) expect(KINDS[k].bg).toBe(`bg-kind-${k}`)
  })
  it("pluralizes counts", () => {
    expect(countLabel("vending", 1)).toBe("1 vending machine")
    expect(countLabel("shop", 1457)).toBe("1,457 card shops")
  })
})

describe("KindDot", () => {
  it("is decorative without a label and named with one", () => {
    const { container, rerender } = render(<KindDot kind="shop" />)
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
    expect(container.firstElementChild).toHaveClass("bg-kind-shop")
    rerender(<KindDot kind="event" label="Event" />)
    expect(screen.getByRole("img", { name: "Event" })).toHaveClass("bg-kind-event")
  })
})

describe("TypeChip", () => {
  it("toggles and fills its swatch with the kind color when pressed", () => {
    const onPressedChange = vi.fn()
    const { rerender } = render(<TypeChip kind="vending" pressed={false} count={1457} short onPressedChange={onPressedChange} />)
    // The name starts with the visible text ("Vending 1,457"), for voice control.
    const chip = screen.getByRole("button", { name: "Vending 1,457" })
    expect(chip).toHaveAttribute("aria-pressed", "false")
    expect(chip).toHaveTextContent("Vending")
    fireEvent.click(chip)
    expect(onPressedChange).toHaveBeenCalledWith(true)
    rerender(<TypeChip kind="vending" pressed count={1457} short onPressedChange={onPressedChange} />)
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(chip.querySelector("[aria-hidden]")).toHaveClass("bg-kind-vending")
  })
})

describe("StatusBadge", () => {
  it.each([
    ["live", "Live", "text-success"],
    ["pending", "Pending review", "text-warning"],
    ["coming-soon", "Coming soon", "border-dashed"],
  ] as const)("renders %s", (status, label, cls) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toHaveClass(cls)
  })
})

describe("EmptyState", () => {
  it("shows title, body and action", () => {
    render(<EmptyState icon={InboxIcon} title="Nothing within 10 mi" action={<button>Widen to 25 mi</button>}>Try a wider radius.</EmptyState>)
    expect(screen.getByText("Nothing within 10 mi")).toBeInTheDocument()
    expect(screen.getByText("Try a wider radius.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Widen to 25 mi" })).toBeInTheDocument()
  })
})

describe("SponsoredSlot", () => {
  it("is labelled, links with rel=sponsored, and can be dismissed", () => {
    const onDismiss = vi.fn()
    render(<SponsoredSlot sponsor="Sample sponsor" title="Buy singles online" cta="See the deal" href="https://example.com" onDismiss={onDismiss} />)
    expect(screen.getByRole("complementary", { name: /^Sponsored: / })).toHaveTextContent("Sponsored · Sample sponsor")
    expect(screen.getByRole("link", { name: "Buy singles online" })).toHaveAttribute("rel", "sponsored nofollow noopener")
    fireEvent.click(screen.getByRole("button", { name: "Hide ads for this visit" }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it("shows a button in the strip variant", () => {
    render(<SponsoredSlot variant="strip" sponsor="S" title="T" cta="See the deal" href="https://example.com" />)
    expect(screen.getByRole("link", { name: "See the deal" })).toBeInTheDocument()
    // One link per ad: the title isn't a second one.
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })
})

describe("class merging", () => {
  it("draws a large KindDot as a rounded square, not a circle", () => {
    const { container } = render(<KindDot kind="shop" size="lg" />)
    const dot = container.firstElementChild!
    expect(dot).toHaveClass("rounded-lg")
    expect(dot).not.toHaveClass("rounded-full")
  })

  it("shows 0 as EmptyState content, but not empty strings or booleans", () => {
    const { container, rerender } = render(<EmptyState title="Saved places">{0}</EmptyState>)
    expect(screen.getByText("0")).toBeInTheDocument()
    for (const empty of ["", true, false, null]) {
      rerender(<EmptyState title="Saved places">{empty}</EmptyState>)
      expect(container.querySelector(".text-muted-foreground"), String(empty)).toBeNull()
    }
  })

  it("keeps the dismiss button's room even when the caller sets padding", () => {
    const { container } = render(
      <SponsoredSlot sponsor="S" title="T" cta="Go" href="https://example.com" className="p-4" onDismiss={() => {}} />,
    )
    expect(container.firstElementChild).toHaveClass("p-4", "pr-9")
  })

  it("names each sponsored slot by its title", () => {
    render(
      <>
        <SponsoredSlot sponsor="S" title="Deal A" cta="Go" href="https://example.com" />
        <SponsoredSlot sponsor="S" title="Deal B" cta="Go" href="https://example.com" />
      </>,
    )
    expect(screen.getByRole("complementary", { name: "Sponsored: Deal A" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Sponsored: Deal B" })).toBeInTheDocument()
  })

  it("keeps the strip's right padding clear for the dismiss button", () => {
    const { container } = render(
      <SponsoredSlot variant="strip" sponsor="S" title="T" cta="Go" href="https://example.com" onDismiss={() => {}} />,
    )
    expect(container.firstElementChild).toHaveClass("pr-9", "pl-4")
  })

  it("treats unknown or missing kinds from the API as vending", () => {
    expect(toKind("shop")).toBe("shop")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(toKind("card_shop")).toBe("vending")
    expect(toKind(undefined)).toBe("vending")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(toKind("toString")).toBe("vending")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"toString"'))
    warn.mockRestore()
  })
})

