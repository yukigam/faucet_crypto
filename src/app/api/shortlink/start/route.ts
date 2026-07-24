import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SHRINKME_API = 'https://shrinkme.io/api';
const SHORTLINK_REWARD = '0.0005';

function extractShortUrl(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return (
      (obj.shortenedUrl as string) ??
      (obj.shortLink as string) ??
      (obj.short_url as string) ??
      (obj.url as string) ??
      (obj.link as string) ??
      null
    );
  }
  return null;
}

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

    // Call ShrinkMe.io API to create a shortlink pointing to our callback
    const apiUrl = `${SHRINKME_API}?api=${shrinkmeKey}&url=${encodeURIComponent(callbackUrl)}`;
    console.log('[SHORTLINK] Calling ShrinkMe API', { apiUrl: apiUrl.replace(shrinkmeKey, '***') });

    const shrinkmeRes = await fetch(apiUrl);
    const httpStatus = shrinkmeRes.status;
    const contentType = shrinkmeRes.headers.get('content-type') || '';
    const rawText = await shrinkmeRes.text();

    console.log('[SHORTLINK] ShrinkMe raw response:', {
      httpStatus,
      contentType,
      body: rawText.slice(0, 2000),
    });

    // Try parsing as JSON first
    let parsed: unknown;
    let isJson = false;
    try {
      parsed = JSON.parse(rawText);
      isJson = true;
      console.log('[SHORTLINK] ShrinkMe parsed JSON:', JSON.stringify(parsed));
    } catch {
      // Not JSON — treat raw text as the response
      parsed = rawText;
      console.log('[SHORTLINK] ShrinkMe response is not JSON, using raw text');
    }

    // Extract short URL from whatever format we got
    const shortUrl = extractShortUrl(parsed);

    if (!shortUrl) {
      const errorDetail = isJson
        ? JSON.stringify(parsed)
        : rawText.slice(0, 500);

      console.error('[SHORTLINK] Failed to extract short URL from response:', {
        httpStatus,
        contentType,
        body: rawText.slice(0, 2000),
      });

      return NextResponse.json({
        success: false,
        error: `ShrinkMe API error (HTTP ${httpStatus}): ${errorDetail}`,
        shrinkme_raw: rawText.slice(0, 1000),
        shrinkme_http_status: httpStatus,
      }, { status: 502 });
    }

    console.log('[SHORTLINK] Short URL generated:', shortUrl);

    return NextResponse.json({
      success: true,
      token: result.token,
      redirectUrl: shortUrl,
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
