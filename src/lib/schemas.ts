import { z } from "zod"

export const loginSchema = z.object({
  email: z
    .string()
    .nonempty({ message: "Please enter an email" })
    .email({ message: "Please enter a valid email" }),
  password: z.string().nonempty({ message: "Please enter a password" }),
})

export const registrationSchema = z
  .object({
    name: z
      .string()
      .nonempty({ message: "Please enter a name." })
      .regex(/^[\p{L} ]+$/u, { message: "Only letters are allowed." }),
    username: z
      .string()
      .nonempty({ message: "Please enter a username." }),
    email: z
      .string()
      .nonempty({ message: "Please enter an email" })
      .email({ message: "Please enter a valid email" }),
    password: z
      .string()
      .nonempty({ message: "Please enter a password" })
      .min(16, { message: "Please enter a longer password" })
      .regex(/[^A-Za-z0-9]/, {
        message: "Please include one non-letter, non-digit character",
      }),
    passwordVerification: z.string(),
  })
  .refine((data) => data.password === data.passwordVerification, {
    message: "Passwords do not match",
    path: ["passwordVerification"],
  })
