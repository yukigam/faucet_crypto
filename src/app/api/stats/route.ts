import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// Public, aggregate-only platform stats for the landing page.
// No user-identifiable data is returned — just counts.
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { count: totalClaims } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true })
      .eq('success', true);

    const { data: addresses } = await supabase
      .from('claim_log')
      .select('faucetpay_address')
      .eq('success', true)
      .limit(10000);

    const { count: activeAds } = await supabase
      .from('ptc_ads')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const uniqueUsers = new Set((addresses || []).map((r: { faucetpay_address: string }) => r.faucetpay_address));

    return NextResponse.json({
      total_payouts: totalClaims ?? 0,
      total_users: uniqueUsers.size,
      active_offers: activeAds ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[STATS] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
