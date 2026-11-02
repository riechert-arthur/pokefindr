import { type NextRequest } from "next/server"
import { redirect } from "next/navigation"
import { isEmailOtpType, verifyEmailOtp } from "@/lib/supabase/auth"
import { safeNextPath } from "@/lib/redirects"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")

  if (tokenHash && isEmailOtpType(type)) {
    await verifyEmailOtp(tokenHash, type)
  }

  redirect(safeNextPath(searchParams.get("next")))
}
