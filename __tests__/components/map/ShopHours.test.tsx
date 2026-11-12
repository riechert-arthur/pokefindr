import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { ShopHours } from "@/components/map/ShopHours"

// A Wednesday.
const WEDNESDAY = new Date(2026, 10, 11, 12)

describe("ShopHours (#401)", () => {
  it("starts collapsed to today's hours, and shows the whole week with today in bold", () => {
    render(<ShopHours hours="Mo-Fr 10:00-18:30; Sa 11:00-17:00; Su off" now={WEDNESDAY} />)
    const toggle = screen.getByRole("button", { name: "Today · 10 AM – 6:30 PM hours for the week" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("list")).toBeNull()
    // The week is there but hidden, so aria-controls names an element.
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveAttribute("hidden")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    const days = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(days).toEqual([
      "Monday10 AM – 6:30 PM",
      "Tuesday10 AM – 6:30 PM",
      "Wednesday10 AM – 6:30 PM",
      "Thursday10 AM – 6:30 PM",
      "Friday10 AM – 6:30 PM",
      "Saturday11 AM – 5 PM",
      "SundayClosed",
    ])
    expect(screen.getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "date")

    fireEvent.click(toggle)
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("says Closed today, and lists split hours", () => {
    render(<ShopHours hours="Mo-Tu 10:00-14:00,16:00-20:00; We off" now={WEDNESDAY} />)
    fireEvent.click(screen.getByRole("button", { name: /Today · Closed/ }))
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("10 AM – 2 PM, 4 PM – 8 PM")
  })

  it("shows one line, with nothing to expand, when every day is the same", () => {
    const { rerender } = render(<ShopHours hours="Mo-Su 11:00-19:00" now={WEDNESDAY} />)
    expect(screen.getByText("Every day · 11 AM – 7 PM")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
    rerender(<ShopHours hours="24/7" now={WEDNESDAY} />)
    expect(screen.getByText("Every day · Open 24 hours")).toBeInTheDocument()
  })

  it("shows free text, and hours it can't read, as written", () => {
    const { rerender } = render(<ShopHours hours={"\nTues–Sat noon to 7\nSun by appointment\n"} now={WEDNESDAY} />)
    expect(screen.getByText(/Tues–Sat noon to 7/).textContent).toBe("Tues–Sat noon to 7\nSun by appointment")
    rerender(<ShopHours hours="Mo-Sa 10:00-18:00; Dec 25 off" now={WEDNESDAY} />)
    expect(screen.getByText("Mo-Sa 10:00-18:00; Dec 25 off")).toBeInTheDocument()
  })

  it("follows the viewer's language: day names and a 24-hour clock in Spanish", () => {
    render(<ShopHours hours="Mo-Fr 10:00-18:30; Sa-Su off" now={WEDNESDAY} />, { locale: "es" })
    fireEvent.click(screen.getByRole("button", { name: /Hoy · 10:00 – 18:30/ }))
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Lunes10:00 – 18:30")
    expect(screen.getAllByRole("listitem")[6]).toHaveTextContent("DomingoCerrado")
  })
})
