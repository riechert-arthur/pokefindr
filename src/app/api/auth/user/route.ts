
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDB } from '@/lib/supabase/db'

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    )
  }

  const { data: profile, error } = await adminDB
    .from('profiles')
    .select('id, username, full_name, metadata')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 },
    )
  }

  return NextResponse.json({ user: profile })
}

