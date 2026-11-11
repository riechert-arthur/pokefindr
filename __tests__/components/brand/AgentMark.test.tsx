import { render } from "../../helpers/intl"
import { describe, expect, it } from "vitest"
import { AgentMark } from "@/components/brand/AgentMark"

const mark = (props: Parameters<typeof AgentMark>[0] = {}) => render(<AgentMark {...props} />).container.querySelector("svg") as SVGSVGElement

describe("AgentMark (#386)", () => {
  it("is decorative, with no tile behind it", () => {
    const svg = mark()
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg.getAttribute("class")).not.toMatch(/bg-|rounded/)
  })

  it("draws two sweeps and a core in the logo's gradient, brand to brand-2, and no raw colors", () => {
    const svg = mark()
    const stops = [...svg.querySelectorAll("stop")].map((s) => s.style.stopColor)
    expect(stops).toEqual(["hsl(var(--brand))", "hsl(var(--brand-2))"])
    // The shapes cut the still gradient out: two sweeps (one turned 180°) and the core.
    const fill = svg.querySelector("rect")!
    expect(fill.getAttribute("fill")).toBe(`url(#${svg.querySelector("linearGradient")!.id})`)
    expect(fill.getAttribute("mask")).toBe(`url(#${svg.querySelector("mask")!.id})`)
    const [first, second] = svg.querySelectorAll("mask path")
    expect(second.getAttribute("d")).toBe(first.getAttribute("d"))
    expect(second.getAttribute("transform")).toBe("rotate(180 12 12)")
    expect(svg.querySelectorAll("mask circle")).toHaveLength(1)
  })

  it("gives each mark its own gradient id, so two on a page don't share one", () => {
    const { container } = render(
      <>
        <AgentMark />
        <AgentMark />
      </>,
    )
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })

  it("turns its sweeps only while thinking, never with reduced motion, and the core stays still", () => {
    const sweeps = (svg: SVGSVGElement) => svg.querySelector("[data-sweeps]")!.getAttribute("class") ?? ""
    expect(sweeps(mark())).not.toContain("animate-")
    const thinking = mark({ thinking: true })
    expect(sweeps(thinking)).toContain("animate-[spin_2.2s_linear_infinite]")
    expect(sweeps(thinking)).toContain("motion-reduce:animate-none")
    expect(thinking.querySelector("[data-sweeps] circle")).toBeNull()
    // With reduced motion, a still cue instead: the thinking mark is dimmed.
    expect(thinking).toHaveClass("motion-reduce:opacity-50")
    expect(mark()).not.toHaveClass("motion-reduce:opacity-50")
  })

  it.each([
    ["sm", "size-[26px]"],
    ["md", "size-[34px]"],
    ["lg", "size-11"],
  ] as const)("at %s, fills a %s box", (size, box) => {
    expect(mark({ size })).toHaveClass(box)
  })
})
