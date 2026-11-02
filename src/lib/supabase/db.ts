import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/supabase"
import { getServerConfig } from "@/server/config"

// These clients only run on the server. Sessions are never stored on them:
// a shared, module-level client that signs a user in would send that user's
// token on every later request handled by the same server instance.
const serverAuthOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

let anonClient: SupabaseClient<Database> | undefined
let serviceClient: SupabaseClient<Database> | undefined

/** Anon-key client for public auth flows (sign-up, email confirmation). */
export function getAnonClient(): SupabaseClient<Database> {
  if (!anonClient) {
    const config = getServerConfig()
    anonClient = createClient<Database>(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serverAuthOptions,
    )
  }
  return anonClient
}

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
 * A fresh client for a single password check. It is thrown away after use, so
 * the user's session never sticks to a shared client.
 */
export function createEphemeralAuthClient(): SupabaseClient<Database> {
  const config = getServerConfig()
  return createClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serverAuthOptions,
  )
}
