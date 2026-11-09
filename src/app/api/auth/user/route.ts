import { NextResponse, type NextRequest } from "next/server"
import { getProfile } from "@/server/services/users"

/** The signed-in user's public profile (middleware sets x-user-id). */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const profile = await getProfile(userId)
  if (!profile) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  return NextResponse.json({ user: profile })
}
