import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"
import { fireEvent, render, screen } from "../../helpers/intl"
import { Form } from "@/components/ui/form"
import { AuthField } from "@/components/forms/AuthField"

// The wiring every auth field shares. Which fields each form has, and their copy, is in auth-forms.test.tsx.

const schema = z.object({ email: z.string().email("Enter an email") })

function EmailForm(props: { type?: string; autoComplete?: string; placeholder?: string; labelExtra?: ReactNode }) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <AuthField control={form.control} name="email" label="Email" {...props} />
        <button type="submit">Go</button>
      </form>
    </Form>
  )
}

describe("AuthField", () => {
  it("labels its input", () => {
    render(<EmailForm />)
    expect(screen.getByLabelText("Email").tagName).toBe("INPUT")
  })

  it("passes the input's own props through", () => {
    render(<EmailForm type="email" autoComplete="email" placeholder="you@example.com" />)
    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("type", "email")
    expect(input).toHaveAttribute("autocomplete", "email")
    expect(input).toHaveAttribute("placeholder", "you@example.com")
  })

  it("shows labelExtra beside the label, not inside it", () => {
    render(<EmailForm labelExtra={<button type="button">Help</button>} />)
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument()
    // An exact match: "Help" isn't part of the label's text.
    expect(screen.getByLabelText("Email").tagName).toBe("INPUT")
  })

  it("shows the validation message and points the input at it", async () => {
    render(<EmailForm />)
    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("aria-invalid", "false")

    fireEvent.click(screen.getByRole("button", { name: "Go" }))

    const message = await screen.findByText("Enter an email")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(message.id)
  })
})
