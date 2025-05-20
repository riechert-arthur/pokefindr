import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDB } from '@/lib/supabase/db'

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await context.params

  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    )
  }

  const { error } = await adminDB
    .from('location_ratings')
    .delete()
    .eq('id', reviewId)
    .eq('user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await context.params

  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    )
  }

  const body = await req.json()
  const { text, rating } = body as {
    text?: string
    rating?: number
  }
  if (typeof text !== 'string' || typeof rating !== 'number') {
    return NextResponse.json(
      { error: 'Request must include comment (string) and rating (number)' },
      { status: 400 }
    )
  }

  const { data, error } = await adminDB
    .from('location_ratings')
    .update({ text, rating })
    .eq('id', reviewId)
    .eq('user_id', userId)
    .select()       
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, review: data })
}
