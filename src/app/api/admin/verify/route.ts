import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password required' }, { status: 400 });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('[ADMIN_VERIFY] ADMIN_PASSWORD env var not set');
      return NextResponse.json({ success: false, error: 'Admin not configured' }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[ADMIN_VERIFY] Error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
