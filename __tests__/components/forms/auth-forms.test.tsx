import { describe, expect, it, vi } from "vitest"
import { fireEvent, message, render, screen } from "../../helpers/intl"
import { authSchemas } from "@/lib/schemas"
import { registrationSchema } from "@/server/auth/schemas"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

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

describe("OAuth buttons", () => {
  it("show the configured providers only", () => {
    render(<LoginForm providers={["google", "discord"]} />)
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Continue with Discord/ })).toBeInTheDocument()
  })

  it("and nothing, not even the divider, without any", () => {
    render(<LoginForm />)
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull()
    expect(screen.queryByText("Or continue with email")).toBeNull()
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

describe("RegistrationForm", () => {
  it("labels every field", async () => {
    const { RegistrationForm } = await import("@/components/forms/SignupForm")
    render(<RegistrationForm />)
    for (const label of ["Name", "Username", "Email", "Password", "Verify Password"]) expect(screen.getByLabelText(label)).toBeInTheDocument()
  })
})

describe("In Spanish", () => {
  const es = message("es")

  it("the login form shows its copy and links in Spanish", () => {
    render(<LoginForm notice="verified" providers={["google"]} />, { locale: "es" })
    expect(screen.getByText(es("auth.login.title"))).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(es("auth.login.notices.verified"))
    expect(screen.getByRole("button", { name: es("auth.oauth.continueWith", { provider: "Google" }) })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: es("auth.login.forgot") })).toHaveAttribute("href", "/es/forgot-password")
    expect(screen.getByRole("link", { name: "Regístrate" })).toHaveAttribute("href", "/es/signup")
    expect(screen.getByRole("link", { name: "Términos del servicio" })).toHaveAttribute("href", "/es/terms-of-service")
  })

  it("the form's validation messages come out in Spanish", async () => {
    render(<ForgotPasswordForm />, { locale: "es" })
    fireEvent.click(screen.getByRole("button", { name: es("auth.forgotPassword.submit") }))
    expect(await screen.findByText(es("auth.validation.emailRequired"))).toBeInTheDocument()
  })
})

describe("authSchemas", () => {
  it("writes its messages in the language it's given, with the same rules", () => {
    const { registrationSchema } = authSchemas((key) => message("es")(`auth.validation.${key}`))
    const result = registrationSchema.safeParse({ name: "Ana1", username: "a", email: "x", password: "short", passwordVerification: "other" })
    expect(result.success).toBe(false)
    const errors = result.success ? [] : result.error.errors.map((e) => e.message)
    expect(errors).toEqual(expect.arrayContaining(["Solo se permiten letras.", "Usa al menos 3 caracteres.", "Ingresa un correo válido", "Ingresa una contraseña más larga"]))
  })

  it("stays in English for the API routes", () => {
    const result = registrationSchema.safeParse({ name: "Ana", username: "ana", email: "a@b.co", password: "a-long-enough-password!", passwordVerification: "different" })
    expect(result.success ? [] : result.error.errors.map((e) => e.message)).toEqual(["Passwords do not match"])
  })
})
