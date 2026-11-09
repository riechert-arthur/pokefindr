import { describe, expect, it } from "vitest"
import { render, screen } from "../../helpers/intl"
import { AssistantText } from "@/components/assistant/AssistantText"

describe("AssistantText", () => {
  it("renders paragraphs, bullets and bold", () => {
    const { container } = render(<AssistantText text={"Two near you.\n\n- **Safeway** on Pike\n- QFC\nTry a wider radius."} />)
    expect(container.querySelectorAll("p")).toHaveLength(2)
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Safeway on Pike", "QFC"])
    expect(screen.getByText("Safeway").tagName).toBe("STRONG")
  })

  it("shows HTML, markdown links and URLs as plain text, never as markup or links", () => {
    const text = '<img src=x onerror=alert(1)> [click](javascript:alert(1)) <a href="https://evil.example">here</a> https://evil.example'
    const { container } = render(<AssistantText text={text} />)
    expect(container.querySelector("img, a, script")).toBeNull()
    expect(container.textContent).toBe(text)
  })
})
