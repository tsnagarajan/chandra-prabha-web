import 'server-only';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // make sure this API runs in Node (not Edge)

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const swe = require('swisseph');

let SunCalc: any = null;
try { SunCalc = require('suncalc'); } catch { SunCalc = null; }

// ---- Swiss setup ----
const EPHE_PATH = path.join(process.cwd(), 'ephe');
try { swe.swe_set_ephe_path(EPHE_PATH); } catch {}
try { swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0); } catch {}

function listEphe(dir: string) { try { return fs.readdirSync(dir); } catch { return []; } }
const EPHE_FILES = listEphe(EPHE_PATH);

// ---------- Helpers (sync first, else callback) ----------
function callDual(fn: any, args: any[], probe?: (r: any)=>any) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof fn !== 'function') return reject(new Error('Function not available'));
      try {
        const r = fn(...args);
        const ok = probe ? probe(r) : r;
        if (ok !== undefined && ok !== null) return resolve(r);
      } catch {}
      try { fn(...args, (r: any) => resolve(r)); } catch (e) { reject(e); }
    } catch (e) { reject(e); }
  });
}

async function sweCalcUT(jd_ut: number, ipl: number, iflag: number) {
  const fn = swe.swe_calc_ut ?? swe.calc_ut;
  return callDual(fn, [jd_ut, ipl, iflag], (r) => r && (Array.isArray(r.xx) || typeof r.longitude === 'number'));
}

async function sweHouses(jd_ut: number, lat: number, lon: number, hs: string) {
  const fn = swe.swe_houses ?? swe.houses;
  return callDual(fn, [jd_ut, lat, lon, hs], (r) => {
    const cusp = r?.cusp || r?.cusps || r?.house || r?.houses;
    const asc  = (Array.isArray(r?.ascmc) ? r.ascmc[0] : (r?.ascendant ?? r?.asc));
    return Array.isArray(cusp) && typeof asc === 'number';
  });
}

function parseDateTimeFlexible(dateStr: string, timeStr: string, tz: string) {
  const d = (dateStr ?? '').toString().trim();
  const t = (timeStr ?? '').toString().trim().toUpperCase();
  let dt = DateTime.fromISO(`${d}T${t}`, { zone: tz });
  if (!dt.isValid) {
    const dateFormats = ['yyyy-MM-dd','MM/dd/yyyy','dd/MM/yyyy','M/d/yyyy','d/M/yyyy'];
    const timeFormats = ['HH:mm:ss','HH:mm','H:mm','h:mm a','h:mm:ss a','hh:mm a','hh:mm:ss a'];
    outer: for (const df of dateFormats) {
      for (const tf of timeFormats) {
        dt = DateTime.fromFormat(`${d} ${t}`, `${df} ${tf}`, { zone: tz });
        if (dt.isValid) break outer;
      }
    }
  }
  return dt.setZone('utc', { keepLocalTime: false });
}

// ---------- Sidereal helpers ----------
const SEG = 30 / 9; // 3°20'
const norm360 = (x: number) => (((x % 360) + 360) % 360);
function signIndex(deg: number) { return Math.floor(norm360(deg) / 30); }
function navamsaLong(d1Long: number) {
  const L = norm360(d1Long);
  const s = signIndex(L);
  const within = L - s * 30;
  const n = Math.floor(within / SEG);
  const movable = [0,3,6,9].includes(s);
  const fixed   = [1,4,7,10].includes(s);
  const dual    = [2,5,8,11].includes(s);
  let start = s;
  if (fixed) start = (s + 8) % 12;
  if (dual)  start = (s + 4) % 12;
  const d9Sign = (start + n) % 12;
  const withinSeg = within - n * SEG;
  const d9Within = withinSeg * 9;
  return d9Sign * 30 + d9Within;
}

// ---------- Planet calculation ----------
function getLongitude(res: any): number | null {
  if (!res) return null;
  if (Array.isArray(res.xx) && Number.isFinite(res.xx[0])) return res.xx[0];
  if (typeof res.longitude === 'number' && Number.isFinite(res.longitude)) return res.longitude;
  return null;
}

