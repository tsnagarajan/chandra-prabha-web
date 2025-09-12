
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import SouthIndianChart from '@/components/SouthIndianChart';
// ---- Panchanga + LST helpers (no external imports) ----
const TITHI_NAMES = [
  'Pratipat','Dvitīyā','Tṛtīyā','Caturthī','Pañcamī','Ṣaṣṭhī','Saptamī','Aṣṭamī','Navamī','Daśamī',
  'Ekādaśī','Dvādaśī','Trayodaśī','Caturdaśī','Pūrṇimā','Pratipat (Kṛṣṇa)','Dvitīyā','Tṛtīyā',
  'Caturthī','Pañcamī','Ṣaṣṭhī','Saptamī','Aṣṭamī','Navamī','Daśamī','Ekādaśī','Dvādaśī','Trayodaśī','Caturdaśī','Amāvasyā'
];
const NAK_NAMES = [
  'Aśvinī','Bharanī','Kṛttikā','Rohiṇī','Mṛgaśīrṣa','Ārdrā','Punarvasu','Puṣya','Āśleṣā',
  'Maghā','Pūrvaphalgunī','Uttaraphalgunī','Hasta','Citrā','Svātī','Viśākhā','Anurādhā','Jyeṣṭhā',
  'Mūla','Pūrvāṣāḍhā','Uttarāṣāḍhā','Śravaṇa','Dhaniṣṭhā','Śatabhiṣā','Pūrvabhādrapadā','Uttarabhādrapadā','Revatī'
];
const YOGA_NAMES = [
  'Viṣkambha','Prīti','Āyuṣmān','Saubhāgya','Śobhana','Atigaṇḍa','Sukarma','Dhṛti','Śūla','Gaṇḍa',
  'Vṛddhi','Dhruva','Vyāghāta','Harṣaṇa','Vajra','Siddhi','Vyatīpāta','Varīyān','Parigha','Śiva',
  'Siddha','Sādhya','Śubha','Śukla','Brahmā','Indra','Vaidhṛti'
];
const KARANA_CYCLE = ['Bava','Bālava','Kaulava','Taitila','Garaja','Vāṇija','Viṣṭi']; // Viṣṭi = Bhadra

function norm360(x: number): number {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}


