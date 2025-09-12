// app/lib/astro.ts
export type GeoHit = { name: string; lat: number; lon: number; class: string; type: string };
export type NakRow = { body: string; sign: string; deg: number; nakshatra: string; pada: number; lord: string };
export type DashaRow = { lord: string; startISO: string; endISO: string };
export type AspectPair = { a: string; b: string; type: string; delta: number };

export type ChartOut = {
  engine: 'SWIEPH' | 'MOSEPH';
  jd_ut: number;
  lstHours: number;
  timezone: string;
  // D1
  ascendant: number;
  cusps: number[];
  positions: Record<string, number>;
  // D9
  d9Ascendant: number;
  d9Cusps: number[];
  d9Positions: Record<string, number>;
  // Extras
  sunriseISO: string | null;
  sunsetISO: string | null;
  nakTable: NakRow[];
  dasha: DashaRow[];
  aspects: AspectPair[];
};

// ----- Constants -----
export const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];
export const SIGN_ABBR = ['Ar','Ta','Ge','Cn','Le','Vi','Li','Sc','Sg','Cp','Aq','Pi'];
export const BODY_ORDER = ['Ascendant','Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu','Uranus','Neptune','Pluto'];

export const PLANET_ABBR: Record<string,string> = {
  Sun:'Sun', Moon:'Moo', Mercury:'Mer', Venus:'Ven', Mars:'Mar',
  Jupiter:'Jup', Saturn:'Sat', Rahu:'Rah', Ketu:'Ket', Uranus:'Ura', Neptune:'Nep', Pluto:'Plu'
};

// South-Indian 4×4 layout (grid coordinates)
export const SOUTH_LAYOUT: Array<{sign:number,row:number,col:number}> = [
  {sign:11,row:0,col:0}, {sign:0 ,row:0,col:1}, {sign:1 ,row:0,col:2}, {sign:2 ,row:0,col:3},
  {sign:10,row:1,col:0}, {sign:3 ,row:1,col:3},
  {sign:9 ,row:2,col:0}, {sign:4 ,row:2,col:3},
  {sign:8 ,row:3,col:0}, {sign:7 ,row:3,col:1}, {sign:6 ,row:3,col:2}, {sign:5 ,row:3,col:3},
];

// ----- Generic helpers -----
export const pad2 = (n: number) => n.toString().padStart(2, '0');
export function norm360(x: number){ return (((x % 360) + 360) % 360); }
export function toDMSSafe(deg: number) {
  let total = Math.round(norm360(deg) * 3600);
  let d = Math.floor(total / 3600); total -= d*3600;
  let m = Math.floor(total / 60); total -= m*60;
  let s = total;
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  d = d % 360;
  return { d, m, s };
}
export function fmtDMS(deg: number) {
  const { d, m, s } = toDMSSafe(deg);
  return `${d}° ${m}′ ${s}″`;
}
export function fmtSignDeg(deg: number) {
  const d = norm360(deg);
  const sign = Math.floor(d / 30);
  const within = d - sign * 30;
  const { d: dd, m, s } = toDMSSafe(within);
  return `${SIGNS[sign]} ${dd}°${m.toString().padStart(2, '0')}′${s.toString().padStart(2, '0')}″`;
}
export function fmtLST(hours: number) {
  const h = Math.floor(hours);
  const mFloat = (hours - h) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
export function fmtISO(iso: string | null, zone: string) {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    const d = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(dt);
    return `${d} ${t} (${zone})`;
  } catch { return '—'; }
}
export function range(a: number, b: number) { const out:number[]=[]; for(let i=a;i<=b;i++) out.push(i); return out; }
export function daysInMonth(year?: number, month1based?: number) { if (!year || !month1based) return 31; return new Date(year, month1based, 0).getDate(); }
export function normalizeTimezone(tzRaw: string): { tz: string | null, corrected?: string } {
  const tz = (tzRaw || '').trim();
  if (!tz) return { tz: null };
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return { tz }; } catch {}
  if (tz.includes('/')) {
    const parts = tz.split('/');
    const candidate = `${parts[1]}/${parts[0]}`.replace(/\s+/g, '_');
    try { new Intl.DateTimeFormat('en-US', { timeZone: candidate }); return { tz: candidate, corrected: candidate }; } catch {}
  }
  const quickMap: Record<string,string> = {
    'Chicago/America': 'America/Chicago',
    'Kolkata/Asia': 'Asia/Kolkata', 'Calcutta/Asia': 'Asia/Kolkata',
    'Bombay/Asia': 'Asia/Kolkata',  'Madras/Asia': 'Asia/Kolkata',
  };
  if (quickMap[tz]) return { tz: quickMap[tz], corrected: quickMap[tz] };
  return { tz: null };
}

