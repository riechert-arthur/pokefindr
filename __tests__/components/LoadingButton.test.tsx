import React from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "../helpers/intl"
import { LoadingButton } from "@/components/wrappers/LoadingButton"

describe("LoadingButton", () => {
  it("renders disabled submit button content while loading", () => {
    render(<LoadingButton>Saving</LoadingButton>)

    const button = screen.getByRole("button", { name: /saving/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("type", "submit")
    expect(button.querySelector(".animate-spin")).not.toBeNull()
  })
})