// Get timezone offset minutes for a given timezone at a naive UTC date
function tzOffsetMinutes(tz: string, y:number,m:number,d:number,H:number,Min:number,S:number){
  const dtf = new Intl.DateTimeFormat('en-US',{
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  const parts = dtf.formatToParts(new Date(Date.UTC(y,m-1,d,H,Min,S)));
  const map:any = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const asUTC = Date.UTC(+map.year, +map.month-1, +map.day, +map.hour, +map.minute, +map.second);
  const naive = Date.UTC(y, m-1, d, H, Min, S);
  return (naive - asUTC)/60000;
}

// Convert local Y-M-D + h:m:s in tz → a true UTC Date
function localToUTC(y:number,m:number,d:number,H:number,Min:number,S:number, tz:string){
  const offMin = tzOffsetMinutes(tz,y,m,d,H,Min,S);
  return new Date(Date.UTC(y,m-1,d,H,Min,S) - offMin*60000);
}

// Julian date + GMST + LST
function julianDate(dateUTC: Date){
  return dateUTC.getTime()/86400000 + 2440587.5;
}
function gmstHours(dateUTC: Date){
  const JD = julianDate(dateUTC);
  const d = JD - 2451545.0;
  let h = 18.697374558 + 24.06570982441908 * d;
  h = ((h % 24) + 24) % 24;
  return h;
}
function lstString(dateUTC: Date, lonDeg: number){
  const lstH = (gmstHours(dateUTC) + lonDeg/15 + 24) % 24;
  const H = Math.floor(lstH);
  const M = Math.floor((lstH - H)*60);
  const S = Math.round(((lstH - H)*60 - M)*60);
  const z = (n:number)=>String(n).padStart(2,'0');
  return `${z(H)}:${z(M)}:${z(S)}`;
}

function fmtLST(val: number): string {
  if (val == null || !isFinite(val)) return "—";
  // Accept hours or degrees. If it's degrees, convert to hours.
  let hours = Math.abs(val) > 24 ? (norm360(val) / 15) : val;

  // wrap to [0, 24)
  hours = ((hours % 24) + 24) % 24;

  const hh = Math.floor(hours);
  let mFloat = (hours - hh) * 60;
  let mm = Math.floor(mFloat);
  let ss = Math.round((mFloat - mm) * 60);

  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; hours = (hh + 1) % 24; }

  // uses your existing pad2(hh/mm/ss)
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}






// Compute Panchanga from Sun/Moon longitudes & birth moment/location
function computePanchanga(
  sunDeg?: number, moonDeg?: number,
  y?: number, m?: number, d?: number, HH24?: number, mm?: number, ss?: number,
  tz?: string, lon?: number
){
  const safe = (v:any)=> typeof v==='number' && Number.isFinite(v);
  const res = { vara:'—', tithi:'—', nak:'—', pada:'—', yoga:'—', karana:'—', lst:'—' };

  if (y && m && d && (tz||'') ) {
    // Vara (weekday) in given timezone
    const naiveLocal = new Date(Date.UTC(y, m-1, d, HH24||0, mm||0, ss||0));
    try {
      res.vara = new Intl.DateTimeFormat('en-US', { weekday:'long', timeZone: tz }).format(naiveLocal);
    } catch {}
    // LST (needs UTC & longitude)
    if (typeof lon === 'number') {
      const utc = localToUTC(y, m, d, HH24||0, mm||0, ss||0, tz!);
      res.lst = lstString(utc, lon);
    }
  }

  if (safe(sunDeg) && safe(moonDeg)) {
    const sun = norm360(sunDeg!);
    const moon = norm360(moonDeg!);
    const sep = norm360(moon - sun);                 // 0..360

    // Tithi (12° each)
    const tNum = Math.floor(sep / 12) + 1;          // 1..30
    res.tithi = TITHI_NAMES[(tNum-1+30)%30];

    // Nakṣatra + Pāda
    const part = 360/27;                             // 13°20′
    const nIdx = Math.floor(moon / part);            // 0..26
    res.nak = NAK_NAMES[nIdx];
    const pada = Math.floor((moon % part) / (part/4)) + 1;  // 1..4
    res.pada = String(pada);

    // Yoga: floor((Sun+Moon)/13°20′)+1
    const yIdx = Math.floor(norm360(sun + moon) / part);
    res.yoga = YOGA_NAMES[yIdx];

    // Karaṇa: each 6° (half-tithi), index 1..60
    const kIdx = Math.floor(sep / 6) + 1;
    if (kIdx === 1) res.karana = 'Kiṁstughna';
    else if (kIdx === 58) res.karana = 'Śakuni';
    else if (kIdx === 59) res.karana = 'Catuṣpāda';
    else if (kIdx === 60) res.karana = 'Nāga';
    else res.karana = KARANA_CYCLE[(kIdx - 2) % 7];
  }
  return res;
}







// ---- Auto-restore helpers ----
const STORAGE_KEY = 'cp-last-chart-v1';
function safeParse<T>(s: string | null): T | null {
  try { return s ? JSON.parse(s) as T : null; } catch { return null; }
}

/* =========================
   Minimal types used here
   ========================= */
type BodyName =
  | 'Ascendant' | 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars'
  | 'Jupiter' | 'Saturn' | 'Rahu' | 'Ketu';

type DegMap = Partial<Record<Exclude<BodyName,'Ascendant'>, number>>;

type VargaSigns = Partial<Record<
  'D1'|'D2'|'D3'|'D7'|'D9'|'D10'|'D12'|'D30',
  Partial<Record<BodyName, number>> // 0..11 as sign index
>>;

// ---- Aspects helpers (drop-in, no external imports) ----
type AspectName = 'Conjunction' | 'Opposition' | 'Trine' | 'Square' | 'Sextile';
interface AspectRow { a: BodyName; b: BodyName; type: AspectName; delta: number; }

const ASPECT_ANGLES: Record<AspectName, number> = {
  Conjunction: 0,
  Opposition: 180,
  Trine: 120,
  Square: 90,
  Sextile: 60,
};
const ASPECT_ORBS: Record<AspectName, number> = {
  Conjunction: 6,
  Opposition: 6,
  Trine: 5,
  Square: 5,
  Sextile: 4,
};



function classifyAspect(aDeg: number, bDeg: number): { type: AspectName; delta: number } | null {
  const sep = minSep(aDeg, bDeg);
  let best: { type: AspectName; delta: number } | null = null;
  (Object.keys(ASPECT_ANGLES) as AspectName[]).forEach(type => {
    const angle = ASPECT_ANGLES[type];
    const orb = ASPECT_ORBS[type];
    const dist = Math.abs(sep - angle);
    if (dist <= orb && (best == null || dist < best.delta)) best = { type, delta: dist };
  });
  return best;
}

function deriveAscAspects(out: any): AspectRow[] {
  const asc = typeof out?.ascendant === 'number' ? out.ascendant : null;
  const pos: DegMap | undefined = out?.positions;
  if (asc == null || !pos) return [];
  const bodies: BodyName[] = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'];
  const rows: AspectRow[] = [];
  for (const b of bodies) {
    const d = pos[b as Exclude<BodyName,'Ascendant'>];
    if (typeof d !== 'number') continue;
    const hit = classifyAspect(asc, d);
    if (hit) rows.push({ a: 'Ascendant', b, type: hit.type, delta: +hit.delta.toFixed(2) });
  }
  return rows;
}

function mergeAspects(a: any[], b: AspectRow[]): AspectRow[] {
  const into: AspectRow[] = [];
  const seen = new Set<string>();
  const pushUnique = (row: AspectRow) => {
    const key1 = `${row.type}|${row.a}|${row.b}`;
    const key2 = `${row.type}|${row.b}|${row.a}`;
    if (!seen.has(key1) && !seen.has(key2)) { seen.add(key1); into.push(row); }
  };

  // Normalize any precomputed aspects coming from API
  if (Array.isArray(a)) {
    for (const x of a) {
      const A = String(x?.a ?? x?.A ?? '').trim() as BodyName;
      const B = String(x?.b ?? x?.B ?? '').trim() as BodyName;
      const T = String(x?.type ?? x?.aspect ?? '').trim() as AspectName;
      const D = typeof x?.delta === 'number' ? x.delta : Number(x?.Δ ?? x?.deltaDeg ?? NaN);
      if (A && B && T && Number.isFinite(D)) {
        pushUnique({ a: A, b: B, type: T, delta: +(+D).toFixed(2) });
      }
    }
  }

  // Add Ascendant-derived aspects
  for (const r of b) pushUnique(r);

  // Sort: stronger first, then smallest |delta|
  const weight: Record<AspectName, number> = { Conjunction: 0, Opposition: 1, Trine: 2, Square: 3, Sextile: 4 };
  into.sort((u, v) =>
    weight[u.type] - weight[v.type] ||
    Math.abs(u.delta) - Math.abs(v.delta) ||
    u.a.localeCompare(v.a) || u.b.localeCompare(v.b)
  );
  return into;
}










type NakRow = { body: BodyName, sign: string, deg: number, nakshatra: string, pada: number, lord: string };
type DashaRow = { lord: string, startISO: string, endISO: string };
type AspectRow = { a: string, b: string, type: string, delta: number };

type ChartOut = {
  // core
  timezone: string;
  ascendant: number;             // D1 asc deg
  positions: DegMap;             // D1 planet degs
  d9Ascendant?: number;          // D9 asc
  d9Positions?: DegMap;          // D9 planets

  // tables
  nakTable: NakRow[];
  dasha: DashaRow[];
  aspects?: AspectRow[];
  vargaSigns?: VargaSigns;       // optional presence for extra vargas

  // panchanga-ish, optional
  sunriseISO?: string | null;
  sunsetISO?: string | null;

  // printing ID
  name?: string;
  place?: string;
  lat?: number;
  lon?: number;
};

/* =========================
   Helpers (local, no lib dependency)
   ========================= */
const SIGN_FULL = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];

