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

  const { data, error } = await adminDB
    .from('location_ratings')
    .select(`
      id,
      rating,
      text,
      created_at,
      locations!inner (
        name,
        description 
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching reviews', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const reviews = (data || []).map((r) => ({
    id:       r.id,
    rating:   r.rating,
    comment:  r.text,
    created:  r.created_at,
    location: {
      name:    r.locations.name,
      description: r.locations.description,
    },
  }))

  return NextResponse.json({ reviews }, { status: 200 })
}

