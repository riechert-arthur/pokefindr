import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { registrationSchema } from '@/lib/schemas'
import { signUpNewUser } from '@/lib/supabase/auth'
import { adminDB } from '@/lib/supabase/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    )
  }
  const values = parsed.data

  const { data, error: upError } = await signUpNewUser(values)
  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 400 })
  }

  if (!data.user) {
    return NextResponse.json({ error: "No user id" }, { status: 404 })
  }

  const { error } = await adminDB
    .from("profiles")
    .update({
      username: values.username,
      full_name: values.name,
    })
    .eq("id", data.user.id)

  if (error) {
    console.error("Profile update failed:", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  const { error: subError } = await adminDB
    .from('subscriptions')
    .select('plan_name')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (subError) {
    console.error("Subscription lookup failed:", subError)
    return NextResponse.json(
      { error: subError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ status: 200 })
}

