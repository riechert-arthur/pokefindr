import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Composer } from "@/components/assistant/Composer"

describe("Composer", () => {
  it("sends the trimmed text on Enter, adds a line on Shift+Enter, and ignores blank text", () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<Composer value="  near Denver  " onChange={vi.fn()} onSubmit={onSubmit} />)
    const box = screen.getByRole("textbox", { name: "Message the assistant" })
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledWith("near Denver")
    rerender(<Composer value="   " onChange={vi.fn()} onSubmit={onSubmit} />)
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  })

  it("shows Stop while busy", () => {
    const onStop = vi.fn()
    render(<Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} busy onStop={onStop} />)
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(onStop).toHaveBeenCalled()
  })
})
