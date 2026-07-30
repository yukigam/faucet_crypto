import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data: recentLogs, error: logsError } = await supabase
      .from('claim_log')
      .select('faucetpay_address, ip_address, turnstile_passed, success, error_type, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (logsError) {
      console.error('[ADMIN] Error fetching logs:', logsError);
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    const { count: totalCount } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true });

    const { count: successCount } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true })
      .eq('success', true);

    const { count: blockedCount } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true })
      .eq('success', false);

    const { count: captchaFailCount } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true })
      .eq('turnstile_passed', false);

    const { count: ipRateCount } = await supabase
      .from('claim_log')
      .select('*', { count: 'exact', head: true })
      .eq('error_type', 'ip_rate_limit');

    // Get unique IPs count
    const { data: uniqueIps } = await supabase
      .from('claim_log')
      .select('ip_address');

    const uniqueIpSet = new Set((uniqueIps || []).map((r: { ip_address: string }) => r.ip_address));

    // Get unique addresses count
    const { data: uniqueAddrs } = await supabase
      .from('claim_log')
      .select('faucetpay_address');

    const uniqueAddrSet = new Set((uniqueAddrs || []).map((r: { faucetpay_address: string }) => r.faucetpay_address));

    return NextResponse.json({
      total_claims: totalCount ?? 0,
      successful_claims: successCount ?? 0,
      blocked_attempts: blockedCount ?? 0,
      unique_ips: uniqueIpSet.size,
      unique_addresses: uniqueAddrSet.size,
      captcha_failures: captchaFailCount ?? 0,
      ip_rate_blocks: ipRateCount ?? 0,
      recent_logs: recentLogs || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[ADMIN] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
