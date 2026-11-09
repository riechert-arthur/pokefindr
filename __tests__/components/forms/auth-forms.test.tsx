import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { LoginForm } from "@/components/forms/LoginForm"
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm"
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm"

describe("LoginForm", () => {
  it("says the email is confirmed after a confirmation link", () => {
    render(<LoginForm notice="verified" />)
    expect(screen.getByRole("status")).toHaveTextContent("Your email is confirmed")
  })

  it("explains an expired link", () => {
    render(<LoginForm notice="link-expired" />)
    expect(screen.getByRole("status")).toHaveTextContent("expired")
  })

  it("links to password reset, and shows no notice otherwise", () => {
    render(<LoginForm />)
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password")
    expect(screen.queryByRole("status")).toBeNull()
  })
})

describe("ResetPasswordForm", () => {
  it("offers a new link when the token is missing or bad", () => {
    render(<ResetPasswordForm token={null} />)
    expect(screen.getByRole("link", { name: "Send a new link" })).toHaveAttribute("href", "/forgot-password")
  })

  it("asks for the new password twice", () => {
    render(<ResetPasswordForm token="t" />)
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password")
    expect(screen.getByLabelText("Repeat it")).toHaveAttribute("autocomplete", "new-password")
  })
})

describe("ForgotPasswordForm", () => {
  it("asks for an email", () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email")
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument()
  })
})
