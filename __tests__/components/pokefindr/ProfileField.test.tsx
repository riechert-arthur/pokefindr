import React, { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { ProfileField } from "@/components/pokefindr/ProfileField"

function Row({ onSave = async () => undefined }: { onSave?: (value: string) => Promise<string | void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("misty")
  return (
    <dl>
      <ProfileField
        label="Username"
        value={value}
        editing={editing}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={async (next) => {
          const error = await onSave(next)
          if (error) return error
          setValue(next)
          setEditing(false)
        }}
      />
    </dl>
  )
}

describe("ProfileField", () => {
  it("links Update to its row's label", () => {
    render(<Row />)
    const update = screen.getByRole("button", { name: "Update" })
    expect(update).toHaveAccessibleDescription("Username")
  })

  it("moves focus into a labelled field on Update, and saves on Enter", async () => {
    const onSave = vi.fn(async () => undefined)
    render(<Row onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Update" }))
    const input = screen.getByRole("textbox", { name: "Username" })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "  brock " } })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() => expect(screen.getByText("brock")).toBeInTheDocument())
    expect(onSave).toHaveBeenCalledWith("brock")
    expect(screen.getByRole("button", { name: "Update" })).toHaveFocus()
  })

  it("cancels on Escape and returns focus to Update", () => {
    const onSave = vi.fn(async () => undefined)
    render(<Row onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Update" }))
    const input = screen.getByRole("textbox", { name: "Username" })
    fireEvent.change(input, { target: { value: "brock" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("misty")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Update" })).toHaveFocus()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("shows a server error next to the field and keeps it open", async () => {
    render(<Row onSave={async () => "That username is already taken"} />)
    fireEvent.click(screen.getByRole("button", { name: "Update" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("That username is already taken")
    const input = screen.getByRole("textbox", { name: "Username" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("That username is already taken")
  })
})
