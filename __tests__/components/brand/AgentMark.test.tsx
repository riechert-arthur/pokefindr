import { render } from "../../helpers/intl"
import { describe, expect, it } from "vitest"
import { AgentMark } from "@/components/brand/AgentMark"

describe("AgentMark", () => {
  it("is decorative, draws the pin glyph in primary-foreground on the brand gradient", () => {
    const { container } = render(<AgentMark size="lg" />)
    const mark = container.firstElementChild as HTMLElement
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark).toHaveClass("from-brand", "to-brand-2", "text-primary-foreground")
    expect(mark).not.toHaveClass("text-white")
    expect(mark.querySelector("svg")).toHaveClass("lucide-agent-pin")
  })

  it("scales the glyph with the box", () => {
    const glyph = (size: "sm" | "md" | "lg") => render(<AgentMark size={size} />).container.firstElementChild!.className.match(/\[&_svg\]:(size-\S+)/)?.[1]
    expect(["sm", "md", "lg"].map((s) => glyph(s as "sm"))).toEqual(["size-4", "size-5", "size-[26px]"])
  })
})
