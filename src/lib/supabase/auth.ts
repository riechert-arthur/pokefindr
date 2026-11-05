import "server-only"
import { registrationSchema } from "@/lib/schemas"
import { createEphemeralAuthClient } from "./db"
import { getServerConfig } from "@/server/config"
import { z } from "zod"

export type User = {
  id: string
  email: string
  user_metadata: Record<string, unknown>
}

export async function signUpNewUser(values: z.infer<typeof registrationSchema>) {
  // Sign-up returns a session when email confirmation is off, so it needs a
  // throwaway client too.
  return await createEphemeralAuthClient().auth.signUp({
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
