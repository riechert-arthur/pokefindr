import { registrationSchema, loginSchema } from "@/lib/schemas" 
import { adminDB, db } from "./db" 
import { z } from "zod"

export type User = {
  id: string
  email: string
  user_metadata: Record<string, unknown>
}

export async function signUpNewUser(values: z.infer<typeof registrationSchema>) {
  return await db.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: "http://localhost:3000/login"
    }
  })
}

export async function signInWithEmail(values: z.infer<typeof loginSchema>) {
  return await db.auth.signInWithPassword({
    email: values.email,
    password: values.password,
  })
}

export async function verifyUserCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const { data, error } = await adminDB.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    console.error("[auth] login error: ", error?.message)
    return null
  }

  return data.user as User
}