async function computePlanetsAsync(jd_ut: number, iflag: number) {
  const plist = [
    ['Sun', swe.SE_SUN], ['Moon', swe.SE_MOON], ['Mercury', swe.SE_MERCURY], ['Venus', swe.SE_VENUS],
    ['Mars', swe.SE_MARS], ['Jupiter', swe.SE_JUPITER], ['Saturn', swe.SE_SATURN],
    ['Uranus', swe.SE_URANUS], ['Neptune', swe.SE_NEPTUNE], ['Pluto', swe.SE_PLUTO],
    ['Rahu', swe.SE_TRUE_NODE],
  ] as const;

  const positions: Record<string, number> = {};
  const serrMap: Record<string, string> = {};

  for (const [name, code] of plist) {
    const res = await sweCalcUT(jd_ut, code, iflag);
    const lon = getLongitude(res);
    if (!Number.isFinite(lon as number)) {
      serrMap[name] = res?.serr || 'no longitude returned';
      return { ok: false as const, positions, serrMap };
    }
    if (res.serr) serrMap[name] = res.serr;
    positions[name] = lon as number;
  }
  positions['Ketu'] = norm360(positions['Rahu'] + 180);
  return { ok: true as const, positions, serrMap };
}

// Houses shape normalizer
function normalizeHousesShape(hRaw: any) {
  const cuspAny = hRaw?.cusp ?? hRaw?.cusps ?? hRaw?.house ?? hRaw?.houses;
  const ascTrop = Array.isArray(hRaw?.ascmc) ? hRaw.ascmc[0] : (hRaw?.ascendant ?? hRaw?.asc);
  if (!Array.isArray(cuspAny) || typeof ascTrop !== 'number') {
    throw new Error('Unexpected houses shape');
  }
  const cuspsTrop = cuspAny.length === 12 ? [0, ...cuspAny] : cuspAny.slice(0, 13);
  return { cuspsTrop, ascTrop };
}

// ---------- Nakshatra & Dasha ----------
const NAK_NAMES = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha',
  'Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'
];
const LORD_SEQ = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
const LORD_YEARS: Record<string, number> = { Ketu:7, Venus:20, Sun:6, Moon:10, Mars:7, Rahu:18, Jupiter:16, Saturn:19, Mercury:17 };

const DEG_PER_NAK = 360/27;
const DEG_PER_PADA = DEG_PER_NAK/4;

function nakFor(deg: number) {
  const L = norm360(deg);
  const idx = Math.floor(L / DEG_PER_NAK);
  const within = L - idx*DEG_PER_NAK;
  const pada = Math.floor(within / DEG_PER_PADA) + 1;
  const lord = LORD_SEQ[idx % 9];
  return { index: idx, name: NAK_NAMES[idx], pada, lord };
}

function buildNakTable(asc: number, pos: Record<string, number>) {
  const bodies = ['Ascendant','Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu','Uranus','Neptune','Pluto'];
  return bodies.map(b => {
    const deg = b === 'Ascendant' ? asc : pos[b];
    const sIdx = Math.floor(norm360(deg)/30);
    const signName = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'][sIdx];
    const { name, lord, pada } = nakFor(deg);
    return { body: b, sign: signName, deg, nakshatra: name, pada, lord };
  });
}

function buildVimDasha(moonDeg: number, startDT_local: DateTime) {
  const nk = nakFor(moonDeg);
  const posInNak = (norm360(moonDeg) % DEG_PER_NAK);
  const remFrac = (DEG_PER_NAK - posInNak) / DEG_PER_NAK;
  const order = LORD_SEQ;
  const startIdx = order.indexOf(nk.lord);
  const seq: { lord: string; years: number }[] = [];
  for (let i=0;i<9;i++){
    const lord = order[(startIdx + i) % 9];
    const yrs = LORD_YEARS[lord];
    seq.push({ lord, years: yrs });
  }
  const out: { lord: string; startISO: string; endISO: string }[] = [];
  let cursor = startDT_local;
  const firstYears = seq[0].years * remFrac;
  let end = cursor.plus({ days: firstYears * 365.2425 });
  out.push({ lord: seq[0].lord, startISO: cursor.toISO(), endISO: end.toISO() });
  cursor = end;
  for (let i=1;i<9;i++){
    const mdYears = seq[i].years;
    end = cursor.plus({ days: mdYears * 365.2425 });
    out.push({ lord: seq[i].lord, startISO: cursor.toISO(), endISO: end.toISO() });
    cursor = end;
  }
  return out;
}