const BODY_ORDER: BodyName[] = [
  'Ascendant','Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'
];

const TIMEZONES = [
  'UTC','Asia/Kolkata','America/Chicago','America/New_York','America/Los_Angeles',
  'Europe/London','Europe/Paris','Europe/Berlin','Asia/Dubai','Asia/Singapore','Australia/Sydney'
];

function pad2(n: number) { return String(n).padStart(2,'0'); }
function range(a: number, b: number) { const r:number[]=[]; for(let i=a;i<=b;i++) r.push(i); return r; }
function daysInMonth(y:number, m:number) { return new Date(y, m, 0).getDate(); }


function fmtSignDeg(deg:number) {
  const d = norm360(deg);
  const sign = Math.floor(d / 30);
  const within = d - sign*30;
  const dInt = Math.floor(within);
  const min = Math.round((within - dInt) * 60);
  return `${SIGN_FULL[sign]} ${dInt}°${pad2(min)}′`;
}

function fmtISO(iso?: string | null, tz?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const dfDate = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year:'numeric', month:'short', day:'2-digit' });
    const dfTime = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour:'2-digit', minute:'2-digit' });
    return `${dfDate.format(d)} ${dfTime.format(d)}`;
  } catch { return iso; }
}

function signNameFromDeg(deg?: number | null) {
  if (typeof deg !== 'number' || !isFinite(deg)) return '—';
  return SIGN_FULL[Math.floor(norm360(deg)/30)];
}

function normalizeTimezone(tz: string) {
  const trimmed = tz.trim();
  if (!trimmed) return { tz: '', corrected: '' };
  // pass through; simple sanity for common tokens
  const ok = TIMEZONES.includes(trimmed) || (trimmed.includes('/') && !trimmed.includes(' '));
  return { tz: ok ? trimmed : '', corrected: ok ? trimmed : '' };
}

