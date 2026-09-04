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
      // Fallback: read the tables directly so a stale/missing RPC never
      // blanks out the ad list ("0 ads available today").
      const { data: rows, error: adsError } = await supabase
        .from('ptc_ads')
        .select('id, title, reward, duration_seconds, created_at, max_total_views, total_views')
        .eq('active', true);

      if (adsError) {
        console.error('[PTC_ADS] Fallback query error:', adsError.message);
        return NextResponse.json({ ads: [] });
      }

      // UTC day boundary must match ptc_list_ads / the daily unique index
      const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
      const { data: views, error: viewsError } = await supabase
        .from('ptc_views')
        .select('ad_id')
        .eq('faucetpay_address', address)
        .eq('status', 'completed')
        .gte('started_at', dayStart);

      if (viewsError) {
        console.error('[PTC_ADS] Fallback views query error:', viewsError.message);
      }
      const viewedToday = new Set((views ?? []).map((v: { ad_id: string }) => v.ad_id));

      const ads = (rows ?? [])
        .filter(
          (r: { max_total_views: number | null; total_views: number | null }) =>
            r.max_total_views == null ||
            (r.total_views ?? 0) < r.max_total_views,
        )
        .map((r: Record<string, unknown>) => ({
          ...r,
          viewed_today: viewedToday.has(r.id as string),
        }));

      return NextResponse.json({ ads });
    }

    // The RPC returns a jsonb array of ad rows (id/title/reward/duration/viewed_today)
    const ads = Array.isArray(data) ? data : [];
    return NextResponse.json({ ads });
  } catch (err) {
    console.error('[PTC_ADS] Unhandled error:', err);
    return NextResponse.json({ ads: [] });
  }
}
