import { render } from "../../helpers/intl"
import { describe, expect, it } from "vitest"
import { AgentMark } from "@/components/brand/AgentMark"
import { Logo } from "@/components/brand/Logo"

describe("AgentMark", () => {
  it("is decorative, draws the pin glyph in primary-foreground on the brand gradient", () => {
    const { container } = render(<AgentMark size="lg" />)
    const mark = container.firstElementChild as HTMLElement
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark).toHaveClass("from-brand", "to-brand-2", "text-primary-foreground")
    expect(mark).not.toHaveClass("text-white")
    expect(mark.querySelector("svg")).toHaveClass("lucide-agent-pin")
  })

  it("draws the logo's own pin, so a change to the logo carries over", () => {
    const pin = render(<AgentMark />).container.querySelector("path")
    const logoPin = render(<Logo size={32} title="" />).container.querySelector("path")
    expect(pin?.getAttribute("d")).toBe(logoPin?.getAttribute("d"))
  })

  it.each([
    ["sm", "size-[26px]", "[&_svg]:size-4"],
    ["md", "size-[34px]", "[&_svg]:size-5"],
    ["lg", "size-11", "[&_svg]:size-[26px]"],
  ] as const)("at %s, is a %s box with a %s glyph", (size, box, glyph) => {
    expect(render(<AgentMark size={size} />).container.firstElementChild).toHaveClass(box, glyph)
  })
})
