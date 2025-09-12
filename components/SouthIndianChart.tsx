'use client';
import React from 'react';

/** --- Local helpers & constants (self-contained) --- */
const SIGN_ABBR = ['Ar','Ta','Ge','Cn','Le','Vi','Li','Sc','Sg','Cp','Aq','Pi'];

const SOUTH_LAYOUT: Array<{sign:number,row:number,col:number}> = [
  {sign:11,row:0,col:0}, // Pisces
  {sign:0 ,row:0,col:1}, // Aries
  {sign:1 ,row:0,col:2}, // Taurus
  {sign:2 ,row:0,col:3}, // Gemini
  {sign:10,row:1,col:0}, // Aquarius
  {sign:3 ,row:1,col:3}, // Cancer
  {sign:9 ,row:2,col:0}, // Capricorn
  {sign:4 ,row:2,col:3}, // Leo
  {sign:8 ,row:3,col:0}, // Sagittarius
  {sign:7 ,row:3,col:1}, // Scorpio
  {sign:6 ,row:3,col:2}, // Libra
  {sign:5 ,row:3,col:3}, // Virgo
];

const PLANET_ABBR: Record<string,string> = {
  Sun:'Sun', Moon:'Moo', Mercury:'Mer', Venus:'Ven', Mars:'Mar',
  Jupiter:'Jup', Saturn:'Sat', Rahu:'Rah', Ketu:'Ket', Uranus:'Ura', Neptune:'Nep', Pluto:'Plu'
};

function norm360(x: number){ return (((x % 360) + 360) % 360); }

/** --- Component --- */
type Props = {
  title: string;
  mode: 'sign' | 'bhava';
  ascDeg?: number;
  positions: Record<string, number>;
};

export default function SouthIndianChart({ title, mode, ascDeg = 0, positions }: Props) {
  // Build 12 boxes
  const boxes = Array.from({length:12}).map((_,i)=>({
    sign: i,
    label: '',
    planets: [] as string[],
  }));

  const ascSign = Math.floor(norm360(ascDeg)/30);

  if (mode === 'sign') {
    boxes.forEach(b => { b.label = SIGN_ABBR[b.sign]; });
    Object.entries(positions).forEach(([name, deg])=>{
      const s = Math.floor(norm360(deg)/30);
      boxes[s].planets.push(PLANET_ABBR[name] ?? name);
    });
    // ASC into asc sign
    boxes[ascSign].planets.unshift('ASC');
  } else {
    boxes.forEach(b => {
      const h = ((b.sign - ascSign + 12) % 12) + 1;
      b.label = `H${h}`;
    });
    Object.entries(positions).forEach(([name, deg])=>{
      const s = Math.floor(norm360(deg)/30);
      const house = ((s - ascSign + 12) % 12) + 1;
      const idx = boxes.findIndex(bb => bb.label === `H${house}`);
      if (idx >= 0) boxes[idx].planets.push(PLANET_ABBR[name] ?? name);
    });
    // ASC into H1
    const idxH1 = boxes.findIndex(bb => bb.label === 'H1');
    if (idxH1 >= 0) boxes[idxH1].planets.unshift('ASC');
  }

  // Place boxes into 4×4 grid using SOUTH_LAYOUT
  const grid: Array<Array<null | typeof boxes[number]>> = Array.from({length:4}).map(()=>Array(4).fill(null));
  SOUTH_LAYOUT.forEach(({sign,row,col}) => { grid[row][col] = boxes[sign]; });

  return (
    <div className="card avoid-break">
      <div style={{fontWeight:800, marginBottom:10, fontSize:18}}>{title}</div>

      <div
        className="charts-grid"
        style={{
          display:'grid',
          gridTemplateColumns:'repeat(4, var(--cell-size))',
          gridTemplateRows:'repeat(4, var(--cell-size))',
          gap:10,
          justifyContent:'center'
        }}
      >
        {grid.map((row, r) => row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className="si-cell"
            style={{
              position:'relative',
              border:'2px solid #111',
              borderRadius:12,
              background:'#fff',
              padding:10,
              display:'flex',
              flexDirection:'column',
              justifyContent:'flex-start',
              alignItems:'stretch',
              overflow:'hidden'        // prevent “bulging” on print/screen
            }}
          >
            {cell && (
              <>
                {/* Tiny sign/house label in the top-left corner */}
                <div
                  className="si-label"
                  style={{
                    position:'absolute',
                    top:6,
                    left:8,
                    fontSize:11,         // smaller & unobtrusive
                    fontWeight:700,
                    opacity:.85
                  }}
                >
                  {cell.label}
                </div>

                {/* Planet chips area (fills the box, wraps, shrinks if crowded) */}
                <div
                  style={{
                    marginTop:20,        // leave space for the corner label
                    display:'flex',
                    flexWrap:'wrap',
                    alignItems:'flex-start',
                    gap:6,
                    width:'100%',
                    flex:1,
                    overflow:'hidden'    // keep content inside the square
                  }}
                >
                  {(() => {
                    const n = cell.planets.length;
                    if (n === 0) {
                      return (
                        <span className="si-label" style={{fontWeight:600, opacity:.9}}>
                          —
                        </span>
                      );
                    }
                    // Dynamic size: many planets → smaller chips
                    const fontPx = n>=7 ? 10 : n>=5 ? 12 : n>=4 ? 14 : 16;
                    const pad = fontPx <= 12 ? '2px 6px' : '4px 8px';
                    return cell.planets.map((p, i) => (
                      <span
                        key={i}
                        className={`si-chip ${p === 'ASC' ? 'si-chip-asc' : ''}`}
                        title={p}
                        style={{
                          fontSize: fontPx,
                          lineHeight: 1.1,
                          padding: pad,
                          border:'2px solid #111',
                          borderRadius:10,
                          fontWeight:800,
                          background: p === 'ASC' ? '#fff1f2' : '#fff',
                          color: p === 'ASC' ? '#b91c1c' : '#111',
                          maxWidth: '100%',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden'
                        }}
                      >
                        {p}
                      </span>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        )))}
      </div>
    </div>
  );
}