// ---------- Major aspects (pairwise; no houses) ----------
const MAJOR_ASPECTS = [
  { name: 'Conjunction', angle: 0,   orb: 6 },
  { name: 'Opposition',  angle: 180, orb: 6 },
  { name: 'Trine',       angle: 120, orb: 5 },
  { name: 'Square',      angle: 90,  orb: 5 },
  { name: 'Sextile',     angle: 60,  orb: 4 },
];
function deltaDeg(a: number, b: number) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}
function buildAspectsPairs(positions: Record<string, number>) {
  const names = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu','Uranus','Neptune','Pluto'];
  const pairs: { a: string; b: string; type: string; delta: number }[] = [];
  for (let i=0;i<names.length;i++){
    for (let j=i+1;j<names.length;j++){
      const A = names[i], B = names[j];
      const la = positions[A], lb = positions[B];
      if (!Number.isFinite(la) || !Number.isFinite(lb)) continue;
      const d = deltaDeg(la, lb);
      for (const asp of MAJOR_ASPECTS) {
        if (Math.abs(d - asp.angle) <= asp.orb) {
          pairs.push({ a: A, b: B, type: asp.name, delta: Number(d.toFixed(2)) });
          break;
        }
      }
    }
  }
  return pairs;
}

// ---------- House helpers ----------
function norm24(x: number) { return ((((x % 24) + 24) % 24)); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { date, time, timezone, lat, lon, houseSystem = 'P', forceEngine } = body ?? {};

    if (!date || !time || !timezone || lat === undefined || lon === undefined) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return NextResponse.json({ error: 'Invalid latitude/longitude.' }, { status: 400 });
    }
    houseSystem = String(houseSystem || 'P').slice(0, 1).toUpperCase();

    // JD(UT)
    const dtUTC = parseDateTimeFlexible(String(date), String(time), String(timezone));
    if (!dtUTC.isValid) {
      return NextResponse.json(
        { error: 'Unrecognized date/time. Try 1936-05-08 and 07:22:00 or 07:22:00 AM.' },
        { status: 400 }
      );
    }
    const hour = dtUTC.hour + dtUTC.minute / 60 + dtUTC.second / 3600;
    const jd_ut = swe.swe_julday(dtUTC.year, dtUTC.month, dtUTC.day, hour, swe.SE_GREG_CAL);

    // Flags
    const BASE_SIDEREAL = swe.SEFLG_SPEED | swe.SEFLG_SIDEREAL;
    const canUseSWIEPH = EPHE_FILES.some(f => /\.se\d$/.test(f) || /\.sef?$/.test(f));
    const IF_SWIEPH = (canUseSWIEPH ? swe.SEFLG_SWIEPH : 0) | BASE_SIDEREAL;
    const IF_MOSEPH = swe.SEFLG_MOSEPH | BASE_SIDEREAL;

    // Engine order
    const tryOrder: Array<{ name: 'SWIEPH' | 'MOSEPH'; iflag: number }> =
      forceEngine === 'MOSEPH' ? [{ name: 'MOSEPH', iflag: IF_MOSEPH }, { name: 'SWIEPH', iflag: IF_SWIEPH }]
      : forceEngine === 'SWIEPH' ? [{ name: 'SWIEPH', iflag: IF_SWIEPH }, { name: 'MOSEPH', iflag: IF_MOSEPH }]
      : canUseSWIEPH ? [{ name: 'SWIEPH', iflag: IF_SWIEPH }, { name: 'MOSEPH', iflag: IF_MOSEPH }]
      : [{ name: 'MOSEPH', iflag: IF_MOSEPH }];

    let engineUsed: 'SWIEPH' | 'MOSEPH' = tryOrder[0].name;
    let positions: Record<string, number> | null = null;
    let lastError: any = null;

    for (const eng of tryOrder) {
      engineUsed = eng.name;
      const attempt = await computePlanetsAsync(jd_ut, eng.iflag);
      if (attempt.ok) { positions = attempt.positions; lastError = null; break; }
      lastError = attempt;
    }
    if (!positions) {
      const culprit = lastError && Object.keys(lastError.serrMap)[0] || 'Unknown';
      return NextResponse.json({
        error: `Computation failed for ${culprit}.`,
        details: {
          engineTried: engineUsed,
          serr: lastError?.serrMap?.[culprit] || 'no detail',
          ephePath: EPHE_PATH,
          epheFiles: EPHE_FILES,
          version: typeof swe.swe_version === 'function' ? swe.swe_version() : 'n/a',
          jd_ut,
        }
      }, { status: 500 });
    }

    // Houses / Ascendant (sidereal = tropical − ayanamsa)
    const hRaw = await sweHouses(jd_ut, lat, lon, houseSystem);
    let cusps: number[] = [];
    let ascendant = 0;
    try {
      const { cuspsTrop, ascTrop } = normalizeHousesShape(hRaw);
      const ayan = swe.swe_get_ayanamsa_ut(jd_ut);
      ascendant = norm360(ascTrop - ayan);
      cusps = cuspsTrop.map((deg: number, idx: number) => idx === 0 ? 0 : norm360(deg - ayan));
    } catch (e) {
      return NextResponse.json({
        error: 'Computation failed (houses).',
        details: { ephePath: EPHE_PATH, epheFiles: EPHE_FILES, jd_ut, hRawKeys: Object.keys(hRaw || {}) }
      }, { status: 500 });
    }

    // D9 (Navāṁśa)
    const d9Positions: Record<string, number> = {};
    Object.entries(positions).forEach(([name, d]) => { d9Positions[name] = navamsaLong(d); });
    const d9Ascendant = navamsaLong(ascendant);
    const d9Cusps = Array(13).fill(0);
    const d9AscSign = Math.floor(d9Ascendant / 30);
    for (let i = 1; i <= 12; i++) d9Cusps[i] = ((d9AscSign * 30) + (i - 1) * 30) % 360;

    // LST
    let gstRes: any = 0;
    try {
      if (typeof swe.swe_sidtime === 'function') gstRes = swe.swe_sidtime(jd_ut);
      else if (typeof swe.sidtime === 'function') gstRes = swe.sidtime(jd_ut);
    } catch {}
    const gstHours =
      typeof gstRes === 'number' ? gstRes
      : (typeof gstRes?.siderealTime === 'number' ? gstRes.siderealTime
      : (typeof gstRes?.sidtime === 'number' ? gstRes.sidtime : 0));
    const lstHours = norm24(gstHours + (lon / 15));

    // Tables
    const nakTable = buildNakTable(ascendant, positions);
    const dtLocal = parseDateTimeFlexible(String(date), String(time), String(timezone)).setZone(String(timezone));
    const dasha = buildVimDasha(positions['Moon'], dtLocal);

    // Sunrise/Sunset
    let sunriseISO: string | null = null;
    let sunsetISO: string | null = null;
    if (SunCalc) {
      try {
        const localDate = DateTime.fromObject({ year: dtLocal.year, month: dtLocal.month, day: dtLocal.day }, { zone: String(timezone) });
        const times = SunCalc.getTimes(localDate.toJSDate(), lat, lon);
        const sr = DateTime.fromJSDate(times.sunrise).setZone(String(timezone));
        const ss = DateTime.fromJSDate(times.sunset).setZone(String(timezone));
        sunriseISO = sr.toISO(); sunsetISO = ss.toISO();
      } catch {}
    }

    // Aspects (major only, no houses)
    const aspects = buildAspectsPairs(positions);

    return NextResponse.json({
      engine: engineUsed,
      jd_ut,
      lstHours,
      timezone,
      // D1
      ascendant,
      cusps,
      positions,
      // D9
      d9Ascendant,
      d9Cusps,
      d9Positions,
      // Extras
      sunriseISO,
      sunsetISO,
      nakTable,
      dasha,
      aspects
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}




 

