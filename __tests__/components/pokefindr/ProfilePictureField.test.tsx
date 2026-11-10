import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import { ProfilePictureField } from "@/components/pokefindr/ProfilePictureField"

const file = (type: string, size = 1000) => new File([new Uint8Array(size)], "photo", { type })

function setup(props: Partial<React.ComponentProps<typeof ProfilePictureField>> = {}) {
  const onUpload = vi.fn(async () => undefined as string | void)
  const onRemove = vi.fn(async () => undefined as string | void)
  render(
    <dl>
      <ProfilePictureField name="misty" image={null} onUpload={onUpload} onRemove={onRemove} {...props} />
    </dl>,
  )
  const input = screen.getByLabelText("Profile picture") as HTMLInputElement
  return { onUpload, onRemove, input }
}

describe("ProfilePictureField", () => {
  it("opens the labelled, hidden file input from Upload photo", () => {
    const { input } = setup()
    expect(input.type).toBe("file")
    expect(input.tabIndex).toBe(-1)
    const click = vi.spyOn(input, "click")
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }))
    expect(click).toHaveBeenCalled()
    // Nothing to remove without a picture.
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull()
  })

  it("uploads a photo", async () => {
    const { input, onUpload } = setup()
    const photo = file("image/jpeg")
    fireEvent.change(input, { target: { files: [photo] } })
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(photo))
  })

  it("refuses a file over 2 MB or of the wrong type before uploading", () => {
    const { input, onUpload } = setup()
    fireEvent.change(input, { target: { files: [file("image/png", 2 * 1024 * 1024 + 1)] } })
    expect(screen.getByRole("alert")).toHaveTextContent("That file is over 2 MB. Choose a smaller photo.")
    fireEvent.change(input, { target: { files: [file("image/svg+xml")] } })
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPEG, PNG or WebP photo.")
    fireEvent.change(input, { target: { files: [file("image/gif")] } })
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPEG, PNG or WebP photo.")
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("removes the picture, and shows the server's error when it fails", async () => {
    const onRemove = vi.fn(async () => "Profile pictures aren't available right now.")
    setup({ image: "/uploads/a.webp", onRemove })
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile pictures aren't available right now.")
    expect(onRemove).toHaveBeenCalled()
  })

  it("is in Spanish on Spanish pages", () => {
    render(
      <dl>
        <ProfilePictureField name="misty" image="/a.webp" onUpload={vi.fn()} onRemove={vi.fn()} />
      </dl>,
      { locale: "es" },
    )
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Quitar foto" })).toBeInTheDocument()
  })
})
