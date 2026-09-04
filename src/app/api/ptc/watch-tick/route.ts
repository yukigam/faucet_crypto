import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function getIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

export async function POST(request: Request) {
  const ip = getIP(request);

  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string' || token.length > 100) {
      return NextResponse.json({ success: false, error: 'invalid_token' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data: rateData, error: rateError } = await supabase.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_now: new Date().toISOString(),
      p_max_attempts: 60,
      p_window_seconds: 60,
    });

    const rateResult = rateData as { allowed: boolean; retry_after?: number } | undefined;

    if (rateError || !rateResult?.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: rateResult?.retry_after || 60,
      }, { status: 429 });
    }

    const { data, error } = await supabase.rpc('ptc_watch_tick', {
      p_token: token,
      p_now: new Date().toISOString(),
    });

    if (error) {
      console.error('[PTC_WATCH_TICK] RPC error:', error.message);
      return NextResponse.json({ error: 'Failed to record watch time' }, { status: 500 });
    }

    const result = data as {
      success: boolean;
      active_seconds?: number;
      remaining?: number;
      duration_seconds?: number;
      error?: string;
    };

    if (!result.success) {
      const messages: Record<string, string> = {
        invalid_token: 'Invalid ad view session.',
        already_claimed: 'Reward already credited for this session.',
        session_expired: 'View session expired — start the ad again.',
      };
      return NextResponse.json({
        success: false,
        error: messages[result.error ?? ''] || 'Failed to record watch time',
        code: result.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      active_seconds: result.active_seconds,
      remaining: result.remaining,
      duration_seconds: result.duration_seconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PTC_WATCH_TICK] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
