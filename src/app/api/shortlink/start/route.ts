import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SHORTLINK_REWARD = '0.00005';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc('shortlink_claim_start', {
      p_address: address,
      p_now: now,
    });

    if (error) {
      console.error('[SHORTLINK] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as {
      success: boolean;
      token?: string;
      daily_claims?: number;
      daily_limit?: number;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      if (result.error === 'daily_limit') {
        return NextResponse.json({
          success: false,
          error: result.message || 'Daily limit reached',
          daily_claims: result.daily_claims,
          daily_limit: result.daily_limit,
        }, { status: 429 });
      }
      return NextResponse.json({ error: result.message || 'Failed to start shortlink' }, { status: 500 });
    }

    // Build the callback URL the shortlink service will redirect to
    const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:3000';
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
    const callbackUrl = `${baseUrl}/api/shortlink/callback?token=${result.token}`;

    // If a shortlink service API is configured, generate a real shortlink
    const shortlinkApiUrl = process.env.SHORTLINK_API_URL;
    const shortlinkApiKey = process.env.SHORTLINK_API_KEY;
    let redirectUrl = callbackUrl;

    if (shortlinkApiUrl && shortlinkApiKey) {
      try {
        const slForm = new URLSearchParams();
        slForm.append('api_key', shortlinkApiKey);
        slForm.append('url', callbackUrl);
        const slRes = await fetch(shortlinkApiUrl, {
          method: 'POST',
          body: slForm.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const slData: { shortLink?: string; status?: string } = await slRes.json();
        if (slData.shortLink) {
          redirectUrl = slData.shortLink;
        }
      } catch (e) {
        console.warn('[SHORTLINK] Failed to generate shortlink via API, using direct:', e);
      }
    }

    return NextResponse.json({
      success: true,
      token: result.token,
      redirectUrl,
      reward: SHORTLINK_REWARD,
      daily_claims: result.daily_claims,
      daily_limit: result.daily_limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[SHORTLINK] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
