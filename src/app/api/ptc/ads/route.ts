import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address || typeof address !== 'string' || address.length > 200) {
      return NextResponse.json({ ads: [] });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ ads: [] });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data, error } = await supabase.rpc('ptc_list_ads', {
      p_address: address,
    });

    if (error) {
      console.error('[PTC_ADS] RPC error:', error.message);
      return NextResponse.json({ ads: [] });
    }

    // The RPC returns a jsonb array of ad rows (id/title/reward/duration/viewed_today)
    const ads = Array.isArray(data) ? data : [];
    return NextResponse.json({ ads });
  } catch (err) {
    console.error('[PTC_ADS] Unhandled error:', err);
    return NextResponse.json({ ads: [] });
  }
}
