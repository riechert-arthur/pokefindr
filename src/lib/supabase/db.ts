import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/supabase"
import { getServerConfig } from "@/server/config"

// These clients only run on the server. `persistSession: false` only turns off
// storage: a client still keeps a session in memory after any call that returns
// one (sign-in, sign-up, verifyOtp) and sends that token on later requests.
// So the shared clients below must never run those calls; use
// `createEphemeralAuthClient()` instead.
const serverAuthOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

let serviceClient: SupabaseClient<Database> | undefined

/** Service-role client. Bypasses RLS, so callers must do their own authorization. */
export function getAdminClient(): SupabaseClient<Database> {
  if (!serviceClient) {
    const config = getServerConfig()
    serviceClient = createClient<Database>(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      serverAuthOptions,
    )
  }
  return serviceClient
}

/**
 * A fresh anon-key client for one auth call (sign-in, sign-up, email
 * confirmation). It is thrown away after use, so the user's session never
 * sticks to a shared client.
 */
export function createEphemeralAuthClient(): SupabaseClient<Database> {
  const config = getServerConfig()
  return createClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serverAuthOptions,
  )
}
