import { type EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest } from "next/server"
import { redirect } from "next/navigation"
import { db } from "@/lib/supabase/db"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/"

  if (tokenHash && type) {
    const { error } = await db.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (error) {
      throw new Error(error.message) 
    }
  }

  redirect(next)
}
