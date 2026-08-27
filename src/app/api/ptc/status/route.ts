import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || typeof token !== 'string' || token.length > 100) {
      return NextResponse.json({ success: false, error: 'invalid_token' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ success: false, error: 'db_not_configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data, error } = await supabase.rpc('ptc_status', { p_token: token });

    if (error) {
      console.error('[PTC_STATUS] RPC error:', error.message);
      return NextResponse.json({ success: false, error: 'rpc_error' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[PTC_STATUS] Unhandled error:', err);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
