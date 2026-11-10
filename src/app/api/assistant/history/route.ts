import { NextResponse, type NextRequest } from "next/server"
import { deleteHistory } from "@/server/assistant/log"
import { apiError } from "@/server/api-error"
import { log } from "@/server/log"

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
    log.forRequest(request, "/api/assistant/history").logError("db.write_failed", err, { write: "assistant_history_delete", step: "couldn't delete" })
    return apiError("serverError", "Server error", 500)
  }
}
