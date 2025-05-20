import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDB } from '@/lib/supabase/db'

const MAX_DISTANCE_METERS = 50      

export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const latParam = url.searchParams.get('lat')
  const lngParam = url.searchParams.get('lng')

  if (!latParam || !lngParam)
    return NextResponse.json(
      { error: '(lat & lng) query params are required' },
      { status: 400 },
    )

  const lat = Number(latParam)
  const lng = Number(lngParam)
  if (Number.isNaN(lat) || Number.isNaN(lng))
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })

  const { data: loc, error: locErr } = await adminDB
    .rpc('get_location_by_point', {
      lat_input:  lat,
      lng_input:  lng,
      max_meters: MAX_DISTANCE_METERS,
    })
    .maybeSingle()

  console.log("retrieved point: ", loc)

  if (locErr)
    return NextResponse.json(
      { error: locErr.message },
      { status: 500 },
    )
  if (!loc)
    return NextResponse.json(
      { reviews: [] },     
      { status: 200 },
    )

  const { data: ratings, error: ratingsErr } = await adminDB
    .from('location_ratings')
    .select('rating, text, user_id')
    .eq('location_id', loc.id)

  if (ratingsErr)
    return NextResponse.json(
      { error: ratingsErr.message },
      { status: 500 },
    )

  const userIds = [...new Set(ratings.map(r => r.user_id!))]
  const { data: profiles, error: profilesErr } = await adminDB
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  if (profilesErr)
    return NextResponse.json(
      { error: profilesErr.message },
      { status: 500 },
    )

  const reviews = ratings.map(r => ({
    rating:   r.rating,
    text:     r.text ?? '',
    username: profiles.find(p => p.id === r.user_id)?.username ?? 'Unknown',
  }))

  return NextResponse.json({ reviews }, { status: 200 })
}