// ----- Pañchāṅga + Aspects -----
const NAK_NAMES = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha',
  'Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'
];
const LORD_SEQ = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
const DEG_PER_NAK = 360/27;
const DEG_PER_PADA = DEG_PER_NAK/4;
const TITHI_15 = ['Pratipada','Dvitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi','Purnima'];
const TITHI_15_KRISHNA_LAST = 'Amavasya';
const YOGAS_27 = [
  'Vishkumbha','Preeti','Ayushman','Saubhagya','Shobhana','Atiganda','Sukarma','Dhriti','Shoola',
  'Ganda','Vriddhi','Dhruva','Vyaghata','Harshana','Vajra','Siddhi','Vyatipata','Variyan',
  'Parigha','Shiva','Siddha','Sadhya','Shubha','Shukla','Brahma','Indra','Vaidhriti'
];
const KARANA_ROT = ['Bava','Balava','Kaulava','Taitila','Garaja','Vanija','Vishti'];
const KARANA_END = ['Shakuni','Chatushpada','Naga'];
function jdToDate(jd_ut: number) { const ms = (jd_ut - 2440587.5) * 86400000; return new Date(ms); }
function nakForDeg(deg: number) {
  const L = norm360(deg);
  const idx = Math.floor(L / DEG_PER_NAK);
  const within = L - idx*DEG_PER_NAK;
  const pada = Math.floor(within / DEG_PER_PADA) + 1;
  const lord = LORD_SEQ[idx % 9];
  return { index: idx, name: NAK_NAMES[idx], pada, lord };
}
export function panchangaFrom(out: ChartOut | null) {
  if (!out) return null;
  const sun = out.positions['Sun'];
  const moon = out.positions['Moon'];
  if (!Number.isFinite(sun) || !Number.isFinite(moon)) return null;
  const birthUTC = jdToDate(out.jd_ut);
  const vara = new Intl.DateTimeFormat('en-US', { weekday:'long', timeZone: out.timezone }).format(birthUTC);
  const diff = norm360(moon - sun);
  const tithiNum = Math.floor(diff / 12) + 1; // 1..30
  const paksha = tithiNum <= 15 ? 'Shukla' : 'Krishna';
  const idx15 = (tithiNum - 1) % 15;
  const tithiName = paksha === 'Shukla' ? TITHI_15[idx15] : (idx15 === 14 ? TITHI_15_KRISHNA_LAST : TITHI_15[idx15]);
  const nk = nakForDeg(moon);
  const yogaAngle = norm360(moon + sun);
  const yogaIdx = Math.floor(yogaAngle / DEG_PER_NAK);
  const yogaName = YOGAS_27[yogaIdx];
  const karIdx = Math.floor(diff / 6);
  let karanaName = '';
  if (karIdx === 0) karanaName = 'Kimstughna';
  else if (karIdx >= 57) karanaName = KARANA_END[karIdx - 57];
  else karanaName = KARANA_ROT[(karIdx - 1) % 7];
  return { vara, tithiNum, tithiName, paksha, nakshatra: nk.name, pada: nk.pada, yoga: yogaName, karana: karanaName };
}

const ASPECTS_DEF: Array<{name:string, angle:number, orb:number}> = [
  { name:'Conjunction', angle:0,   orb:6 },
  { name:'Opposition',  angle:180, orb:6 },
  { name:'Trine',       angle:120, orb:5 },
  { name:'Square',      angle:90,  orb:5 },
  { name:'Sextile',     angle:60,  orb:4 },
];
function angDiff(a:number,b:number) { const d = Math.abs(norm360(a) - norm360(b)); return Math.min(d, 360 - d); }
export function deriveAscAspects(out: ChartOut) {
  const asc = out.ascendant;
  const pairs: AspectPair[] = [];
  for (const [n, deg] of Object.entries(out.positions)) {
    if (!Number.isFinite(deg)) continue;
    const d = angDiff(asc, deg as number);
    for (const A of ASPECTS_DEF) {
      if (Math.abs(d - A.angle) <= A.orb) { pairs.push({ a:'Ascendant', b:n, type:A.name, delta: +(d - A.angle).toFixed(2) }); break; }
    }
  }
  return pairs;
}
export function mergeAspects(existing: AspectPair[], ascOnes: AspectPair[]) {
  const key = (p:AspectPair) => [p.a, p.type, p.b].join('|');
  const m = new Map<string,AspectPair>();
  existing.forEach(p => m.set(key(p), p));
  ascOnes.forEach(p => m.set(key(p), p));
  return Array.from(m.values());
}
