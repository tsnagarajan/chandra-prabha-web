import 'server-only';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q || !q.trim()) {
      return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'chandra-prabha-web/1.0',
        'Accept-Language': 'en'
      },
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ error: `Geocode fetch failed (${res.status})` }, { status: 502 });
    }

    const data = await res.json() as Array<any>;
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = data.slice(0, 5).map((r) => ({
      name: r.display_name,
      lat: Number(r.lat),
      lon: Number(r.lon),
      class: r.class,
      type: r.type
    }));

    return NextResponse.json({ top: results[0], results });
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Geocode timeout' : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

