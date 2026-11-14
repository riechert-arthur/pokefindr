import { describe, expect, it } from "vitest"
import { render, screen } from "../helpers/intl"
import { LoadingButton } from "@/components/wrappers/LoadingButton"

describe("LoadingButton", () => {
  it("shows its label and can be pressed when not pending", () => {
    render(
      <LoadingButton type="submit" pending={false} pendingLabel="Saving">
        Save
      </LoadingButton>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toBeEnabled()
    expect(button.querySelector(".animate-spin")).toBeNull()
  })

  it("is disabled and shows a spinner and the pending label while pending", () => {
    render(
      <LoadingButton type="submit" pending pendingLabel="Saving">
        Save
      </LoadingButton>,
    )
    const button = screen.getByRole("button", { name: "Saving" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("type", "submit")
    expect(button.querySelector(".animate-spin")).not.toBeNull()
  })

  it("keeps the caller's type while pending", () => {
    render(
      <LoadingButton type="button" pending pendingLabel="Allowing">
        Allow
      </LoadingButton>,
    )
    expect(screen.getByRole("button", { name: "Allowing" })).toHaveAttribute("type", "button")
  })

  it("can be disabled without being pending", () => {
    render(
      <LoadingButton pending={false} pendingLabel="Allowing" disabled>
        Allow
      </LoadingButton>,
    )
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled()
  })

  it("stays the same element when it starts and stops pending", () => {
    const { rerender } = render(
      <LoadingButton type="submit" pending={false} pendingLabel="Saving">
        Save
      </LoadingButton>,
    )
    const before = screen.getByRole("button")
    rerender(
      <LoadingButton type="submit" pending pendingLabel="Saving">
        Save
      </LoadingButton>,
    )
    expect(screen.getByRole("button")).toBe(before)
  })
})
