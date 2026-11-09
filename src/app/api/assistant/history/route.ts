import { NextResponse, type NextRequest } from "next/server"
import { deleteHistory } from "@/server/assistant/log"
import { apiError } from "@/server/api-error"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/assistant/history
 *   Deletes the text of the signed-in user's assistant conversations
 *   (otherwise kept 30 days). `{ deleted }` is how many turns lost their text.
 */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  try {
    return NextResponse.json({ deleted: await deleteHistory(userId) })
  } catch (err) {
    console.error("[api/assistant/history] couldn't delete", err)
    return apiError("serverError", "Server error", 500)
  }
}
