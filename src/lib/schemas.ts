import { z } from "zod/v3"
import type { Messages } from "@/i18n/messages"

/** A key in the catalog's `auth.validation` (messages/en.yml). */
export type ValidationKey = keyof Messages["auth"]["validation"]

/** Turns a validation message's key into its text, in some language. */
export type ValidationMessages = (key: ValidationKey) => string

/**
 * The auth forms' schemas, with their messages in the language `m` gives.
 * The forms use useAuthSchemas() (the page's language); the API routes use
 * English ones in src/server/auth/schemas.ts.
 */
export function authSchemas(m: ValidationMessages) {
  const email = z
    .string()
    .nonempty({ message: m("emailRequired") })
    .email({ message: m("emailInvalid") })

  /** A username: what other people see on reviews. Unique ignoring case. */
  const usernameField = z
    .string()
    .trim()
    .min(3, { message: m("usernameTooShort") })
    .max(30, { message: m("usernameTooLong") })
    .regex(/^[A-Za-z0-9_.-]+$/, { message: m("usernameCharacters") })

  /** A new password: long, with at least one character that isn't a letter or digit. */
  const newPassword = z
    .string()
    .nonempty({ message: m("passwordRequired") })
    .min(16, { message: m("passwordTooShort") })
    .max(128, { message: m("passwordTooLong") })
    .regex(/[^A-Za-z0-9]/, { message: m("passwordSymbol") })

  const passwordsMatch = { message: m("passwordMismatch"), path: ["passwordVerification"] }

  return {
    usernameField,
    loginSchema: z.object({
      email,
      password: z.string().nonempty({ message: m("passwordRequired") }),
    }),
    forgotPasswordSchema: z.object({ email }),
    resetPasswordSchema: z
      .object({ password: newPassword, passwordVerification: z.string() })
      .refine((data) => data.password === data.passwordVerification, passwordsMatch),
    registrationSchema: z
      .object({
        name: z
          .string()
          .nonempty({ message: m("nameRequired") })
          .regex(/^[\p{L} ]+$/u, { message: m("nameLetters") }),
        username: usernameField,
        email,
        password: newPassword,
        passwordVerification: z.string(),
      })
      .refine((data) => data.password === data.passwordVerification, passwordsMatch),
    callbackSchema: z.object({ username: usernameField }),
  }
}

export type AuthSchemas = ReturnType<typeof authSchemas>
