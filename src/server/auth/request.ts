import "server-only"
import type { NextRequest } from "next/server"

/**
 * The signed-in user's id, as verified by middleware.ts.
 *
 * Only trustworthy on routes covered by the middleware matcher. The
 * middleware replaces any client-sent x-user-id header on every request it
 * handles.
 */
export function getSessionUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id")
}
