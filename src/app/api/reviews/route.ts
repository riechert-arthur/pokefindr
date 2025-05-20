import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDB } from '@/lib/supabase/db'

const MAX_DISTANCE_METERS = 50      

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    )
  }
  const { lat, lng, rating, text } = await req.json()

  console.log("long: ", lng, " lat: ", lat)

  if (lat === undefined || lng === undefined)
    return NextResponse.json(
      { error: '(lat & lng) required' },
      { status: 400 },
    )
  if (typeof rating !== 'number' || rating < 1 || rating > 5 || !text)
    return NextResponse.json(
      { error: 'Missing or invalid rating / text' },
      { status: 400 },
    )

  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (Number.isNaN(latNum) || Number.isNaN(lngNum))
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })

  const { error: rpcErr } = await adminDB.rpc('add_review_for_location', {
    lat_input:     latNum,
    lng_input:     lngNum,
    user_id:       userId,
    rating_val:    rating,
    comment_text:  text,
    max_meters:    MAX_DISTANCE_METERS,
  })

  if (rpcErr)
    return NextResponse.json(
      { error: rpcErr.message },
      { status: 500 },
    )

  return NextResponse.json({ success: true }, { status: 200 })
}

