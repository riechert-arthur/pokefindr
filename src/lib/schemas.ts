import { z } from "zod"

export const loginSchema = z.object({
  email: z
    .string()
    .nonempty({ message: "Please enter an email" })
    .email({ message: "Please enter a valid email" }),
  password: z.string().nonempty({ message: "Please enter a password" }),
})

/** A username: what other people see on reviews. Unique ignoring case. */
export const usernameField = z
  .string()
  .trim()
  .min(3, { message: "Use at least 3 characters." })
  .max(30, { message: "Use at most 30 characters." })
  .regex(/^[A-Za-z0-9_.-]+$/, { message: "Use letters, digits, dots, dashes and underscores." })

/** A new password: long, with at least one character that isn't a letter or digit. */
const newPassword = z
  .string()
  .nonempty({ message: "Please enter a password" })
  .min(16, { message: "Please enter a longer password" })
  .max(128, { message: "Please enter a shorter password" })
  .regex(/[^A-Za-z0-9]/, {
    message: "Please include one non-letter, non-digit character",
  })

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .nonempty({ message: "Please enter an email" })
    .email({ message: "Please enter a valid email" }),
})

export const resetPasswordSchema = z
  .object({ password: newPassword, passwordVerification: z.string() })
  .refine((data) => data.password === data.passwordVerification, {
    message: "Passwords do not match",
    path: ["passwordVerification"],
  })

export const registrationSchema = z
  .object({
    name: z
      .string()
      .nonempty({ message: "Please enter a name." })
      .regex(/^[\p{L} ]+$/u, { message: "Only letters are allowed." }),
    username: usernameField,
    email: z
      .string()
      .nonempty({ message: "Please enter an email" })
      .email({ message: "Please enter a valid email" }),
    password: newPassword,
    passwordVerification: z.string(),
  })
  .refine((data) => data.password === data.passwordVerification, {
    message: "Passwords do not match",
    path: ["passwordVerification"],
  })

export const callbackSchema = z.object({ username: usernameField })
