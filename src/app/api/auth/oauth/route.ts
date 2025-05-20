import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDB } from '@/lib/supabase/db';

export async function POST(req: NextRequest) {
  const { provider } = await req.json();

  if (!provider) {
    return NextResponse.json(
      { error: "Provider is required." },
      { status: 400 }
    );
  }

  const { data, error } = await adminDB.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.APP_URL}/login/callback`,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: data.url });
}
