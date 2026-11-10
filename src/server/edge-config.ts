/**
 * The few server values middleware needs. Middleware runs on the Edge runtime,
 * so it can't use `getServerConfig()` (which imports `server-only` and parses
 * the whole server schema). Each variable is read by name so it is available
 * on Edge.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("Invalid server configuration: JWT_SECRET is not set")
  }
  return secret
}

/**
 * Whether this is a production build running on Vercel (it sets VERCEL=1;
 * `vercel env pull` copies that into .env.local, so dev checks NODE_ENV too).
 * Read on its own so routes that need nothing else from the config don't
 * fail on an unrelated variable.
 */
export const onVercelProduction = (): boolean => Boolean(process.env.VERCEL) && process.env.NODE_ENV === "production"
