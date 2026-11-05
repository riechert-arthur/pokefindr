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
