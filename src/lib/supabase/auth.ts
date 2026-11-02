import "server-only"
import { registrationSchema } from "@/lib/schemas"
import { createEphemeralAuthClient, getAnonClient } from "./db"
import { getServerConfig } from "@/server/config"
import { z } from "zod"

export type User = {
  id: string
  email: string
  user_metadata: Record<string, unknown>
}

export async function signUpNewUser(values: z.infer<typeof registrationSchema>) {
  return await getAnonClient().auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: new URL("/login", getServerConfig().APP_URL).toString(),
    },
  })
}

export async function verifyUserCredentials(
  email: string,
  password: string
): Promise<User | null> {
  // Use a throwaway client: signing in on a shared client would attach this
  // user's session to every later request that uses it.
  const { data, error } = await createEphemeralAuthClient().auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    console.error("[auth] login error: ", error?.message)
    return null
  }

  return data.user as User
}

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number]

export const isEmailOtpType = (value: string | null): value is EmailOtpType =>
  value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value)

/** Confirms the token from a sign-up / email-change link. */
export async function verifyEmailOtp(tokenHash: string, type: EmailOtpType) {
  const { error } = await getAnonClient().auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) throw new Error(error.message)
}
