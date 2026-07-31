import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ verified: false });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ verified: false });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data } = await supabase.rpc('check_ad_verified', {
      p_address: address,
      p_now: new Date().toISOString(),
    });

    return NextResponse.json({ verified: data === true });
  } catch (err) {
    console.error('[AD_STATUS] Error:', err);
    return NextResponse.json({ verified: false });
  }
}
