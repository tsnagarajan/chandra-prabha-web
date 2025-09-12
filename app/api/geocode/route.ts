// app/api/geocode/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA =
  'ChandraPrabha/1.0 (+https://github.com/tsnagarajan/chandra-prabha-web; contact: tsnagarajan@gmail.com)';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Accept BOTH ?place= and ?q= to match older/newer UIs
    const place = (searchParams.get('place') ?? searchParams.get('q') ?? '').trim();
    if (!place) {
      return NextResponse.json({ error: 'Missing place' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    // --- Primary: OpenStreetMap Nominatim ---
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', place);
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': UA,            // required by Nominatim
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      throw new Error(`Nominatim HTTP ${res.status}`);
    }

    const raw = (await res.json()) as any[];
    let results =
      Array.isArray(raw)
        ? raw.slice(0, 5).map((r) => ({
            // Always provide .label so the UI can show it
            label: r.display_name as string,
            // Also keep name for older code paths (harmless)
            name: r.display_name as string,
            lat: Number(r.lat),
            lon: Number(r.lon),
            class: r.class,
            type: r.type,
          }))
        : [];

    // If primary returned nothing, try a small fallback (maps.co)
    if (results.length === 0) {
      const fb = await fetch(
        `https://geocode.maps.co/search?q=${encodeURIComponent(place)}&format=json`,
        {
          headers: { 'User-Agent': UA, 'Accept': 'application/json' },
          cache: 'no-store',
        }
      );
      if (fb.ok) {
        const j = (await fb.json()) as any[];
        results =
          Array.isArray(j)
            ? j.slice(0, 5).map((r) => ({
                label: (r.display_name || r.name || `${r.lat}, ${r.lon}`) as string,
                name: (r.display_name || r.name || `${r.lat}, ${r.lon}`) as string,
                lat: Number(r.lat),
                lon: Number(r.lon),
                class: r.class,
                type: r.type,
              }))
            : [];
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Geocode timeout' : String(err?.message || err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


