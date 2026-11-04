import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUserId } from '@/server/auth/request'
import { getProfile } from '@/server/services/users'

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const profile = await getProfile(userId)
  if (!profile) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  return NextResponse.json({ user: profile })
}
