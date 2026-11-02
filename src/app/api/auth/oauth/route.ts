import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/db';
import { getServerConfig } from '@/server/config';

export async function POST(req: NextRequest) {
  const { provider } = await req.json();

  if (!provider) {
    return NextResponse.json(
      { error: "Provider is required." },
      { status: 400 }
    );
  }

  const { data, error } = await getAdminClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: new URL('/login/callback', getServerConfig().APP_URL).toString(),
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