function csvEscape(v: string) {
  return /[,"\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
}

/* =========================
   Component
   ========================= */
const PRINT_LOGO_EACH_PAGE = true;

export default function Page() {
  /* ---------- Global + print CSS injected once ---------- */
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      :root { --cp-font: 16px; --cell-size: 140px; }
      body { color:#111; }
      input, select, button { font-size: var(--cp-font) !important; padding: 10px 12px !important; }
      label > div:first-child { font-size: 14px !important; }
      .card { background:#fff; border-radius:16px; box-shadow:0 2px 8px rgba(0,0,0,.06); padding:16px; }
      .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      .print-only { display:none; }
      .page-section { margin-top:16px; }
      .section-title { font-size:20px; font-weight:900; margin: 6px 0 10px; }

      /* South-Indian chart visuals (screen) — planets emphasized, labels small */
      .si-cell { border:2.2px solid #111; border-radius:12px; background:#fff; overflow:hidden; }
      .si-label { font-size:11px; font-weight:800; opacity:.85; }
      .si-chip { font-size:16px; padding:4px 10px; border:2px solid #111; border-radius:10px; font-weight:800; background:#fff; }
      .si-chip-asc { background:#fff1f2; border-color:#b91c1c; color:#b91c1c; font-weight:900; }

      /* Stack charts (avoid side-by-side crowding) */
      .charts-stack > * + * { margin-top: 12px; }

      /* Export bar (screen only) */
      .export-bar {
        position: fixed; right: 16px; bottom: 16px;
        display: flex; gap: 8px; align-items: center;
        background: rgba(255,255,255,.95);
        border: 1px solid #ddd; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,.08);
        padding: 10px; z-index: 9999;
      }
      .export-bar button { border: 1px solid #ddd; background: #fff; padding: 8px 12px; border-radius: 8px; }

      @page { size: A4; margin: 12mm; }

      @media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden !important; }
  #print-root, #print-root * { visibility: visible !important; }
  #print-root { position: absolute; left: 0; top: 0; width: 100%; font-size: 15.5pt; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .export-bar { display: none !important; }

  /* Each big block starts on a new page; the first one doesn't. */
  .page-section { page-break-before: always; margin-top: 0 !important; }
  .page-section.first { page-break-before: avoid; }
  .page-section.no-break { page-break-before: avoid !important; }

  /* Slightly smaller chart cells so two charts can share a page stacked */
  :root { --cell-size: 106px; }

  /* Heavier borders for print, keeps chips inside the cell */
  .si-cell { border: 3px solid #000 !important; }
  .si-chip { border: 3px solid #000 !important; }
  .si-chip-asc { background:#ffe5e8 !important; color:#000 !important; }

  /* Avoid splitting cards/grids across pages */
  .charts-grid, .avoid-break { break-inside: avoid; page-break-inside: avoid; }

  /* Slimmer logo so it doesn't push content down */
  .page-logo { text-align:center; margin: 0 0 8px; }
  .page-logo img { width: 90px !important; height: auto !important; display:block; margin:0 auto; }
}

    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  /* ---------- Form state ---------- */
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lon, setLon] = useState<number | ''>('');
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [day, setDay] = useState<number | ''>('');
  const [hour12, setHour12] = useState<number | ''>('');
  const [minute, setMinute] = useState<number | ''>('');
  const [second, setSecond] = useState<number | ''>('');
  const [ampm, setAmpm] = useState<'AM'|'PM'|''>('');
  const [timezone, setTimezone] = useState('');
  const [tzSelect, setTzSelect] = useState<string>('');
  const [houseSystem, setHouseSystem] = useState('P');

  // Auto-restore last successful output + form values after a refresh / HMR edit
useEffect(() => {
  if (typeof window === 'undefined') return;
  const saved = safeParse<any>(localStorage.getItem(STORAGE_KEY));
  if (!saved) return;
  // only restore if nothing is loaded yet
  if (!out) {
    try {
      // restore result
      if (saved.out) setOut(saved.out);

      // restore form (best-effort; ignore if missing)
      if (saved.name !== undefined) setName(saved.name);
      if (saved.place !== undefined) setPlace(saved.place);
      if (saved.lat !== undefined) setLat(saved.lat);
      if (saved.lon !== undefined) setLon(saved.lon);
      if (saved.timezone !== undefined) setTimezone(saved.timezone);
      if (saved.houseSystem !== undefined) setHouseSystem(saved.houseSystem);

      // restore date/time (expects "YYYY-MM-DD" and "HH:MM:SS")
      if (saved.dateStr) {
        const [yy, mm, dd] = String(saved.dateStr).split('-').map((n: string) => Number(n));
        if (yy) setYear(yy as any);
        if (mm) setMonth(mm as any);
        if (dd) setDay(dd as any);
      }
      if (saved.timeStr) {
        const [HH, MM, SS] = String(saved.timeStr).split(':').map((n: string) => Number(n));
        if (!Number.isNaN(HH)) {
          let h12 = HH % 12; if (h12 === 0) h12 = 12;
          setHour12(h12 as any);
          setAmpm((HH >= 12 ? 'PM' : 'AM') as any);
        }
        if (!Number.isNaN(MM)) setMinute(MM as any);
        if (!Number.isNaN(SS)) setSecond(SS as any);
      }
    } catch {}
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);






  // Keep selected day valid when month/year changes
  useEffect(() => {
    if (day === '' || year === '' || month === '') return;
    const max = daysInMonth(Number(year), Number(month));
    if (Number(day) > max) setDay(max);
  }, [year, month]); // eslint-disable-line

  // Timezone select vs custom
  useEffect(() => {
    if (!timezone) { setTzSelect(''); return; }
    setTzSelect(TIMEZONES.includes(timezone) ? timezone : 'CUSTOM');
  }, [timezone]);

  /* ---------- Geocoding ---------- */
  type GeoHit = { name: string, lat: number, lon: number, country?: string, state?: string };
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);

  function useMyTimezone() {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) setTimezone(tz); } catch {}
  }
  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoError('Geolocation not supported in this browser.'); return; }
    setGeoError(null); setSearching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(+pos.coords.latitude.toFixed(6)); setLon(+pos.coords.longitude.toFixed(6)); setSearching(false); },
      (err) => { setSearching(false); setGeoError(err?.message || 'Could not read location (permission denied?).'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
  async function doGeocode() {
    setGeoError(null); setSearching(true); setHits([]);
    try {
      if (!place.trim()) throw new Error('Type a city/place first.');
      const res = await fetch('/api/geocode?q=' + encodeURIComponent(place), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Geocode failed');
      const list: GeoHit[] = json?.results || [];
      setHits(list);
      if (json?.top) {
        setPlace(json.top.name);
        setLat(Number(json.top.lat.toFixed(6)));
        setLon(Number(json.top.lon.toFixed(6)));
      }
    } catch (e:any) { setGeoError(e?.message || String(e)); }
    finally { setSearching(false); }
  }
  // gentle auto-geocode if place typed & coords empty
  useEffect(() => {
    const should = place.trim() && (lat === '' || lon === '');
    if (!should) return;
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/geocode?q=' + encodeURIComponent(place), { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && json?.top) {
          setPlace(json.top.name);
          setLat(Number(json.top.lat.toFixed(6)));
          setLon(Number(json.top.lon.toFixed(6)));
          setHits(json.results || []);
        }
      } catch {}
    }, 600);
    return () => window.clearTimeout(id);
  }, [place]); // eslint-disable-line

  const yearOptions = useMemo(() => range(1800, 2100), []);
  const dateStr = useMemo(() => {
    if (!year || !month || !day) return '';
    return `${year}-${pad2(Number(month))}-${pad2(Number(day))}`;
  }, [year, month, day]);

  const timeStr = useMemo(() => {
    if (hour12 === '' || minute === '' || second === '' || ampm === '') return '';
    let hh = Number(hour12);
    if (ampm === 'AM' && hh === 12) hh = 0;
    if (ampm === 'PM' && hh !== 12) hh += 12;
    return `${pad2(hh)}:${pad2(Number(minute))}:${pad2(Number(second))}`;
  }, [hour12, minute, second, ampm]);

  /* ---------- Chart state ---------- */
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<ChartOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  function resetAll() {
    setName(''); setPlace(''); setLat(''); setLon('');
    setYear(''); setMonth(''); setDay('');
    setHour12(''); setMinute(''); setSecond(''); setAmpm('');
    setTimezone(''); setTzSelect('');
    setHouseSystem('P');
    setHits([]); setGeoError(null); setOut(null); setErr(null);
  }
  useEffect(()=>{ resetAll(); },[]);

  async function generateChart(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null); setOut(null); setLoading(true);
    try {
      if (!name.trim()) { setErr('Please enter a Name.'); return; }
      if (!place.trim()) { setErr('Please enter a Place.'); return; }
      if (lat === '' || lon === '') { setErr('Please provide latitude and longitude.'); return; }
      if (!dateStr) { setErr('Please set Day/Month/Year.'); return; }
      if (!timeStr) { setErr('Please set Time (HH:MM:SS & AM/PM).'); return; }

      const { tz, corrected } = normalizeTimezone(timezone);
      if (!tz) { setErr('Unrecognized timezone. Choose a valid IANA zone like "Asia/Kolkata".'); return; }
      if (corrected && corrected !== timezone) setTimezone(corrected);

      const res = await fetch('/api/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr, time: timeStr, timezone: tz,
          lat: Number(lat), lon: Number(lon), houseSystem,
          name, place
        })
      });
      let json: any = null;
      try { json = await res.json(); } catch {}
      if (!res.ok) { setErr(json && json.error ? String(json.error) : 'Chart error'); return; }

      let result: ChartOut = { ...json, name, place, lat: Number(lat), lon: Number(lon) };

      // Fallback sunrise/sunset via suncalc if missing
      if (!result.sunriseISO || !result.sunsetISO) {
        try {
          const SunCalcMod: any = await import('suncalc');
          const SunCalc = SunCalcMod.default || SunCalcMod;
          const [yy, mm, dd] = dateStr.split('-').map(Number);
          const base = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0)); // noon UTC
          const { sunrise, sunset } = SunCalc.getTimes(base, Number(lat), Number(lon));
          result.sunriseISO = result.sunriseISO || (sunrise ? sunrise.toISOString() : null);
          result.sunsetISO  = result.sunsetISO  || (sunset  ? sunset.toISOString()  : null);
        } catch {}
      }

      setOut(result);
    } catch (e:any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Exports (simple, safe) ---------- */
  function downloadHTML() {
    if (!printRef.current) return;
    const html = `<!doctype html><meta charset="utf-8"><title>${name || 'Report'}</title>${printRef.current.outerHTML}`;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${name || 'report'}.html`; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadJSON() {
    if (!out) return;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${name || 'report'}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadCSV() {
    if (!out) return;
    const bodies = BODY_ORDER;
    const rows: string[] = [];
    rows.push(['Body','D1','D9'].map(csvEscape).join(','));
    for (const b of bodies) {
      const d1 = b === 'Ascendant' ? out.ascendant : out.positions?.[b as Exclude<BodyName,'Ascendant'>];
      const d9 = b === 'Ascendant' ? out.d9Ascendant : out.d9Positions?.[b as Exclude<BodyName,'Ascendant'>];
      rows.push([b, signNameFromDeg(d1 as number), signNameFromDeg(d9 as number)].map(csvEscape).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${name || 'report'}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadPDF() {
    // keep simple & robust: rely on browser’s “Save as PDF”
    window.print();
  }
  function exportChartsSVG() { /* no-op stub for now */ }
  function exportChartsPNG() { /* no-op stub for now */ }

  /* ---------- Form UI ---------- */
  const years = yearOptions;
  const months = range(1,12);
  const days = year && month ? range(1, daysInMonth(Number(year), Number(month))) : range(1, 31);
  const hours12 = range(1,12);
  const minutes = range(0,59);
  const seconds = range(0,59);

  return (
    <main style={{maxWidth: 1000, margin: '0 auto', padding: 16}}>
      <h1 style={{fontSize: 28, fontWeight: 900, marginBottom: 12}}>Chandra Prabha — Vedic Astrology</h1>

      {/* FORM */}
      <form onSubmit={generateChart} className="card">
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          <label>
            <div>Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name"/>
          </label>
          <label>
            <div>Place</div>
            <input value={place} onChange={e=>setPlace(e.target.value)} placeholder="City, Country"/>
          </label>

          <div>
            <div>Latitude / Longitude</div>
            <div style={{display:'flex', gap:8}}>
              <input style={{flex:1}} value={lat} onChange={e=>setLat(e.target.value ? Number(e.target.value) : '')} placeholder="Lat (e.g. 13.0827)"/>
              <input style={{flex:1}} value={lon} onChange={e=>setLon(e.target.value ? Number(e.target.value) : '')} placeholder="Lon (e.g. 80.2707)"/>
            </div>
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <button type="button" onClick={doGeocode} disabled={searching}>{searching ? 'Geocoding…' : 'Geocode'}</button>
              <button type="button" onClick={useMyLocation}>Use my location</button>
            </div>
            {geoError && <div style={{color:'#b91c1c', marginTop:6}}>{geoError}</div>}
            {hits.length>0 && (
              <div style={{marginTop:8}}>
                <div style={{fontWeight:700, marginBottom:6}}>Matches:</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                  {hits.slice(0,6).map((h,i)=>(
                    <button key={i} type="button" onClick={()=>{ setPlace(h.name); setLat(+h.lat.toFixed(6)); setLon(+h.lon.toFixed(6)); }}>
                      {h.name} ({h.lat.toFixed(3)}, {h.lon.toFixed(3)})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div>Date (Y-M-D)</div>
            <div style={{display:'flex', gap:8}}>
              <select value={year} onChange={e=>setYear(e.target.value? Number(e.target.value):'')}>
                <option value="">Year</option>
                {years.map(y=> <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={month} onChange={e=>setMonth(e.target.value? Number(e.target.value):'')}>
                <option value="">Month</option>
                {months.map(m=> <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={day} onChange={e=>setDay(e.target.value? Number(e.target.value):'')}>
                <option value="">Day</option>
                {days.map(d=> <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div>Time (12h)</div>
            <div style={{display:'flex', gap:8}}>
              <select value={hour12} onChange={e=>setHour12(e.target.value? Number(e.target.value):'')}>
                <option value="">Hour</option>
                {hours12.map(h=> <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={minute} onChange={e=>setMinute(e.target.value? Number(e.target.value):'')}>
                <option value="">Min</option>
                {minutes.map(m=> <option key={m} value={m}>{pad2(m)}</option>)}
              </select>
              <select value={second} onChange={e=>setSecond(e.target.value? Number(e.target.value):'')}>
                <option value="">Sec</option>
                {seconds.map(s=> <option key={s} value={s}>{pad2(s)}</option>)}
              </select>
              <select value={ampm} onChange={e=>setAmpm(e.target.value as any)}>
                <option value="">AM/PM</option>
                <option>AM</option><option>PM</option>
              </select>
            </div>
          </div>

          <div>
            <div>Timezone</div>
            <div style={{display:'flex', gap:8}}>
              <select value={tzSelect} onChange={e=> setTimezone(e.target.value==='CUSTOM' ? timezone : e.target.value)}>
                <option value="">Choose</option>
                {TIMEZONES.map(z => <option key={z} value={z}>{z}</option>)}
                <option value="CUSTOM">Custom…</option>
              </select>
              <input value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder='e.g. Asia/Kolkata'/>
              <button type="button" onClick={useMyTimezone}>Use my timezone</button>
            </div>
          </div>

          <label>
            <div>Houses (P=Placidus, W=Whole, E=Equal)</div>
            <select value={houseSystem} onChange={e=>setHouseSystem(e.target.value)}>
              <option value="P">Placidus</option>
              <option value="W">Whole Sign</option>
              <option value="E">Equal</option>
            </select>
          </label>
        </div>

        <div style={{display:'flex', gap:8, marginTop:12}}>
          <button type="submit" disabled={loading}>{loading ? 'Computing…' : 'Create chart'}</button>
          <button type="button" onClick={resetAll}>Reset</button>
        </div>
        {err && <div style={{color:'#b91c1c', marginTop:8}}>{err}</div>}
      </form>

    {/* ========================= PRINTED CONTENT ========================= */}

{out ? (

  <div id="print-root" ref={printRef}>
    {/* ---------- PAGE 1: Summary + Pañcāṅga ---------- */}
    <section className="page-section first">
      {/* Optional logo/header */}
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
          <div style={{fontSize:18, fontWeight:900, marginTop:6}}>Vedic Astrology Report</div>
        </div>
      )}

      {/* Summary */}
      <div className="card avoid-break">
        <div className="section-title">Summary</div>
        <div style={{display:'grid', gridTemplateColumns:'1.2fr 2fr', gap:8}}>
          <div><b>Name</b></div><div>{name}</div>
          <div><b>Place</b></div><div>{place}</div>
          <div><b>Timezone</b></div><div>{out.timezone}</div>
          <div><b>Sunrise</b></div><div>{fmtISO(out.sunriseISO, out.timezone)}</div>
          <div><b>Sunset</b></div><div>{fmtISO(out.sunsetISO, out.timezone)}</div>
        </div>
      </div>

      {/* Pañcāṅga (with LST) */}
      <div className="card avoid-break" style={{marginTop:12}}>
        <div className="section-title">Pañcāṅga (birth moment)</div>
        <div style={{display:'grid', gridTemplateColumns:'1.2fr 2fr', gap:8}}>
          <div><b>Vāra (weekday)</b></div><div>{out.panchanga?.vara ?? '—'}</div>
          <div><b>Tithi</b></div><div>{out.panchanga?.tithi ?? '—'}</div>
          <div><b>Nakṣatra</b></div><div>{out.panchanga?.nakshatra ?? '—'}</div>
          <div><b>Yoga</b></div><div>{out.panchanga?.yoga ?? '—'}</div>
          <div><b>Karaṇa</b></div><div>{out.panchanga?.karana ?? '—'}</div>
          <div><b>Local Sidereal Time</b></div><div>{fmtLST(out.lstHours ?? 0)}</div>
        </div>
      </div>
    </section>

    {/* ---------- PAGE 2: Rāśi (D1) ---------- */}
    <section className="page-section">
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
        </div>
      )}
      <SouthIndianChart
        title="Rāśi (D1) — Signs"
        mode="sign"
        ascDeg={out.ascendant}
        positions={out.positions}
      />
    </section>

    {/* ---------- PAGE 3: Navāṁśa + Bhāva (stacked) ---------- */}
    <section className="page-section no-break">
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
        </div>
      )}
      <SouthIndianChart
        title="Navāṁśa (D9) — Signs"
        mode="sign"
        ascDeg={out.d9Ascendant}
        positions={out.d9Positions}
      />
      <div style={{height:10}}/>
      <SouthIndianChart
        title="Bhāva (Houses from Lagna)"
        mode="bhava"
        ascDeg={out.ascendant}
        positions={out.positions}
      />
    </section>

    {/* ---------- PAGE 4: Varga (Signs only) ---------- */}
    <section className="page-section">
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
        </div>
      )}
      <div className="card avoid-break">
        <div className="section-title">Varga (Signs only) — D1 • D2 • D3 • D7 • D9 • D10 • D12 • D30</div>
        <div style={{display:'grid', gridTemplateColumns:'1.2fr repeat(8, 1fr)', gap:8}}>
          <div style={{fontWeight:900}}>Body</div>
          <div style={{fontWeight:900}}>D1</div>
          <div style={{fontWeight:900}}>D2</div>
          <div style={{fontWeight:900}}>D3</div>
          <div style={{fontWeight:900}}>D7</div>
          <div style={{fontWeight:900}}>D9</div>
          <div style={{fontWeight:900}}>D10</div>
          <div style={{fontWeight:900}}>D12</div>
          <div style={{fontWeight:900}}>D30</div>

          {['Ascendant','Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'].map((body) => {
            const show = (vx?: number | null) => {
              if (typeof vx !== 'number' || Number.isNaN(vx)) return '—';
              const idx = ((vx%12)+12)%12;
              const names = Array.isArray((globalThis as any).SIGN_FULL_LOCAL)
                ? (globalThis as any).SIGN_FULL_LOCAL as string[]
                : ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
              return names[idx] || '—';
            };
            const vs = (out as any).vargaSigns || {};
            return (
              <React.Fragment key={`vrow-${body}`}>
                <div style={{fontWeight:600}}>{body}</div>
                <div>{show(vs?.D1?.[body])}</div>
                <div>{show(vs?.D2?.[body])}</div>
                <div>{show(vs?.D3?.[body])}</div>
                <div>{show(vs?.D7?.[body])}</div>
                <div>{show(vs?.D9?.[body])}</div>
                <div>{show(vs?.D10?.[body])}</div>
                <div>{show(vs?.D12?.[body])}</div>
                <div>{show(vs?.D30?.[body])}</div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>

    {/* ---------- PAGE 5: Nakṣatra / Pada ---------- */}
    <section className="page-section">
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
        </div>
      )}
      <div className="card avoid-break">
        <div className="section-title">Nakṣatra • Pada • Ruler (D1)</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8}}>
          <div style={{fontWeight:900}}>Body</div>
          <div style={{fontWeight:900}}>Sign</div>
          <div style={{fontWeight:900}}>Longitude</div>
          <div style={{fontWeight:900}}>Nakṣatra</div>
          <div style={{fontWeight:900}}>Pada</div>
          <div style={{fontWeight:900}}>Ruler</div>
          {out.nakTable.map((r:any, i:number)=>(
            <React.Fragment key={`nak-${i}`}>
              <div>{r.body}</div>
              <div>{r.sign}</div>
              <div>{fmtSignDeg(r.deg)}</div>
              <div>{r.nakshatra}</div>
              <div>{r.pada}</div>
              <div>{r.lord}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>

    {/* ---------- PAGE 6: Vimśottarī Daśā ---------- */}
    <section className="page-section">
      {typeof PRINT_LOGO_EACH_PAGE !== 'undefined' && PRINT_LOGO_EACH_PAGE && (
        <div className="print-only page-logo">
          <img src="/logo.png" width={140} height={140} alt="Chandra Prabha — Vedic Astrology"/>
        </div>
      )}
      
 <div className="card avoid-break">
  <div className="section-title">Vimśottarī Mahādaśā (from birth)</div>
  <div className="avoid-break" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
    <div style={{fontWeight:900}}>Lord</div>
    <div style={{fontWeight:900}}>Start</div>
    <div style={{fontWeight:900}}>End</div>
    {out.dasha.map((d:any, i:number)=>(
      <React.Fragment key={`dasha-${i}`}>
        <div>{d.lord}</div>
        <div>{fmtISO(d.startISO, out.timezone)}</div>
        <div>{fmtISO(d.endISO, out.timezone)}</div>
      </React.Fragment>
    ))}
  </div>
</div>

</section>
</div>
) : null}

{/* -------- Export bar (screen only) -------- */}
{out && (
  <div className="export-bar">
    <button onClick={downloadPDF} title="Create a PDF file">Save PDF</button>
    <button onClick={() => window.print()} title="Use browser print dialog">Print</button>
    <button onClick={downloadHTML}>Save HTML</button>
    <button onClick={downloadJSON}>Download JSON</button>
    <button onClick={downloadCSV}>Download CSV</button>
    <button onClick={exportChartsSVG}>Charts (SVG)</button>
    <button onClick={exportChartsPNG}>Charts (PNG)</button>
  </div>
)}

</main>
);
}

                                                                                                                                                  
 











