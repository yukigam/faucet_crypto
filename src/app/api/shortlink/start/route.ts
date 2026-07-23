import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SHRINKME_API = 'https://shrinkme.io/api';
const SHORTLINK_REWARD = '0.00005';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const shrinkmeKey = process.env.SHRINKME_API_KEY;
    if (!shrinkmeKey) {
      console.error('[SHORTLINK] SHRINKME_API_KEY not configured');
      return NextResponse.json({
        success: false,
        error: 'ShrinkMe API key not configured. Add SHRINKME_API_KEY to your env variables.',
      }, { status: 500 });
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

    // Build the callback URL ShrinkMe will redirect to after the ad
    const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:3000';
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
    const callbackUrl = `${baseUrl}/api/shortlink/callback?token=${result.token}`;

    // Call ShrinkMe.io API to create a shortlink that points to our callback
    console.log('[SHORTLINK] Calling ShrinkMe API', { callbackUrl });
    const shrinkmeRes = await fetch(`${SHRINKME_API}?api=${shrinkmeKey}&url=${encodeURIComponent(callbackUrl)}`);
    const shrinkmeData: { status?: string; shortenedUrl?: string; error?: string } = await shrinkmeRes.json();

    console.log('[SHORTLINK] ShrinkMe response:', JSON.stringify(shrinkmeData));

    if (!shrinkmeData.shortenedUrl) {
      console.error('[SHORTLINK] ShrinkMe API error:', shrinkmeData.error || 'No shortenedUrl returned', shrinkmeData);
      return NextResponse.json({
        success: false,
        error: `ShrinkMe API error: ${shrinkmeData.error || 'Failed to generate shortlink'}`,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      token: result.token,
      redirectUrl: shrinkmeData.shortenedUrl,
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
