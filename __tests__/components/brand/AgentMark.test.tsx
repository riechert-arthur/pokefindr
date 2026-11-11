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
    const stops = [...svg.querySelectorAll("stop")].map((s) => s.getAttribute("style"))
    expect(stops).toEqual(["stop-color: hsl(var(--brand));", "stop-color: hsl(var(--brand-2));"])
    const id = svg.querySelector("linearGradient")!.id
    const shapes = [...svg.querySelectorAll("path, circle")]
    expect(shapes).toHaveLength(3)
    for (const shape of shapes) expect(shape.getAttribute("fill")).toBe(`url(#${id})`)
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
  })

  it.each([
    ["sm", "size-[26px]"],
    ["md", "size-[34px]"],
    ["lg", "size-11"],
  ] as const)("at %s, fills a %s box", (size, box) => {
    expect(mark({ size })).toHaveClass(box)
  })
})
