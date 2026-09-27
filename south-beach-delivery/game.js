/* South Beach Delivery: a top-down, GTA 2 style delivery game. */
'use strict';
(() => {
  // ================================================================
  // Utilities
  // ================================================================
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const mapRng = mulberry32(305);
  const mpick = (arr) => arr[Math.floor(mapRng() * arr.length)];
  function hash2(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; }
    else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function angLerp(a, b, t) {
    const d = ((((b - a + PI) % TAU) + TAU) % TAU) - PI;
    return a + d * t;
  }

  // ================================================================
  // Map: a stylised South Beach, Miami Beach
  // West = Biscayne Bay, East = Atlantic Ocean, North = up.
  // ================================================================
  const T = 32; // tile size in world units
  const COLS = 72;
  const STREETS = ['17th St', 'Lincoln Rd', '16th St', '15th St', '14th St', '13th St', '12th St',
    '11th St', '10th St', '9th St', '8th St', '7th St', '6th St', '5th St'];
  const TOP = 5, SPACING = 9, LAST = STREETS.length - 1;
  const sy = (i) => TOP + i * SPACING;
  const ROWS = sy(LAST) + 2 + 8;

  const WATER = 0, SAND = 1, GRASS = 2, ROAD = 3, SIDE = 4, BLDG = 5, PLAZA = 6, LOT = 7, POOL = 8, BLOCK = 9, TOWER = 10, TEMP = 11;
  const SOLID = [1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1];
  const WALKABLE = [0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0];

  const grid = new Uint8Array(COLS * ROWS).fill(BLOCK);
  const segVAt = new Int16Array(COLS * ROWS).fill(-1);
  const segHAt = new Int16Array(COLS * ROWS).fill(-1);
  const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const tileAt = (x, y) => (inMap(x, y) ? grid[y * COLS + x] : BLDG);
  const setT = (x, y, t) => { if (inMap(x, y)) grid[y * COLS + x] = t; };
  function fillR(x0, y0, x1, y1, t, only) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (only === undefined || tileAt(x, y) === only) setT(x, y, t);
    }
  }
  const solidAt = (wx, wy) => SOLID[tileAt(Math.floor(wx / T), Math.floor(wy / T))] === 1;

  const VR = [
    { name: 'Alton Rd', x: 7 },
    { name: 'Meridian Ave', x: 18 },
    { name: 'Washington Ave', x: 29 },
    { name: 'Collins Ave', x: 38 },
    { name: 'Ocean Dr', x: 47 },
  ];

  // Natural features
  fillR(0, 0, 5, ROWS - 1, WATER);            // Biscayne Bay
  fillR(6, 0, 6, ROWS - 1, SIDE);             // bay walk
  fillR(49, 0, 49, ROWS - 1, SIDE);           // Ocean Dr promenade
  fillR(50, 0, 53, ROWS - 1, GRASS);          // Lummus Park
  fillR(54, 0, 54, ROWS - 1, SIDE);           // beach walk
  fillR(55, 0, 62, ROWS - 1, SAND);           // the beach
  fillR(63, 0, COLS - 1, ROWS - 1, WATER);    // Atlantic Ocean
  fillR(0, ROWS - 3, COLS - 1, ROWS - 1, WATER); // Government Cut

  // Road segments
  const segs = [];
  const addSeg = (s) => { s.id = segs.length; s.cross = []; segs.push(s); return s; };
  const vsegs = VR.map((v) => addSeg({ kind: 'v', name: v.name, x0: v.x, y0: sy(0), y1: sy(LAST) + 1 }));
  const hsegs = [];
  STREETS.forEach((name, i) => {
    const y = sy(i);
    if (name === 'Lincoln Rd') {
      hsegs.push(addSeg({ kind: 'h', name, y0: y, x0: VR[2].x, x1: VR[4].x + 1 }));
    } else if (i >= 4 && i <= 6) { // Flamingo Park interrupts 14th-12th
      hsegs.push(addSeg({ kind: 'h', name, y0: y, x0: VR[0].x, x1: VR[1].x + 1 }));
      hsegs.push(addSeg({ kind: 'h', name, y0: y, x0: VR[2].x, x1: VR[4].x + 1 }));
    } else {
      hsegs.push(addSeg({ kind: 'h', name, y0: y, x0: VR[0].x, x1: VR[4].x + 1 }));
    }
  });
  const causeway = addSeg({ kind: 'h', name: 'MacArthur Cswy', y0: sy(LAST), x0: 0, x1: VR[0].x - 1, deco: true });

  for (const s of segs) {
    if (s.kind === 'v') {
      for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x0 + 1; x++) { setT(x, y, ROAD); segVAt[y * COLS + x] = s.id; }
    } else {
      for (let y = s.y0; y <= s.y0 + 1; y++) for (let x = s.x0; x <= s.x1; x++) { setT(x, y, ROAD); segHAt[y * COLS + x] = s.id; }
    }
  }
  for (const v of vsegs) for (const h of hsegs) {
    if (h.x0 <= v.x0 && v.x0 + 1 <= h.x1 && v.y0 <= h.y0 && h.y0 + 1 <= v.y1) { v.cross.push(h); h.cross.push(v); }
  }
  const npcSegs = segs.filter((s) => !s.deco);

  // Lincoln Road pedestrian mall
  const LR = sy(1);
  for (let x = VR[0].x + 2; x < VR[2].x; x++) for (let y = LR; y <= LR + 1; y++) if (tileAt(x, y) === BLOCK) setT(x, y, PLAZA);

  // Sidewalks around every block
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (tileAt(x, y) !== BLOCK) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(x + dx, y + dy);
      if (t === ROAD || t === PLAZA) { near = true; break; }
    }
    if (near) setT(x, y, SIDE);
  }

  // Parks
  const FLAMINGO = { x0: VR[1].x + 2, y0: sy(3) + 2, x1: VR[2].x - 1, y1: sy(7) - 1 };
  fillR(FLAMINGO.x0, FLAMINGO.y0, FLAMINGO.x1, FLAMINGO.y1, GRASS, BLOCK);
  const SOUTHPOINTE = { x0: 31, y0: sy(LAST) + 3, x1: 48, y1: ROWS - 4 };
  fillR(SOUTHPOINTE.x0, SOUTHPOINTE.y0, SOUTHPOINTE.x1, SOUTHPOINTE.y1, GRASS, BLOCK);

  // McDonald's on Collins Ave between 15th & 16th
  const MCD = { tx: 32, ty: sy(2) + 3, tw: 3, th: 3 };
  fillR(MCD.tx, MCD.ty, MCD.tx + 2, MCD.ty + 2, BLDG);
  fillR(MCD.tx + 3, MCD.ty, MCD.tx + 4, MCD.ty + 4, LOT);
  fillR(MCD.tx, MCD.ty + 3, MCD.tx + 2, MCD.ty + 4, LOT);
  const PICKUP = { x: (MCD.tx + 4) * T, y: (MCD.ty + 1.5) * T, name: "McDonald's", addr: 'Collins Ave & 16th St' };

  // Lifeguard towers on the beach
  const buildings = [];
  const pools = [];
  const trees = [];
  const spots = [];
  const TOWER_COLORS = ['#ff5e9c', '#ffd23f', '#3ff0ff', '#7cff6b', '#c77dff', '#ff8c42'];
  [3, 5, 7, 9, 11, 13].forEach((i, n) => {
    const ty = sy(i);
    setT(58, ty, TOWER);
    buildings.push({ x: 58 * T + 5, y: ty * T + 5, w: 22, h: 22, k: 0.07, color: TOWER_COLORS[n], tower: true });
    spots.push({ x: 56.5 * T, y: (ty + 0.5) * T, addr: `Beach @ ${STREETS[i]}`, place: `Lifeguard Tower ${STREETS[i].replace(' St', '')}` });
  });

  // Blocks -> lots -> buildings / pools / parking
  const PALETTE = ['#f6a5c0', '#8fd3c9', '#f9e79f', '#c3aed6', '#a8e6cf', '#ffd3b6', '#ffaaa5',
    '#b5ead7', '#fdfd96', '#f4f1ea', '#9ad0ec', '#ffc8dd', '#bde0fe', '#e9edc9'];
  function makeLot(tx, ty, tw, th) {
    const r = mapRng();
    const east = tx >= VR[3].x + 2 && tx < 49;
    if (east && r < 0.16 && tw >= 2 && th >= 2) {
      fillR(tx, ty, tx + tw - 1, ty + th - 1, POOL);
      pools.push({ x: tx * T, y: ty * T, w: tw * T, h: th * T });
      return;
    }
    if (r > 0.94 && tw * th >= 4) { fillR(tx, ty, tx + tw - 1, ty + th - 1, LOT); return; }
    fillR(tx, ty, tx + tw - 1, ty + th - 1, BLDG);
    let k = 0.06 + mapRng() * 0.1;
    if (tx >= VR[3].x) k += 0.05;
    if (ty < TOP) k += 0.12 + mapRng() * 0.1;
    if (ty > sy(LAST)) k += 0.14 + mapRng() * 0.1;
    const b = { x: tx * T, y: ty * T, w: tw * T, h: th * T, k, color: mpick(PALETTE), tx, ty, tw, th, ac: [] };
    const nAc = Math.floor(mapRng() * 3);
    for (let i = 0; i < nAc; i++) {
      b.ac.push({ x: b.x + 6 + mapRng() * (b.w - 20), y: b.y + 6 + mapRng() * (b.h - 20), s: 6 + mapRng() * 5 });
    }
    b.stripe = mapRng() < 0.35 ? mpick(PALETTE) : null;
    buildings.push(b);
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (tileAt(x, y) !== BLOCK) continue;
    let w = 0; while (tileAt(x + w, y) === BLOCK) w++;
    let h = 1;
    for (;;) { let ok = true; for (let i = 0; i < w; i++) if (tileAt(x + i, y + h) !== BLOCK) { ok = false; break; } if (!ok) break; h++; }
    fillR(x, y, x + w - 1, y + h - 1, TEMP);
    const strips = h >= 4 ? [[y, Math.floor(h / 2)], [y + Math.floor(h / 2), h - Math.floor(h / 2)]] : [[y, h]];
    for (const [sy0, sh] of strips) {
      let cx = x;
      while (cx < x + w) {
        let lw = 2 + Math.floor(mapRng() * 3);
        if (x + w - (cx + lw) < 2) lw = x + w - cx;
        makeLot(cx, sy0, lw, sh);
        cx += lw;
      }
    }
  }
  buildings.push({ x: MCD.tx * T, y: MCD.ty * T, w: MCD.tw * T, h: MCD.th * T, k: 0.07, color: '#da291c', mcd: true, ac: [] });

  // Trees
  const addTree = (x, y, palm = true) => trees.push({ x, y, palm, k: palm ? 0.14 + mapRng() * 0.05 : 0.07, r: mapRng() * TAU, s: 0.85 + mapRng() * 0.3 });
  for (let y = 1; y < ROWS - 3; y += 3) { addTree(50.6 * T, (y + 0.3) * T); addTree(52.7 * T, (y + 1.8) * T); }
  for (let y = 2; y < ROWS - 3; y += 4) addTree(49.5 * T, (y + 0.5) * T);
  for (let y = 2; y < ROWS - 3; y += 5) addTree(6.5 * T, (y + 0.5) * T);
  for (let x = VR[0].x + 3; x < VR[2].x; x += 3) if (tileAt(x, LR) === PLAZA) addTree((x + 0.5) * T, (LR + 1) * T);
  for (let i = 0; i < 26; i++) {
    const x = lerp(FLAMINGO.x0 + 0.5, FLAMINGO.x1 + 0.5, mapRng()) * T, y = lerp(FLAMINGO.y0 + 0.5, FLAMINGO.y1 + 0.5, mapRng()) * T;
    addTree(x, y, mapRng() < 0.4);
  }
  for (let i = 0; i < 14; i++) addTree(lerp(SOUTHPOINTE.x0 + 1, SOUTHPOINTE.x1, mapRng()) * T, lerp(SOUTHPOINTE.y0 + 0.5, SOUTHPOINTE.y1 + 0.5, mapRng()) * T, mapRng() < 0.7);
  const MCD_SIGN = { x: (MCD.tx + 5.5) * T, y: (MCD.ty - 0.4) * T, k: 0.28 };

  // Delivery spots in front of buildings
  const HOTELS = ['Hotel Flamingo Rosa', 'The Azure Palms', 'Coral Deco Inn', 'Neon Tides Hotel', 'The Pastel Pelican',
    'Seabreeze Deco', 'Hotel Miramar Pink', 'The Sunset Gable', 'Casa Marisol', 'The Tropicana Moon', 'Starlite Hotel', 'The Blue Heron'];
  let hotelN = 0;
  const vByName = Object.fromEntries(VR.map((v, i) => [v.name, i]));
  function streetNumberOnAvenue(ty, west) {
    let i = STREETS.findIndex((s, k) => sy(k) > ty);
    let n, top, bot;
    if (i < 0) { n = 4; top = sy(LAST) + 2; bot = ROWS; }
    else { n = STREETS[i] === 'Lincoln Rd' ? 16 : parseInt(STREETS[i], 10); top = i > 0 ? sy(i - 1) + 2 : 0; bot = sy(i); }
    const frac = 1 - (ty - top) / Math.max(1, bot - top);
    let num = n * 100 + (STREETS[i] === 'Lincoln Rd' ? 50 : 0) + Math.floor(frac * 44) * 2;
    return west ? num : num + 1;
  }
  function streetNumberOnStreet(tx, north) {
    const bases = [1100, 800, 500, 200, 100];
    const widths = [100, 300, 300, 300, 100];
    let e = VR.findIndex((v) => v.x > tx);
    if (e < 0) e = 4;
    const east = VR[e].x, west = e > 0 ? VR[e - 1].x + 2 : 0;
    const frac = clamp((east - tx) / Math.max(1, east - west), 0, 1);
    const num = bases[e] + Math.floor(frac * widths[e] / 2) * 2;
    return north ? num + 1 : num;
  }
  for (const b of buildings) {
    if (b.tower || b.mcd) continue;
    const mx = b.tx + Math.floor(b.tw / 2), my = b.ty + Math.floor(b.th / 2);
    const cands = [
      [b.tx + b.tw, my, 1, 0], [b.tx - 1, my, -1, 0], [mx, b.ty + b.th, 0, 1], [mx, b.ty - 1, 0, -1],
    ];
    for (const [sx, syy, dx, dy] of cands) {
      if (tileAt(sx, syy) !== SIDE) continue;
      const nx = sx + dx, ny = syy + dy, nt = tileAt(nx, ny);
      if (nt !== ROAD && nt !== PLAZA) continue;
      let road, addr, place = null;
      if (nt === PLAZA) { road = 'Lincoln Rd'; addr = `${streetNumberOnStreet(sx, dy > 0) + 0} Lincoln Rd Mall`; }
      else if (dx !== 0) {
        const s = segs[segVAt[ny * COLS + nx]]; if (!s) continue;
        road = s.name; addr = `${streetNumberOnAvenue(syy, dx > 0)} ${road}`;
        if (road === 'Ocean Dr') place = HOTELS[hotelN++ % HOTELS.length];
      } else {
        const s = segs[segHAt[ny * COLS + nx]]; if (!s) continue;
        road = s.name; addr = `${streetNumberOnStreet(sx, dy > 0)} ${road}`;
      }
      spots.push({ x: (sx + 0.5) * T, y: (syy + 0.5) * T, addr, place, b });
      break;
    }
  }
  spots.push({ x: (FLAMINGO.x0 + 4.5) * T, y: (FLAMINGO.y0 + 16) * T, addr: 'Meridian Ave & 12th St', place: 'Flamingo Park' });
  spots.push({ x: 42 * T, y: (SOUTHPOINTE.y0 + 2) * T, addr: '1 Washington Ave', place: 'South Pointe Park' });
  spots.push({ x: 3.5 * T, y: (sy(LAST) + 1) * T, addr: 'MacArthur Causeway', place: 'Stranded on the bridge' });

  // ================================================================
  // Canvas & rendering setup
  // ================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, baseScale = 1, RES = 2;
  const CH = 256; // chunk size (world units)
  const chunkCache = new Map();

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    baseScale = clamp(Math.min(W, H) / 340, 0.95, 2.3);
    const newRes = DPR * baseScale >= 1.6 ? 2 : 1;
    if (newRes !== RES) { RES = newRes; chunkCache.clear(); }
  }
  window.addEventListener('resize', resize);
  resize();

  function drawTile(g, tx, ty) {
    const t = tileAt(tx, ty), x = tx * T, y = ty * T, h = hash2(tx, ty);
    switch (t) {
      case WATER: {
        const deep = tx > 40 ? clamp((tx - 63) / 9, 0, 1) : clamp((5 - tx) / 6, 0, 1);
        g.fillStyle = tx > 40 ? `rgb(${30 - deep * 14},${150 - deep * 50},${190 - deep * 30})` : `rgb(${28 - deep * 10},${118 - deep * 30},${168 - deep * 20})`;
        if (ty >= ROWS - 3) g.fillStyle = 'rgb(22,104,160)';
        g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        if (h < 0.5) g.fillRect(x + h * 20, y + 6 + h * 18, 8, 2);
        break;
      }
      case SAND:
        g.fillStyle = '#ecd9a0'; g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(160,120,60,0.18)';
        for (let i = 0; i < 4; i++) g.fillRect(x + hash2(tx * 7 + i, ty) * 30, y + hash2(tx, ty * 5 + i) * 30, 2, 2);
        if (tx >= 61) { g.fillStyle = 'rgba(120,90,50,0.18)'; g.fillRect(x, y, T, T); }
        break;
      case GRASS:
        g.fillStyle = h < 0.5 ? '#54a33e' : '#4f9c3a'; g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(20,70,20,0.3)';
        for (let i = 0; i < 5; i++) g.fillRect(x + hash2(tx * 3 + i, ty) * 30, y + hash2(tx, ty * 3 + i) * 30, 2, 3);
        break;
      case ROAD:
        g.fillStyle = '#3b3b41'; g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,0.03)';
        if (h < 0.3) g.fillRect(x + h * 60, y + 5, 6, 4);
        break;
      case SIDE: case TOWER: case POOL: case TEMP: case BLDG: case BLOCK: {
        if (t === TOWER) { g.fillStyle = '#ecd9a0'; g.fillRect(x, y, T, T); break; }
        if (t === POOL) { g.fillStyle = '#efe8d4'; g.fillRect(x, y, T, T); break; }
        if (t === BLDG) { g.fillStyle = '#2a2a30'; g.fillRect(x, y, T, T); break; }
        g.fillStyle = '#bdb8ad'; g.fillRect(x, y, T, T);
        g.strokeStyle = 'rgba(0,0,0,0.09)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
        g.fillStyle = '#8e897f';
        if (tileAt(tx - 1, ty) === ROAD) g.fillRect(x, y, 3, T);
        if (tileAt(tx + 1, ty) === ROAD) g.fillRect(x + T - 3, y, 3, T);
        if (tileAt(tx, ty - 1) === ROAD) g.fillRect(x, y, T, 3);
        if (tileAt(tx, ty + 1) === ROAD) g.fillRect(x, y + T - 3, T, 3);
        break;
      }
      case PLAZA:
        g.fillStyle = (tx + ty) % 2 ? '#d9a47e' : '#cf9670'; g.fillRect(x, y, T, T);
        break;
      case LOT:
        g.fillStyle = '#48484f'; g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(x, y + 4, 2, T - 8);
        break;
    }
  }

  function drawMarkings(g, tx0, ty0, tx1, ty1) {
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(tx, ty) !== ROAD) continue;
      const i = ty * COLS + tx, v = segVAt[i], h = segHAt[i];
      const x = tx * T, y = ty * T;
      if (v >= 0 && h < 0) {
        const s = segs[v];
        const nearX = (inMap(tx, ty - 1) && segHAt[i - COLS] >= 0) || (inMap(tx, ty + 1) && segHAt[i + COLS] >= 0);
        if (nearX) {
          g.fillStyle = 'rgba(245,245,245,0.85)';
          for (let k = 0; k < 4; k++) g.fillRect(x + 3 + k * 8, y + 5, 4, T - 10);
        } else if (tx === s.x0) {
          g.fillStyle = '#e8c547';
          g.fillRect(x + T - 1.5, y + 3, 3, 10); g.fillRect(x + T - 1.5, y + 19, 3, 10);
        }
      } else if (h >= 0 && v < 0) {
        const s = segs[h];
        const nearX = (inMap(tx - 1, ty) && segVAt[i - 1] >= 0) || (inMap(tx + 1, ty) && segVAt[i + 1] >= 0);
        if (nearX && !s.deco) {
          g.fillStyle = 'rgba(245,245,245,0.85)';
          for (let k = 0; k < 4; k++) g.fillRect(x + 5, y + 3 + k * 8, T - 10, 4);
        } else if (ty === s.y0) {
          g.fillStyle = '#e8c547';
          g.fillRect(x + 3, y + T - 1.5, 10, 3); g.fillRect(x + 19, y + T - 1.5, 10, 3);
        }
        if (s.deco) { // causeway railings
          g.fillStyle = '#9b9ba3';
          if (ty === s.y0) g.fillRect(x, y, T, 3);
          else g.fillRect(x, y + T - 3, T, 3);
        }
      }
    }
  }

  function renderChunk(cx, cy) {
    const c = document.createElement('canvas');
    c.width = c.height = CH * RES;
    const g = c.getContext('2d');
    g.scale(RES, RES);
    g.translate(-cx * CH, -cy * CH);
    const n = CH / T, tx0 = cx * n, ty0 = cy * n, tx1 = tx0 + n - 1, ty1 = ty0 + n - 1;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) drawTile(g, tx, ty);
    drawMarkings(g, tx0, ty0, tx1, ty1);
    for (const p of pools) {
      if (p.x > (tx1 + 1) * T || p.x + p.w < tx0 * T || p.y > (ty1 + 1) * T || p.y + p.h < ty0 * T) continue;
      g.fillStyle = '#2fb6d9'; rr(g, p.x + 6, p.y + 6, p.w - 12, p.h - 12, 6); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(p.x + 12, p.y + p.h / 2); g.lineTo(p.x + p.w - 12, p.y + p.h / 2 - 4); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(p.x + 2, p.y + 2, 6, 10); g.fillRect(p.x + p.w - 8, p.y + p.h - 12, 6, 10);
    }
    // McDonald's lot decorations
    if (MCD.tx * T < (tx1 + 1) * T && (MCD.tx + 5) * T > tx0 * T && MCD.ty * T < (ty1 + 1) * T && (MCD.ty + 5) * T > ty0 * T) {
      g.fillStyle = 'rgba(255,199,44,0.9)';
      g.font = 'bold 9px Arial, sans-serif'; g.textAlign = 'center';
      g.save(); g.translate(PICKUP.x + 10, PICKUP.y + 36); g.rotate(-PI / 2); g.fillText('DRIVE THRU', 0, 0); g.restore();
      g.strokeStyle = 'rgba(255,199,44,0.8)'; g.lineWidth = 2; g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(PICKUP.x, (MCD.ty + 4.6) * T); g.lineTo(PICKUP.x, (MCD.ty - 0) * T + 4); g.stroke(); g.setLineDash([]);
    }
    return c;
  }
  function getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunkCache.get(key);
    if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
    c = renderChunk(cx, cy);
    chunkCache.set(key, c);
    if (chunkCache.size > 56) chunkCache.delete(chunkCache.keys().next().value);
    return c;
  }

  // Minimap (pre-rendered)
  const MM = 3;
  const mmCanvas = document.createElement('canvas');
  mmCanvas.width = COLS * MM; mmCanvas.height = ROWS * MM;
  {
    const g = mmCanvas.getContext('2d');
    const col = { [WATER]: '#1d6fa6', [SAND]: '#e4cf8f', [GRASS]: '#4c9a3a', [ROAD]: '#d9d9d9', [SIDE]: '#6a6a70', [BLDG]: '#3a3440', [PLAZA]: '#c98f6a', [LOT]: '#77777d', [POOL]: '#3fc6e0', [TOWER]: '#ff5e9c', [TEMP]: '#3a3440', [BLOCK]: '#3a3440' };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.fillStyle = col[tileAt(x, y)]; g.fillRect(x * MM, y * MM, MM, MM); }
    g.fillStyle = '#da291c'; g.fillRect(MCD.tx * MM, MCD.ty * MM, MCD.tw * MM, MCD.th * MM);
  }

  // ================================================================
  // Audio (WebAudio synth, no files)
  // ================================================================
  const Snd = {
    ac: null, master: null, eng: null, engGain: null, engFilter: null, muted: false,
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ac = new AC();
        this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ac.destination);
        this.eng = this.ac.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 45;
        this.engFilter = this.ac.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
        this.engGain = this.ac.createGain(); this.engGain.gain.value = 0;
        this.eng.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
        this.eng.start();
      } catch (e) { this.ac = null; }
    },
    engine(speed, throttle, on) {
      if (!this.ac) return;
      const t = this.ac.currentTime;
      this.eng.frequency.setTargetAtTime(42 + speed * 0.3 + (throttle > 0 ? 14 : 0), t, 0.06);
      this.engFilter.frequency.setTargetAtTime(380 + speed * 2.2, t, 0.1);
      this.engGain.gain.setTargetAtTime(on ? 0.05 + Math.min(speed, 330) / 330 * 0.03 : 0, t, 0.12);
    },
    tone(freq, dur, type = 'square', vol = 0.12, delay = 0, slide = 0) {
      if (!this.ac) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator(), gn = this.ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3) {
      if (!this.ac) return;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), gn = this.ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; gn.gain.value = vol;
      src.connect(f); f.connect(gn); gn.connect(this.master); src.start();
    },
    crash(v) { this.noise(0.25, clamp(v / 400, 0.1, 0.5)); this.tone(90, 0.2, 'triangle', 0.2, 0, -40); },
    pickup() { this.tone(660, 0.1, 'square', 0.1); this.tone(880, 0.1, 'square', 0.1, 0.1); this.tone(1320, 0.18, 'square', 0.1, 0.2); },
    cash() { this.tone(988, 0.08, 'square', 0.12); this.tone(1319, 0.35, 'square', 0.12, 0.08); this.noise(0.08, 0.1); },
    honk() { this.tone(392, 0.25, 'square', 0.05); this.tone(494, 0.25, 'square', 0.04); },
    hey() { this.tone(520, 0.12, 'triangle', 0.1, 0, 200); },
    warn() { this.tone(440, 0.12, 'square', 0.08); this.tone(440, 0.12, 'square', 0.08, 0.2); },
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },
  };

  // ================================================================
  // Input: keyboard + touch
  // ================================================================
  const keys = {};
  const touchKeys = { left: false, right: false, gas: false, brake: false, hb: false };
  const touchEl = document.getElementById('touch');
  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    keys[k] = true;
    if (e.repeat) return;
    if (k === 'KeyP' || k === 'Escape') togglePause();
    if (k === 'KeyM') toggleMute();
    if ((k === 'Enter' || k === 'Space') && game.state === 'title') startGame();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const pointers = new Map();
  const keyAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const b = el && el.closest ? el.closest('[data-key]') : null;
    return b ? b.dataset.key : null;
  };
  const touchButtons = [...touchEl.querySelectorAll('[data-key]')];
  function refreshTouch() {
    for (const k in touchKeys) touchKeys[k] = false;
    for (const v of pointers.values()) if (v) touchKeys[v] = true;
    for (const b of touchButtons) b.classList.toggle('on', touchKeys[b.dataset.key]);
  }
  touchEl.addEventListener('pointerdown', (e) => {
    const k = keyAt(e.clientX, e.clientY);
    if (!k) return;
    e.preventDefault();
    pointers.set(e.pointerId, k);
    refreshTouch();
  });
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, keyAt(e.clientX, e.clientY));
    refreshTouch();
  });
  for (const t of ['pointerup', 'pointercancel']) {
    window.addEventListener(t, (e) => { if (pointers.delete(e.pointerId)) refreshTouch(); });
  }
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  let isTouch = false;
  function enableTouch() {
    if (isTouch) return;
    isTouch = true;
    document.body.classList.add('is-touch');
    touchEl.hidden = false;
  }
  if ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });

  function readInput() {
    const up = keys.KeyW || keys.ArrowUp || touchKeys.gas;
    const down = keys.KeyS || keys.ArrowDown || touchKeys.brake;
    const left = keys.KeyA || keys.ArrowLeft || touchKeys.left;
    const right = keys.KeyD || keys.ArrowRight || touchKeys.right;
    return { throttle: (up ? 1 : 0) - (down ? 1 : 0), steer: (right ? 1 : 0) - (left ? 1 : 0), hb: !!(keys.Space || touchKeys.hb) };
  }

  // ================================================================
  // Entities
  // ================================================================
  const MAX_SPEED = 330;
  const car = { x: 0, y: 0, a: 0, vx: 0, vy: 0, steer: 0, w: 17, l: 32, brake: false };
  const CAR_R = 9.5, CAR_OFF = 8;

  const npcs = [];
  const DIRV = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const ANG = { N: 0, E: PI / 2, S: PI, W: -PI / 2 };
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const POS = { N: false, S: true, E: true, W: false };
  const extent = (s) => (s.kind === 'v' ? [s.y0 * T, (s.y1 + 1) * T] : [s.x0 * T, (s.x1 + 1) * T]);
  const laneC = (s, d) => (s.kind === 'v' ? (s.x0 + (d === 'N' ? 1.5 : 0.5)) * T : (s.y0 + (d === 'E' ? 1.5 : 0.5)) * T);
  const NPC_COLORS = ['#d7263d', '#1b998b', '#f46036', '#2e294e', '#ffffff', '#151515', '#6a4c93', '#ff70a6', '#3a86ff', '#8ac926', '#c0c0c0', '#0f4c5c', '#e36414'];

  function spawnNPC() {
    for (let tries = 0; tries < 40; tries++) {
      const s = pick(npcSegs);
      const d = s.kind === 'v' ? pick(['N', 'S']) : pick(['E', 'W']);
      const [a, b] = extent(s);
      const along = rand(a + T * 2, b - T * 2);
      const x = s.kind === 'v' ? laneC(s, d) : along, y = s.kind === 'v' ? along : laneC(s, d);
      if (Math.hypot(x - car.x, y - car.y) < 250) continue;
      if (npcs.some((n) => Math.hypot(n.x - x, n.y - y) < 70)) continue;
      const r = Math.random();
      const type = r < 0.14 ? 'taxi' : r < 0.26 ? 'conv' : r < 0.36 ? 'van' : 'car';
      const body = type === 'taxi' ? '#ffcf1f' : type === 'conv' ? pick(['#ff70a6', '#3ff0ff', '#ffffff', '#d7263d']) : pick(NPC_COLORS);
      npcs.push({
        seg: s, dir: d, x, y, a: ANG[d], speed: 0, max: rand(95, 150), type, body, roof: shade(body, 1.15),
        w: type === 'van' ? 19 : 17, l: type === 'van' ? 38 : 32, stuck: 0, ghost: 0, stun: 0, honkT: 0, ignore: null, blocked: false,
      });
      return;
    }
  }

  function moveNPC(n, dist) {
    const s = n.seg, vert = s.kind === 'v', sign = POS[n.dir] ? 1 : -1;
    const prev = vert ? n.y : n.x, next = prev + sign * dist;
    let best = null, bestD = Infinity;
    for (const P of s.cross) {
      if (P === n.ignore) continue;
      for (const d2 of vert ? ['E', 'W'] : ['N', 'S']) {
        const c = laneC(P, d2), rel = (c - prev) * sign;
        if (rel > 0 && rel <= dist && rel < bestD) { bestD = rel; best = { P, d2, c }; }
      }
    }
    const [a, b] = extent(s);
    if (!best) {
      if (vert) n.y = next; else n.x = next;
      const p = vert ? n.y : n.x;
      if (p < a + 4 || p > b - 4) { // safety net: turn around
        n.dir = OPP[n.dir];
        if (vert) { n.y = clamp(n.y, a + 4, b - 4); n.x = laneC(s, n.dir); } else { n.x = clamp(n.x, a + 4, b - 4); n.y = laneC(s, n.dir); }
        n.ignore = null;
      }
      return;
    }
    const { P, d2, c } = best;
    const canStraight = (sign > 0 ? b - c : c - a) > T;
    const our = vert ? n.x : n.y;
    const [pa, pb] = extent(P);
    const canTurn = (POS[d2] ? pb - our : our - pa) > 2 * T;
    n.ignore = null;
    let choice = 'u';
    if (canStraight && canTurn) choice = Math.random() < 0.6 ? 's' : 't';
    else if (canStraight) choice = 's';
    else if (canTurn) choice = 't';
    if (choice === 's') { if (vert) n.y = next; else n.x = next; }
    else if (choice === 't') { if (vert) n.y = c; else n.x = c; n.ignore = s; n.seg = P; n.dir = d2; }
    else {
      if (vert) { n.y = c; n.x = laneC(s, OPP[n.dir]); } else { n.x = c; n.y = laneC(s, OPP[n.dir]); }
      n.dir = OPP[n.dir];
    }
  }

  function updateNPCs(dt, playing) {
    for (const n of npcs) {
      const [fx, fy] = DIRV[n.dir];
      let blocked = false, byPlayer = false;
      const check = (ox, oy, maxAlong, maxLat) => {
        const dx = ox - n.x, dy = oy - n.y;
        const along = dx * fx + dy * fy;
        if (along <= 0 || along > maxAlong) return false;
        return Math.abs(-dx * fy + dy * fx) < maxLat;
      };
      if (playing && check(car.x, car.y, 46, 17)) { blocked = true; byPlayer = true; }
      if (!blocked && n.ghost <= 0) {
        for (const o of npcs) { if (o !== n && check(o.x, o.y, 44, 15)) { blocked = true; break; } }
      }
      if (!blocked) {
        for (const p of peds) { if (p.state !== 'down' && check(p.x, p.y, 28, 11)) { blocked = true; break; } }
      }
      n.blocked = blocked;
      let target = blocked ? 0 : n.max;
      if (n.stun > 0) { n.stun -= dt; target = 0; }
      n.speed = n.speed < target ? Math.min(target, n.speed + 160 * dt) : Math.max(target, n.speed - 520 * dt);
      if (blocked && n.speed < 5) n.stuck += dt; else n.stuck = 0;
      if (n.ghost > 0) n.ghost -= dt;
      if (n.stuck > 2.5 && !byPlayer) { n.ghost = 1.2; n.stuck = 0; }
      n.honkT -= dt;
      if (byPlayer && n.stuck > 1.2 && n.honkT <= 0) {
        n.honkT = 3.5;
        if (Math.hypot(n.x - car.x, n.y - car.y) < 200) { Snd.honk(); addFloat(n.x, n.y - 20, 'HONK!', '#fff'); }
      }
      if (n.speed > 0) moveNPC(n, n.speed * dt);
      n.a = angLerp(n.a, ANG[n.dir], 1 - Math.exp(-10 * dt));
    }
  }

  // Pedestrians
  const peds = [];
  const SHIRTS = ['#ff5e9c', '#3ff0ff', '#ffd23f', '#7cff6b', '#ffffff', '#ff8c42', '#c77dff', '#e63946', '#2a9d8f', '#f4a261'];
  const SKINS = ['#f1c9a5', '#d9a47e', '#a86b48', '#6b4230', '#e8b58f'];
  function spawnPed() {
    for (let tries = 0; tries < 60; tries++) {
      let tx, ty;
      if (Math.random() < 0.35) { tx = Math.floor(rand(50, 62)); ty = Math.floor(rand(0, ROWS - 3)); }
      else { tx = Math.floor(rand(6, 55)); ty = Math.floor(rand(0, ROWS - 3)); }
      if (!WALKABLE[tileAt(tx, ty)]) continue;
      peds.push({ x: (tx + rand(0.2, 0.8)) * T, y: (ty + rand(0.2, 0.8)) * T, a: rand(0, TAU), spd: rand(16, 30), t: rand(1, 4), state: 'walk', downT: 0, step: rand(0, 10), shirt: pick(SHIRTS), skin: pick(SKINS), pants: pick(['#264653', '#1d3557', '#6d597a', '#e9c46a', '#222']) });
      return;
    }
  }
  function updatePeds(dt, playing) {
    const cs = Math.hypot(car.vx, car.vy);
    const fx = Math.sin(car.a), fy = -Math.cos(car.a);
    for (const p of peds) {
      if (p.state === 'down') { p.downT -= dt; if (p.downT <= 0) { p.state = 'walk'; p.t = rand(1, 3); } continue; }
      if (playing) {
        const dx = p.x - car.x, dy = p.y - car.y, d = Math.hypot(dx, dy);
        if (cs > 70 && d < 75 && dx * fx + dy * fy > -10 && p.state !== 'flee') {
          const side = (dx * -fy + dy * fx) >= 0 ? 1 : -1; // right side of car
          p.a = Math.atan2(fx * side, -fy * side); // perpendicular away
          p.spd = 100; p.state = 'flee'; p.t = 0.8;
        }
        // collision with car
        for (const sgn of [1, -1]) {
          const cx = car.x + fx * CAR_OFF * sgn, cy = car.y + fy * CAR_OFF * sgn;
          const ex = p.x - cx, ey = p.y - cy, ed = Math.hypot(ex, ey) || 0.01;
          if (ed < CAR_R + 4) {
            if (cs > 45) {
              p.state = 'down'; p.downT = 2.5; p.a = Math.atan2(ey, ex);
              p.x += (ex / ed) * 14; p.y += (ey / ed) * 14;
              addFloat(p.x, p.y - 14, pick(['HEY!', 'OUCH!', 'WATCH IT!', '¡OYE!']), '#ffec5c');
              Snd.hey();
              if (game.phase === 'deliver') damageMeal(3);
            } else { p.x += (ex / ed) * (CAR_R + 4 - ed); p.y += (ey / ed) * (CAR_R + 4 - ed); }
            break;
          }
        }
        if (p.state === 'down') continue;
      }
      const nx = p.x + Math.cos(p.a) * p.spd * dt, ny = p.y + Math.sin(p.a) * p.spd * dt;
      const tt = tileAt(Math.floor(nx / T), Math.floor(ny / T));
      const ok = p.state === 'flee' ? !SOLID[tt] : WALKABLE[tt];
      if (ok) { p.x = nx; p.y = ny; p.step += p.spd * dt * 0.35; }
      else { p.a = rand(0, TAU); p.t = rand(0.5, 2); if (p.state === 'flee') p.state = 'walk'; }
      p.t -= dt;
      if (p.t <= 0) { p.state = 'walk'; p.a += rand(-1.3, 1.3); p.spd = rand(16, 30); p.t = rand(2, 5); }
    }
  }

  // ================================================================
  // Game state & mission logic
  // ================================================================
  const CUSTOMERS = ['Maria', 'Carlos', 'Jess', 'Dmitri', 'Ana', 'Luis', 'Tiffany', 'Marco', 'Yolanda', 'Andre', 'Sofia', 'Kenny',
    'Isabel', 'Rico', 'Gloria', 'Tony', 'Priya', 'Omar', 'Becca', 'Julio', 'Nadia', 'Vince', 'Lupe', 'Hector', 'Chloe', 'Big Mike'];
  const MENU = ['Big Mac', '10pc McNuggets', 'Large Fries', 'McFlurry', 'Quarter Pounder', 'Filet-O-Fish', 'Happy Meal',
    'Iced Coffee', 'McChicken', 'Apple Pie', 'Sausage McMuffin', 'Large Coke', 'Double Cheeseburger'];

  const game = {
    state: 'title', cash: 0, deliveries: 0, streak: 0, phase: 'pickup', order: null, orderNo: 100, hold: 0,
    msg: null, floats: [], skids: [], shake: 0, time: 0, lastDest: null, lateWarned: false, slowHintT: 0,
  };
  const cam = { x: PICKUP.x, y: PICKUP.y, zoom: 1 };

  let best = { cash: 0, deliveries: 0 };
  try { best = JSON.parse(localStorage.getItem('sbd_best')) || best; } catch (e) { /* storage unavailable */ }
  function saveBest() {
    if (game.cash > best.cash) best = { cash: game.cash, deliveries: game.deliveries };
    try { localStorage.setItem('sbd_best', JSON.stringify(best)); } catch (e) { /* ignore */ }
  }
  function showBest() {
    document.getElementById('best').textContent = best.cash > 0 ? `Best shift: $${best.cash} · ${best.deliveries} deliveries` : '';
  }
  showBest();

  function addFloat(x, y, text, color) { game.floats.push({ x, y, text, color, t: 1.3 }); }
  function bigMsg(title, sub, color = '#ffd23f', t = 2.6) { game.msg = { title, sub, color, t, max: t }; }
  function damageMeal(n) {
    if (!game.order || game.phase !== 'deliver') return;
    const before = game.order.cond;
    game.order.cond = Math.max(0, game.order.cond - n);
    if (Math.floor(before) !== Math.floor(game.order.cond)) addFloat(car.x, car.y - 26, `-${Math.round(n)}% MEAL`, '#ff6b6b');
  }

  function newOrder() {
    let dest;
    for (let i = 0; i < 50; i++) {
      dest = pick(spots);
      if (dest !== game.lastDest && Math.hypot(dest.x - PICKUP.x, dest.y - PICKUP.y) > 650) break;
    }
    game.lastDest = dest;
    const dist = Math.abs(dest.x - PICKUP.x) + Math.abs(dest.y - PICKUP.y);
    const items = [];
    const nItems = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nItems; i++) { const it = pick(MENU); if (!items.includes(it)) items.push(it); }
    game.orderNo++;
    return {
      no: game.orderNo, dest, dist, items, cond: 100,
      customer: `${pick(CUSTOMERS)} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`,
      timeLimit: Math.round(12 + dist / 185), timeLeft: 0,
    };
  }

  function startGame() {
    Snd.init();
    document.getElementById('start').hidden = true;
    document.getElementById('pause').hidden = true;
    game.state = 'play';
    game.cash = 0; game.deliveries = 0; game.streak = 0; game.hold = 0; game.floats = []; game.skids = [];
    game.phase = 'pickup'; game.order = newOrder(); game.lateWarned = false;
    car.x = (VR[3].x + 1.5) * T; car.y = (MCD.ty + 3) * T; car.a = 0; car.vx = car.vy = 0; car.steer = 0;
    cam.x = car.x; cam.y = car.y; cam.zoom = 1;
    npcs.length = 0;
    for (let i = 0; i < 30; i++) spawnNPC();
    bigMsg('SHIFT STARTED', `Order #${game.order.no} is waiting at McDonald's`, '#3ff0ff', 3);
  }

  function togglePause() {
    if (game.state === 'play') {
      game.state = 'paused';
      document.getElementById('pauseStats').textContent = `$${game.cash} earned · ${game.deliveries} deliveries`;
      document.getElementById('pause').hidden = false;
      Snd.engine(0, 0, false);
    } else if (game.state === 'paused') {
      game.state = 'play';
      document.getElementById('pause').hidden = true;
      Snd.init();
    }
  }
  function toggleMute() {
    Snd.setMuted(!Snd.muted);
    document.getElementById('btnMute').textContent = Snd.muted ? '🔇' : '🔊';
  }
  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnResume').addEventListener('click', togglePause);
  document.getElementById('btnRestart').addEventListener('click', () => { saveBest(); startGame(); });
  document.getElementById('btnPause').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
  document.getElementById('btnMute').addEventListener('click', (e) => { e.currentTarget.blur(); toggleMute(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') togglePause(); });

  function target() { return game.phase === 'pickup' ? PICKUP : game.order.dest; }

  function updateMission(dt) {
    const o = game.order;
    if (game.phase === 'deliver') {
      const wasLate = o.timeLeft <= 0;
      o.timeLeft -= dt;
      if (!wasLate && o.timeLeft <= 0 && !game.lateWarned) { game.lateWarned = true; bigMsg("YOU'RE LATE!", 'No tip now, but still deliver it', '#ff5e5e', 2.2); Snd.warn(); }
    }
    const tg = target();
    const d = Math.hypot(car.x - tg.x, car.y - tg.y);
    const spd = Math.hypot(car.vx, car.vy);
    if (d < 28) {
      if (spd < 55) game.hold += dt;
      else { game.hold = Math.max(0, game.hold - dt); game.slowHintT = 0.6; }
    } else game.hold = 0;
    if (game.slowHintT > 0) game.slowHintT -= dt;
    if (game.hold >= 0.55) {
      game.hold = 0;
      if (game.phase === 'pickup') {
        game.phase = 'deliver';
        o.timeLeft = o.timeLimit;
        game.lateWarned = false;
        Snd.pickup();
        bigMsg('ORDER UP!', `Deliver to ${o.customer} · ${o.dest.place || o.dest.addr}`, '#ffc72c', 3);
        addFloat(car.x, car.y - 24, '+ FOOD', '#ffc72c');
      } else {
        const onTime = o.timeLeft > 0;
        let base = 5 + Math.round(o.dist / 260);
        let tip = 0;
        if (onTime) {
          game.streak++;
          tip = Math.round((3 + 9 * (o.timeLeft / o.timeLimit)) * (o.cond / 100) * (1 + 0.25 * Math.min(game.streak - 1, 4)));
        } else { game.streak = 0; base = Math.ceil(base / 2); }
        const total = base + tip;
        game.cash += total; game.deliveries++;
        saveBest();
        Snd.cash();
        const sub = onTime ? `Pay $${base} + tip $${tip} · meal ${Math.round(o.cond)}%${game.streak > 1 ? ` · streak x${game.streak}` : ''}` : `Late! Pay $${base}, no tip`;
        bigMsg(`DELIVERED! +$${total}`, sub, onTime ? '#7cff6b' : '#ffb347', 3);
        addFloat(car.x, car.y - 24, `+$${total}`, '#7cff6b');
        game.phase = 'pickup';
        game.order = newOrder();
      }
    }
  }

  // ================================================================
  // Player physics
  // ================================================================
  function terrain(x, y) {
    switch (tileAt(Math.floor(x / T), Math.floor(y / T))) {
      case ROAD: case LOT: return [1, 1];
      case SIDE: return [0.8, 1];
      case PLAZA: return [0.75, 1];
      case GRASS: return [0.6, 0.65];
      case SAND: return [0.48, 0.5];
      default: return [1, 1];
    }
  }
  function collideTiles() {
    let hit = 0;
    const fx = Math.sin(car.a), fy = -Math.cos(car.a);
    for (const sgn of [1, -1]) {
      let cx = car.x + fx * CAR_OFF * sgn, cy = car.y + fy * CAR_OFF * sgn;
      const tx0 = Math.floor((cx - CAR_R) / T), tx1 = Math.floor((cx + CAR_R) / T);
      const ty0 = Math.floor((cy - CAR_R) / T), ty1 = Math.floor((cy + CAR_R) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!SOLID[tileAt(tx, ty)]) continue;
        const px = clamp(cx, tx * T, tx * T + T), py = clamp(cy, ty * T, ty * T + T);
        let dx = cx - px, dy = cy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= CAR_R * CAR_R) continue;
        let nx, ny, pen;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = CAR_R - d; }
        else {
          const ox = cx - (tx + 0.5) * T, oy = cy - (ty + 0.5) * T;
          if (Math.abs(ox) > Math.abs(oy)) { nx = Math.sign(ox) || 1; ny = 0; pen = CAR_R + T / 2 - Math.abs(ox); }
          else { nx = 0; ny = Math.sign(oy) || 1; pen = CAR_R + T / 2 - Math.abs(oy); }
        }
        car.x += nx * pen; car.y += ny * pen; cx += nx * pen; cy += ny * pen;
        const vn = car.vx * nx + car.vy * ny;
        if (vn < 0) { hit = Math.max(hit, -vn); car.vx -= nx * vn * 1.3; car.vy -= ny * vn * 1.3; car.vx *= 0.93; car.vy *= 0.93; }
      }
    }
    return hit;
  }
  function collideCars() {
    let hit = 0, who = null;
    const fx = Math.sin(car.a), fy = -Math.cos(car.a);
    for (const n of npcs) {
      if (Math.abs(n.x - car.x) > 60 || Math.abs(n.y - car.y) > 60) continue;
      const nfx = Math.sin(n.a), nfy = -Math.cos(n.a), no = n.l / 2 - 8;
      for (const s1 of [1, -1]) for (const s2 of [1, 0, -1]) {
        const cx = car.x + fx * CAR_OFF * s1, cy = car.y + fy * CAR_OFF * s1;
        const qx = n.x + nfx * no * s2, qy = n.y + nfy * no * s2;
        const dx = cx - qx, dy = cy - qy, d = Math.hypot(dx, dy), R = CAR_R + 9;
        if (d >= R || d < 1e-4) continue;
        const nx = dx / d, ny = dy / d;
        car.x += nx * (R - d); car.y += ny * (R - d);
        const vn = car.vx * nx + car.vy * ny;
        if (vn < 0) { hit = Math.max(hit, -vn); who = n; car.vx -= nx * vn * 1.4; car.vy -= ny * vn * 1.4; car.vx *= 0.9; car.vy *= 0.9; }
      }
    }
    if (who && hit > 60) who.stun = 0.9;
    return hit;
  }

  function updatePlayer(dt, inp) {
    const fx = Math.sin(car.a), fy = -Math.cos(car.a), rx = -fy, ry = fx;
    let vf = car.vx * fx + car.vy * fy, vr = car.vx * rx + car.vy * ry;
    const [tmax, tgrip] = terrain(car.x, car.y);
    const maxF = MAX_SPEED * tmax, maxR = -115 * tmax;
    if (inp.throttle > 0) vf += (vf < 0 ? 650 : 250 * (1 - 0.45 * clamp(vf / maxF, 0, 1))) * dt;
    else if (inp.throttle < 0) vf -= (vf > 0 ? 620 : 210) * dt;
    else { const d = 85 * dt; vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf) * d; }
    if (inp.hb) { const d = 240 * dt; vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf) * d; }
    if (vf > maxF) vf = lerp(vf, maxF, 1 - Math.exp(-3 * dt));
    if (vf < maxR) vf = lerp(vf, maxR, 1 - Math.exp(-3 * dt));
    vr *= Math.exp(-(inp.hb ? 1.4 : 9 * tgrip) * dt);
    car.steer = lerp(car.steer, inp.steer, 1 - Math.exp(-14 * dt));
    const sf = clamp(vf / 85, -1, 1) * (1 - 0.3 * clamp(Math.abs(vf) / MAX_SPEED, 0, 1));
    car.a += car.steer * 3.0 * sf * (inp.hb ? 1.45 : 1) * dt;
    car.vx = fx * vf + rx * vr; car.vy = fy * vf + ry * vr;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.brake = (inp.throttle < 0 && vf > 5) || inp.hb;
    const hit = Math.max(collideTiles(), collideCars());
    return { hit, slip: Math.abs(vr), vf };
  }

  let crashCooldown = 0;
  function stepPlay(dt) {
    const inp = readInput();
    let maxHit = 0, slip = 0, vf = 0;
    const steps = Math.ceil(dt / (1 / 120));
    const sdt = dt / steps;
    const px = car.x, py = car.y, pa = car.a;
    for (let i = 0; i < steps; i++) { const r = updatePlayer(sdt, inp); maxHit = Math.max(maxHit, r.hit); slip = r.slip; vf = r.vf; }
    crashCooldown -= dt;
    if (maxHit > 110 && crashCooldown <= 0) {
      crashCooldown = 0.35;
      Snd.crash(maxHit);
      game.shake = Math.min(12, maxHit / 25);
      damageMeal(maxHit / 32);
    }
    // skid marks
    if ((slip > 70 || (inp.hb && Math.abs(vf) > 60)) && Math.hypot(car.vx, car.vy) > 40) {
      const back = (x, y, a, side) => [x - Math.sin(a) * 11 + Math.cos(a) * 6 * side, y + Math.cos(a) * 11 + Math.sin(a) * 6 * side];
      for (const side of [1, -1]) game.skids.push([...back(px, py, pa, side), ...back(car.x, car.y, car.a, side), 1]);
      if (game.skids.length > 600) game.skids.splice(0, game.skids.length - 600);
    }
    Snd.engine(Math.hypot(car.vx, car.vy), inp.throttle, true);
    updateMission(dt);
  }

  // ================================================================
  // Rendering
  // ================================================================
  let camX = 0, camY = 0;
  const P3 = (x, y, k) => [x + (x - camX) * k, y + (y - camY) * k];

  function drawCar(g, x, y, a, o) {
    const w = o.w, l = o.l, hw = w / 2, hl = l / 2;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, -hw + 2.5, -hl + 3.5, w, l, 5); g.fill();
    g.fillStyle = o.body; rr(g, -hw, -hl, w, l, 5); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.stroke();
    if (o.type === 'conv') {
      g.fillStyle = '#3b2a20'; rr(g, -hw + 2.5, -hl + 11, w - 5, l - 17, 3); g.fill();
      g.fillStyle = '#d9c29a'; g.fillRect(-hw + 3.5, -hl + 13, 4.5, 5); g.fillRect(hw - 8, -hl + 13, 4.5, 5);
      g.fillStyle = '#9fd3f0'; g.fillRect(-hw + 2, -hl + 8, w - 4, 2.5);
    } else {
      g.fillStyle = '#1e2b38';
      g.beginPath(); g.moveTo(-hw + 2, -hl + 9); g.lineTo(hw - 2, -hl + 9); g.lineTo(hw - 3, -hl + 14); g.lineTo(-hw + 3, -hl + 14); g.closePath(); g.fill();
      const roofL = o.type === 'van' ? l - 20 : l * 0.36;
      g.fillStyle = o.roof; rr(g, -hw + 3, -hl + 14, w - 6, roofL, 2); g.fill();
      g.fillStyle = '#1e2b38'; g.fillRect(-hw + 3, -hl + 14 + roofL, w - 6, 3.5);
    }
    g.fillStyle = '#fff6c0'; g.fillRect(-hw + 2, -hl, 4, 2); g.fillRect(hw - 6, -hl, 4, 2);
    g.fillStyle = o.brake ? '#ff2a2a' : '#8a1010'; g.fillRect(-hw + 2, hl - 2, 4, 2); g.fillRect(hw - 6, hl - 2, 4, 2);
    if (o.brake) { g.fillStyle = 'rgba(255,40,40,0.25)'; g.fillRect(-hw, hl, w, 5); }
    if (o.type === 'taxi') { g.fillStyle = '#222'; g.fillRect(-4, -hl + 16, 8, 4); g.fillStyle = '#fff'; g.fillRect(-3, -hl + 17, 6, 2); }
    if (o.player) {
      g.fillStyle = '#da291c'; rr(g, -5.5, -hl + 16, 11, 8, 2); g.fill();
      g.fillStyle = '#ffc72c'; g.font = 'bold 8px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('M', 0, -hl + 20.5);
      if (game.phase === 'deliver') { g.fillStyle = '#c8a26b'; g.fillRect(-4, hl - 11, 8, 6); g.fillStyle = '#da291c'; g.fillRect(-4, hl - 11, 8, 1.5); }
    }
    g.restore();
  }

  function drawBuilding(g, b) {
    const k = b.k, x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    const A = P3(x0, y0, k), B = P3(x1, y0, k), C = P3(x1, y1, k), D = P3(x0, y1, k);
    const wall = (bx0, by0, bx1, by1, r0, r1, f) => {
      g.fillStyle = shade(b.color, f);
      g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.lineTo(r1[0], r1[1]); g.lineTo(r0[0], r0[1]); g.closePath(); g.fill();
      if (!b.tower) {
        g.strokeStyle = b.mcd ? 'rgba(255,220,120,0.35)' : 'rgba(30,50,70,0.45)';
        g.lineWidth = 2; g.setLineDash([4, 3]);
        for (const t of b.k > 0.12 ? [0.3, 0.55, 0.8] : [0.45, 0.8]) {
          g.beginPath(); g.moveTo(lerp(bx0, r0[0], t), lerp(by0, r0[1], t)); g.lineTo(lerp(bx1, r1[0], t), lerp(by1, r1[1], t)); g.stroke();
        }
        g.setLineDash([]);
      }
    };
    if (camY > y1) wall(x0, y1, x1, y1, D, C, 0.62);
    if (camY < y0) wall(x0, y0, x1, y0, A, B, 0.5);
    if (camX > x1) wall(x1, y0, x1, y1, B, C, 0.75);
    if (camX < x0) wall(x0, y0, x0, y1, A, D, 0.7);
    g.fillStyle = b.color;
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]); g.closePath(); g.fill();
    const s = 1 + k;
    if (b.tower) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(A[0] + 3 * s, A[1] + 3 * s, (b.w - 6) * s, 4 * s);
      return;
    }
    g.strokeStyle = shade(b.color, 1.35); g.lineWidth = 3 * s;
    g.strokeRect(A[0] + 3 * s, A[1] + 3 * s, (b.w - 6) * s, (b.h - 6) * s);
    if (b.stripe) { g.fillStyle = b.stripe; g.fillRect(A[0] + 6 * s, (A[1] + D[1]) / 2 - 2 * s, (b.w - 12) * s, 4 * s); }
    if (b.mcd) {
      g.fillStyle = '#ffc72c'; g.font = `900 ${Math.round(46 * s)}px Arial Black, Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('M', (A[0] + C[0]) / 2, (A[1] + C[1]) / 2 + 2 * s);
      return;
    }
    for (const ac of b.ac) {
      const [ax, ay] = P3(ac.x, ac.y, k);
      g.fillStyle = '#9aa0a6'; g.fillRect(ax, ay, ac.s * s, ac.s * s);
      g.fillStyle = '#6c7278'; g.fillRect(ax + 1.5 * s, ay + 1.5 * s, (ac.s - 3) * s, (ac.s - 3) * s);
    }
  }

  function drawTree(g, t) {
    const [tx, ty] = P3(t.x, t.y, t.k);
    if (t.palm) {
      g.strokeStyle = '#7a5a33'; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(tx, ty); g.stroke();
      for (let i = 0; i < 7; i++) {
        const a = t.r + (i * TAU) / 7;
        g.fillStyle = i % 2 ? '#2f8f3a' : '#43b04f';
        g.beginPath(); g.ellipse(tx + Math.cos(a) * 9 * t.s, ty + Math.sin(a) * 9 * t.s, 11 * t.s, 3.6 * t.s, a, 0, TAU); g.fill();
      }
      g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(tx, ty, 2.5, 0, TAU); g.fill();
    } else {
      g.fillStyle = '#2b6a2d'; g.beginPath(); g.arc(tx, ty, 14 * t.s, 0, TAU); g.fill();
      g.fillStyle = '#3f8b3a'; g.beginPath(); g.arc(tx - 3, ty - 3, 9 * t.s, 0, TAU); g.fill();
    }
  }

  function drawSign(g) {
    const s = MCD_SIGN, [tx, ty] = P3(s.x, s.y, s.k);
    g.strokeStyle = '#8a8f96'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = '#da291c'; rr(g, tx - 17, ty - 13, 34, 26, 4); g.fill();
    g.strokeStyle = '#ffc72c'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#ffc72c'; g.font = '900 22px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('M', tx, ty + 1);
  }

  function drawPed(g, p) {
    g.save(); g.translate(p.x, p.y);
    if (p.state === 'down') {
      g.rotate(p.a);
      g.fillStyle = p.pants; g.fillRect(-8, -2, 6, 4);
      g.fillStyle = p.shirt; g.beginPath(); g.ellipse(0, 0, 4.5, 3.2, 0, 0, TAU); g.fill();
      g.fillStyle = p.skin; g.beginPath(); g.arc(5.5, 0, 2.6, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = '#ffec5c';
      for (let i = 0; i < 3; i++) { const a = game.time * 5 + (i * TAU) / 3; g.fillRect(p.x + Math.cos(a) * 7 - 1, p.y - 8 + Math.sin(a) * 2.5 - 1, 2, 2); }
      return;
    }
    g.rotate(p.a + PI / 2);
    const sw = Math.sin(p.step) * 3;
    g.fillStyle = p.pants; g.fillRect(-2.6, sw - 1, 2, 4); g.fillRect(0.6, -sw - 1, 2, 4);
    g.fillStyle = p.shirt; g.beginPath(); g.ellipse(0, 0, 4.6, 2.8, 0, 0, TAU); g.fill();
    g.fillStyle = p.skin; g.beginPath(); g.arc(0, -0.5, 2.4, 0, TAU); g.fill();
    g.restore();
  }

  function drawWorld(dt) {
    const spd = Math.hypot(car.vx, car.vy);
    const scale = baseScale * cam.zoom;
    let sx = 0, sy2 = 0;
    if (game.shake > 0) { sx = rand(-1, 1) * game.shake; sy2 = rand(-1, 1) * game.shake; game.shake = Math.max(0, game.shake - dt * 30); }
    camX = cam.x; camY = cam.y;
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * (W / 2 - camX * scale + sx), DPR * (H / 2 - camY * scale + sy2));
    ctx.imageSmoothingEnabled = true;
    const vw = W / scale, vh = H / scale;
    const vx0 = camX - vw / 2, vy0 = camY - vh / 2, vx1 = camX + vw / 2, vy1 = camY + vh / 2;
    ctx.fillStyle = '#1a6aa0'; ctx.fillRect(vx0 - 10, vy0 - 10, vw + 20, vh + 20);

    // ground chunks
    const cx0 = Math.max(0, Math.floor(vx0 / CH)), cx1 = Math.min(Math.ceil(COLS * T / CH) - 1, Math.floor(vx1 / CH));
    const cy0 = Math.max(0, Math.floor(vy0 / CH)), cy1 = Math.min(Math.ceil(ROWS * T / CH) - 1, Math.floor(vy1 / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(getChunk(cx, cy), cx * CH, cy * CH, CH + 0.5, CH + 0.5);

    // animated surf
    if (vx1 > 60 * T) {
      const t = game.time;
      for (const [off, alpha, w] of [[0, 0.85, 3], [9, 0.35, 2], [20, 0.18, 2]]) {
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = w;
        ctx.beginPath();
        const ys = Math.max(0, Math.floor(vy0 / 8) * 8), ye = Math.min((ROWS - 3) * T, vy1 + 8);
        for (let y = ys; y <= ye; y += 8) {
          const x = 63 * T + off + Math.sin(y * 0.03 + t * 1.6 + off) * 3 + Math.sin(t * 0.9 + off * 0.2) * 5;
          if (y === ys) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // skid marks
    ctx.strokeStyle = 'rgba(20,20,20,0.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of game.skids) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke(); ctx.lineCap = 'butt';

    // tree shadows
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const t of trees) {
      if (t.x < vx0 - 60 || t.x > vx1 + 60 || t.y < vy0 - 60 || t.y > vy1 + 60) continue;
      ctx.beginPath(); ctx.ellipse(t.x + 10, t.y + 8, 12 * t.s, 7 * t.s, 0.5, 0, TAU); ctx.fill();
    }

    // target ring on the ground
    const playing = game.state !== 'title';
    let tg = null;
    if (playing && game.order) {
      tg = target();
      const col = game.phase === 'pickup' ? '255,199,44' : '124,255,107';
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 6);
      ctx.fillStyle = `rgba(${col},${0.18 + 0.12 * pulse})`;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, 28, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]); ctx.lineDashOffset = -game.time * 20;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, 28, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (game.hold > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, 34, -PI / 2, -PI / 2 + TAU * (game.hold / 0.55)); ctx.stroke();
      }
    }

    // pedestrians
    for (const p of peds) {
      if (p.x < vx0 - 20 || p.x > vx1 + 20 || p.y < vy0 - 20 || p.y > vy1 + 20) continue;
      drawPed(ctx, p);
    }
    // cars
    for (const n of npcs) {
      if (n.x < vx0 - 40 || n.x > vx1 + 40 || n.y < vy0 - 40 || n.y > vy1 + 40) continue;
      drawCar(ctx, n.x, n.y, n.a, { w: n.w, l: n.l, body: n.body, roof: n.roof, type: n.type, brake: n.blocked || n.stun > 0 });
    }
    if (playing) drawCar(ctx, car.x, car.y, car.a, { w: car.w, l: car.l, body: '#f5f5f5', roof: '#ffffff', type: 'car', brake: car.brake, player: true });

    // tall things, far to near
    const tall = [];
    const m = 220;
    for (const b of buildings) {
      if (b.x + b.w < vx0 - m || b.x > vx1 + m || b.y + b.h < vy0 - m || b.y > vy1 + m) continue;
      const dx = b.x + b.w / 2 - camX, dy = b.y + b.h / 2 - camY;
      tall.push([dx * dx + dy * dy, 0, b]);
    }
    for (const t of trees) {
      if (t.x < vx0 - 80 || t.x > vx1 + 80 || t.y < vy0 - 80 || t.y > vy1 + 80) continue;
      const dx = t.x - camX, dy = t.y - camY;
      tall.push([dx * dx + dy * dy, 1, t]);
    }
    { const dx = MCD_SIGN.x - camX, dy = MCD_SIGN.y - camY; if (Math.abs(dx) < vw && Math.abs(dy) < vh) tall.push([dx * dx + dy * dy, 2, null]); }
    tall.sort((a, b) => b[0] - a[0]);
    for (const [, kind, o] of tall) {
      if (kind === 0) drawBuilding(ctx, o); else if (kind === 1) drawTree(ctx, o); else drawSign(ctx);
    }

    // floating marker & direction arrow
    if (tg) {
      const bob = Math.sin(game.time * 4) * 4;
      const [mx, my] = P3(tg.x, tg.y, 0.12);
      ctx.fillStyle = game.phase === 'pickup' ? '#ffc72c' : '#7cff6b';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx - 9, my - 16 + bob); ctx.lineTo(mx + 9, my - 16 + bob); ctx.lineTo(mx, my - 4 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
      const dx = tg.x - car.x, dy = tg.y - car.y, d = Math.hypot(dx, dy);
      if (d > 110) {
        const a = Math.atan2(dx, -dy);
        const ax = car.x + Math.sin(a) * 40, ay = car.y - Math.cos(a) * 40;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(game.time * 8);
        ctx.fillStyle = game.phase === 'pickup' ? '#ffc72c' : '#7cff6b';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 4); ctx.lineTo(2.5, 2); ctx.lineTo(2.5, 8); ctx.lineTo(-2.5, 8); ctx.lineTo(-2.5, 2); ctx.lineTo(-8, 4); ctx.closePath();
        ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
    }

    // floating texts
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 13px Impact, Arial Black, sans-serif';
    for (const f of game.floats) {
      const a = clamp(f.t / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    return spd;
  }

  function outlineText(g, text, x, y, size, fill, align = 'left', font = 'Impact, "Arial Black", sans-serif') {
    g.font = `900 ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'alphabetic';
    g.lineWidth = Math.max(3, size / 5); g.strokeStyle = '#000'; g.lineJoin = 'round';
    g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y);
  }
  function fit(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    while (text.length > 3 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  function locationName(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    let v = null, h = null;
    for (let r = 0; r <= 2 && !(v || h); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!inMap(tx + dx, ty + dy)) continue;
        const i = (ty + dy) * COLS + tx + dx;
        if (!v && segVAt[i] >= 0) v = segs[segVAt[i]].name;
        if (!h && segHAt[i] >= 0) h = segs[segHAt[i]].name;
      }
    }
    const t = tileAt(tx, ty);
    if (t === PLAZA) return 'Lincoln Road Mall';
    if (tx >= 50 && tx <= 53) return 'Lummus Park';
    if (t === SAND) return 'South Beach';
    if (tx >= FLAMINGO.x0 && tx <= FLAMINGO.x1 && ty >= FLAMINGO.y0 && ty <= FLAMINGO.y1) return 'Flamingo Park';
    if (ty >= SOUTHPOINTE.y0 && tx >= SOUTHPOINTE.x0) return 'South Pointe Park';
    if (v && h) return `${v} & ${h}`;
    return v || h || 'Miami Beach';
  }

  function drawHUD() {
    const g = ctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const safeTop = 8;
    if (game.state === 'title') return;
    const o = game.order;

    // Pager
    const pw = Math.min(560, W - 120);
    const px = Math.max(8, Math.min((W - pw) / 2, W - 104 - pw)), py = safeTop;
    const ph = 62;
    g.fillStyle = 'rgba(8,22,10,0.88)'; rr(g, px, py, pw, ph, 10); g.fill();
    g.strokeStyle = '#4dff6a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#9dff8a'; g.textAlign = 'left'; g.textBaseline = 'top';
    let l1, l2, l3;
    if (game.phase === 'pickup') {
      l1 = `ORDER #${o.no} READY FOR PICKUP`;
      l2 = `McDonald's · Collins Ave & 16th St`;
      l3 = game.deliveries === 0 ? 'Follow the yellow arrow' : 'Head back to McDonald\'s';
    } else {
      l1 = `DELIVER TO ${o.customer.toUpperCase()}`;
      l2 = o.dest.place ? `${o.dest.place} · ${o.dest.addr}` : o.dest.addr;
      l3 = o.items.join(', ');
    }
    g.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace'; g.fillText(fit(g, l1, pw - 20), px + 10, py + 7);
    g.font = '13px ui-monospace, Menlo, Consolas, monospace'; g.fillText(fit(g, l2, pw - 20), px + 10, py + 25);
    g.fillStyle = 'rgba(157,255,138,0.7)'; g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.fillText(fit(g, l3, pw - 20), px + 10, py + 43);

    // Stats
    let y = py + ph + 30;
    outlineText(g, `$${game.cash}`, 12, y, 28, '#7cff6b');
    y += 20;
    outlineText(g, `DELIVERIES ${game.deliveries}${game.streak > 1 ? `   STREAK x${game.streak}` : ''}`, 12, y, 13, '#fff');
    if (game.phase === 'deliver') {
      y += 26;
      const tl = Math.max(0, o.timeLeft);
      const late = o.timeLeft <= 0;
      const tstr = late ? 'LATE' : `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
      outlineText(g, `⏱ ${tstr}`, 12, y, 22, late ? '#ff5e5e' : tl < 10 ? (Math.floor(game.time * 4) % 2 ? '#ff5e5e' : '#fff') : '#ffd23f');
      y += 10;
      g.fillStyle = 'rgba(0,0,0,0.6)'; rr(g, 12, y, 120, 12, 4); g.fill();
      const c = o.cond / 100;
      g.fillStyle = c > 0.66 ? '#7cff6b' : c > 0.33 ? '#ffd23f' : '#ff5e5e';
      rr(g, 14, y + 2, 116 * c, 8, 3); g.fill();
      y += 24;
      outlineText(g, `MEAL ${Math.round(o.cond)}%`, 12, y, 12, '#fff');
    }
    y += 20;
    g.globalAlpha = 0.85;
    outlineText(g, locationName(car.x, car.y).toUpperCase(), 12, y, 12, '#3ff0ff');
    g.globalAlpha = 1;

    // Radar
    const S = clamp(Math.round(W * 0.26), 92, 150);
    const rx = W - S - 10, ry = Math.max(56, px + pw > W - S - 18 ? py + ph + 8 : 56);
    const span = 38;
    g.save();
    rr(g, rx, ry, S, S, 10); g.fillStyle = '#123'; g.fill(); g.clip();
    const ptx = car.x / T, pty = car.y / T;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.92;
    g.drawImage(mmCanvas, (ptx - span / 2) * MM, (pty - span / 2) * MM, span * MM, span * MM, rx, ry, S, S);
    g.globalAlpha = 1;
    const ppt = S / span;
    const tg = target();
    let dx = (tg.x / T - ptx) * ppt, dy = (tg.y / T - pty) * ppt;
    const lim = S / 2 - 7;
    const m2 = Math.max(Math.abs(dx), Math.abs(dy));
    if (m2 > lim) { dx *= lim / m2; dy *= lim / m2; }
    const blink = Math.floor(game.time * 3) % 2 === 0;
    g.fillStyle = game.phase === 'pickup' ? '#ffc72c' : '#7cff6b';
    g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(rx + S / 2 + dx, ry + S / 2 + dy, blink ? 5.5 : 4, 0, TAU); g.fill(); g.stroke();
    g.translate(rx + S / 2, ry + S / 2); g.rotate(car.a);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; rr(g, rx, ry, S, S, 10); g.stroke();
    g.imageSmoothingEnabled = true;

    // Speedometer
    const mph = Math.round(Math.hypot(car.vx, car.vy) / 5.5);
    outlineText(g, `${mph} MPH`, W - 12, ry + S + 22, 16, '#fff', 'right');

    // hints
    if (game.slowHintT > 0) outlineText(g, 'SLOW DOWN TO STOP!', W / 2, H * 0.62, 18, '#ffd23f', 'center');

    // Big message
    if (game.msg) {
      const mm = game.msg;
      const tIn = mm.max - mm.t;
      const a = clamp(Math.min(tIn / 0.15, mm.t / 0.4), 0, 1);
      const sc = tIn < 0.15 ? 1.4 - (tIn / 0.15) * 0.4 : 1;
      g.globalAlpha = a;
      const size = Math.min(44, W / 11) * sc;
      outlineText(g, mm.title, W / 2, H * 0.36, size, mm.color, 'center');
      if (mm.sub) {
        g.font = `900 ${Math.min(16, W / 26)}px Impact, "Arial Black", sans-serif`;
        outlineText(g, fit(g, mm.sub, W - 30), W / 2, H * 0.36 + Math.min(28, W / 16), Math.min(16, W / 26), '#fff', 'center');
      }
      g.globalAlpha = 1;
    }
  }

  // ================================================================
  // Main loop
  // ================================================================
  for (let i = 0; i < 26; i++) spawnNPC();
  for (let i = 0; i < 90; i++) spawnPed();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.state !== 'paused') {
      game.time += dt;
      if (game.state === 'play') stepPlay(dt);
      updateNPCs(dt, game.state === 'play');
      updatePeds(dt, game.state === 'play');
      for (const f of game.floats) { f.t -= dt; f.y -= 22 * dt; }
      game.floats = game.floats.filter((f) => f.t > 0);
      if (game.msg) { game.msg.t -= dt; if (game.msg.t <= 0) game.msg = null; }

      // camera
      if (game.state === 'play') {
        const spd = Math.hypot(car.vx, car.vy);
        const k = 1 - Math.exp(-5 * dt);
        cam.x = lerp(cam.x, car.x + car.vx * 0.35, k);
        cam.y = lerp(cam.y, car.y + car.vy * 0.35, k);
        cam.zoom = lerp(cam.zoom, 1 - 0.3 * clamp(spd / MAX_SPEED, 0, 1), 1 - Math.exp(-1.8 * dt));
      } else {
        const t = game.time * 0.04;
        cam.x = (VR[3].x + 6) * T + Math.sin(t * 2.3) * 8 * T;
        cam.y = (ROWS / 2) * T + Math.sin(t) * (ROWS / 2 - 12) * T;
        cam.zoom = 0.9;
      }
      // keep the camera inside the map
      const sc = baseScale * cam.zoom, hw = W / sc / 2, hh = H / sc / 2;
      cam.x = COLS * T > hw * 2 ? clamp(cam.x, hw, COLS * T - hw) : (COLS * T) / 2;
      cam.y = ROWS * T > hh * 2 ? clamp(cam.y, hh, ROWS * T - hh) : (ROWS * T) / 2;
    }
    drawWorld(dt);
    drawHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (location.hash === '#debug') window.SBD = { game, car, spots, PICKUP, npcs };
})();
