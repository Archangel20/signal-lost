/* SIGNAL LOST — 3D renderer (three.js, vendored in js/vendor/three.min.js).
   Gritty low-poly city street at dusk, chase camera. Reads simulation state from Game; owns no gameplay. */
(function (global) {
  'use strict';
  const T = global.THREE;
  const LW = 2.6;                 // lane width (m); sim lane index 0..2 -> world x = (lane-1)*LW, forward = -Z
  const ROAD_HALF = 5.9, CURB_X = 6.1, WALK_OUT = 9.6;
  const FONT = '"Oswald","Bebas Neue",Impact,"Arial Narrow",sans-serif';
  const R = { LW, noGov: /nogov/.test(location.search), ready: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rnd = Math.random;
  function srand(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  let renderer, scene, camera, canvas, ANISO = 4, mobile = false;
  let W = 1280, H = 720, dpr = 1, ratio = 1, maxRatio = 1;
  let sky, skyCol, sunDisc, sun, hemi, fill, lampPoles, lampHeads, lampPools, roadTex, walkTexL, walkTexR, ground;
  const texJobs = [];
  const fogCol = new T.Color();
  const tmpC = new T.Color(), tmpC2 = new T.Color();

  /* ---------------------------------------------------------------- textures */
  function ctex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = ANISO;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.userData.redraw = () => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
    texJobs.push(t);
    return t;
  }
  const hexs = (h) => '#' + h.toString(16).padStart(6, '0');

  function drawRoad(g, w, h) {
    const RW = ROAD_HALF * 2, pxm = w / RW, pym = h / 12, X = x => (x + ROAD_HALF) * pxm;
    g.fillStyle = '#515459'; g.fillRect(0, 0, w, h);
    const rr = srand(11);
    for (let i = 0; i < 14000; i++) { const v = 34 + (rr() * 30 | 0); g.fillStyle = `rgba(${v},${v},${v + 3},.55)`; g.fillRect(rr() * w, rr() * h, 1 + rr() * 2, 1 + rr() * 2); }
    // parking lanes slightly different
    g.fillStyle = 'rgba(70,66,60,.10)'; g.fillRect(0, 0, X(-1.5 * LW), h); g.fillRect(X(1.5 * LW), 0, w - X(1.5 * LW), h);
    // tyre wear in every lane
    for (let l = -1; l <= 1; l++) for (const o of [-0.75, 0.75]) {
      const cx = X(l * LW + o), gr = g.createLinearGradient(cx - 0.4 * pxm, 0, cx + 0.4 * pxm, 0);
      gr.addColorStop(0, 'rgba(10,10,12,0)'); gr.addColorStop(.5, 'rgba(10,10,12,.26)'); gr.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = gr; g.fillRect(cx - 0.4 * pxm, 0, 0.8 * pxm, h);
    }
    // patches, tar seams, cracks (kept inside the tile so it repeats cleanly)
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${rr() < .5 ? '14,14,16' : '58,58,60'},.35)`; g.fillRect(rr() * (w - 80), 40 + rr() * (h - 120), 30 + rr() * 70, 20 + rr() * 60); }
    g.strokeStyle = 'rgba(8,8,10,.55)'; g.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) { let x = rr() * w, y = 40 + rr() * (h - 160); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rr() - .5) * 26; y += 12 + rr() * 16; g.lineTo(x, y); } g.stroke(); }
    // lane markings
    const solid = (x, col, wm) => { g.fillStyle = col; g.fillRect(X(x) - wm * pxm / 2, 0, wm * pxm, h); };
    solid(-1.5 * LW, 'rgba(226,224,214,.88)', .14); solid(1.5 * LW, 'rgba(226,224,214,.88)', .14);
    for (const x of [-LW / 2, LW / 2]) for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(228,226,216,.9)'; g.fillRect(X(x) - .07 * pxm, (k * 6 + .5) * pym, .14 * pxm, 3 * pym); }
    // wear on paint
    for (let i = 0; i < 2600; i++) { const v = 40 + (rr() * 26 | 0); g.fillStyle = `rgba(${v},${v},${v + 3},.7)`; g.fillRect(rr() * w, rr() * h, 1 + rr() * 2, 1 + rr() * 3); }
  }
  function drawWalk(g, w, h) {
    g.fillStyle = '#84837e'; g.fillRect(0, 0, w, h);
    const rr = srand(23), sw = w / 2, sh = h / 4;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      const v = 120 + (rr() * 22 | 0); g.fillStyle = `rgb(${v},${v - 1},${v - 5})`; g.fillRect(i * sw, j * sh, sw, sh);
    }
    for (let i = 0; i < 5000; i++) { const v = 100 + (rr() * 50 | 0); g.fillStyle = `rgba(${v},${v},${v - 4},.4)`; g.fillRect(rr() * w, rr() * h, 1 + rr() * 2, 1 + rr() * 2); }
    g.fillStyle = 'rgba(40,38,34,.55)';
    for (let i = 0; i <= 2; i++) g.fillRect(i * sw - 1.5, 0, 3, h);
    for (let j = 0; j <= 4; j++) g.fillRect(0, j * sh - 1.5, w, 3);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,28,26,.18)'; g.beginPath(); g.ellipse(rr() * w, rr() * h, 8 + rr() * 16, 5 + rr() * 9, 0, 0, 7); g.fill(); }
  }
  // facade tile: 6 x 4 windows (18 m x 12.8 m)
  const FAC = [
    { wall: '#6e4c3f', frame: '#d8cfbd', glass: ['#33424e', '#6a7e90'], brick: true },
    { wall: '#8d887c', frame: '#b8b3a6', glass: ['#31404c', '#667b8e'] },
    { wall: '#56646f', frame: '#2b343b', glass: ['#364a5c', '#8fa8bb'], curtain: true },
    { wall: '#7b7468', frame: '#d1c8b4', glass: ['#303d48', '#677a8b'], cornice: true }
  ];
  function drawFacade(st, lit) {
    return (g, w, h) => {
      const cw = w / 6, ch = h / 4, rr = srand(st === FAC[0] ? 5 : st === FAC[1] ? 6 : st === FAC[2] ? 7 : 8);
      if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); } else {
        g.fillStyle = st.wall; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) { const a = rr() * .16; g.fillStyle = rr() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * .6})`; g.fillRect(rr() * w, rr() * h, 1 + rr() * 2, 1 + rr() * 2); }
        if (st.brick) { g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1); }
        g.fillStyle = 'rgba(0,0,0,.18)'; for (let j = 0; j < 4; j++) g.fillRect(0, j * ch + ch - 3, w, 3);
      }
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
        const x0 = i * cw, y0 = j * ch;
        const wx = st.curtain ? x0 + 4 : x0 + cw * .24, wy = st.curtain ? y0 + 6 : y0 + ch * .2, ww = st.curtain ? cw - 8 : cw * .52, wh = st.curtain ? ch - 14 : ch * .56;
        const on = rr() < .3, warm = rr() < .82, cool = '#cfe3ff';
        if (lit) {
          if (on) { g.fillStyle = warm ? (rr() < .5 ? '#ffd58a' : '#ffe6b0') : cool; g.fillRect(wx, wy, ww, wh); }
        } else {
          const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, st.glass[1]); gr.addColorStop(.55, st.glass[0]); gr.addColorStop(1, st.glass[0]);
          g.fillStyle = st.frame; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
          g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
          if (on) { g.fillStyle = warm ? 'rgba(235,196,120,.78)' : 'rgba(190,215,245,.7)'; g.fillRect(wx, wy, ww, wh); }
          g.fillStyle = st.frame; g.fillRect(wx + ww / 2 - 1, wy, 2, wh); g.fillRect(wx, wy + wh * .45, ww, 2);
          g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(wx - 3, wy + wh + 3, ww + 6, 3);
          if (!st.curtain && rr() < .12) { g.fillStyle = '#9ea1a3'; g.fillRect(wx + ww * .1, wy + wh + 6, ww * .6, ch * .13); }
        }
      }
    };
  }
  const SHOPS = [
    ['LUCKY SLICE', '#8a2f2b', 'PIZZA'], ['CORNER LIQUOR', '#2c4570', 'BEER · WINE'], ['24H MART', '#2f6b4a', 'OPEN 24 HOURS'], ['CITY PHARMACY', '#2a7070', 'RX'],
    ['GOLD PAWN', '#b08a2e', 'CASH FOR GOLD'], ['TACO LOCO', '#7a3a22', 'TACOS'], ['SUNNY CAFE', '#5d3560', 'COFFEE'], ['BAIL BONDS', '#3b3f46', 'FAST · 24/7']
  ];
  function drawShop(si, lit) {
    return (g, w, h) => {
      const S = SHOPS[si], rr = srand(40 + si);
      if (lit) g.fillStyle = '#000'; else { g.fillStyle = '#4a4742'; }
      g.fillRect(0, 0, w, h);
      if (!lit) { for (let i = 0; i < 4000; i++) { const a = rr() * .16; g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(rr() * w, rr() * h, 2, 2); } }
      const aw = h * .22;
      // sign board
      g.fillStyle = lit ? '#fff' : S[1]; g.fillRect(w * .08, h * .02, w * .84, h * .24);
      g.fillStyle = lit ? '#000' : 'rgba(255,255,255,.95)'; g.font = `700 ${h * .17}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S[0], w * .5, h * .15);
      if (lit) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
      // awning
      for (let i = 0; i < 16; i++) { g.fillStyle = lit ? (i % 2 ? '#000' : '#222') : (i % 2 ? S[1] : '#e8e2d2'); g.fillRect(i * w / 16, h * .3, w / 16, aw * .5); }
      // windows and door
      const wy = h * .5, wh = h * .42;
      const wins = [[.04, .36], [.46, .24], [.74, .22]];
      wins.forEach((v, k) => {
        const x = w * v[0], ww = w * v[1];
        if (k === 1) { g.fillStyle = lit ? '#2a2018' : '#2a2c2e'; g.fillRect(x, wy, ww, wh); g.fillStyle = lit ? '#ffe2a8' : '#c9a86a'; g.fillRect(x + ww * .12, wy + wh * .1, ww * .76, wh * .9); return; }
        const gr = g.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) { gr.addColorStop(0, '#ffeab8'); gr.addColorStop(1, '#e8a95a'); } else { gr.addColorStop(0, '#e6c88c'); gr.addColorStop(1, '#a8743a'); }
        g.fillStyle = lit ? '#000' : '#202224'; g.fillRect(x - 4, wy - 4, ww + 8, wh + 8);
        g.fillStyle = gr; g.fillRect(x, wy, ww, wh);
        if (!lit) { g.fillStyle = 'rgba(20,20,20,.5)'; for (let s = 0; s < 3; s++) g.fillRect(x + ww * (.15 + s * .27), wy + wh * .55, ww * .16, wh * .45); }
      });
      if (!lit) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 10, w, 10); }
    };
  }
  function drawBoard(text) {
    return (g, w, h) => {
      g.fillStyle = '#1b2430'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2f6fb3'; g.fillRect(0, 0, w, h * .2);
      g.fillStyle = '#fff'; g.font = `600 ${h * .13}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('CITY WATCH  ·  SURVEILLANCE UNIT', w * .04, h * .1);
      g.fillStyle = '#f2f2f0'; g.textAlign = 'center';
      const words = (text || '').split(' '); const lines = []; let cur = '';
      g.font = `700 ${h * .27}px ${FONT}`;
      for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > w * .9 && cur) { lines.push(cur); cur = wd; } else cur = t; }
      if (cur) lines.push(cur);
      const lh = h * .3, y0 = h * .6 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => g.fillText(l, w / 2, y0 + i * lh));
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h * .2, w, 3);
    };
  }

  /* ---------------------------------------------------------------- geometry helpers */
  const _c = new T.Color();
  function paint(geo, hex) {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3); _c.set(hex);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new T.BufferAttribute(a, 3)); return geo;
  }
  function bx(w, h, d, x, y, z, hex, tp) {
    const g = new T.BoxGeometry(w, h, d);
    if (tp) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * (tp.tx === undefined ? 1 : tp.tx)); p.setZ(i, p.getZ(i) * (p.getZ(i) < 0 ? (tp.tf === undefined ? 1 : tp.tf) : (tp.tb === undefined ? 1 : tp.tb))); } g.computeVertexNormals(); }
    g.translate(x, y, z); return paint(g, hex);
  }
  function cyl(r, len, x, y, z, hex, seg) { const g = new T.CylinderGeometry(r, r, len, seg || 10); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return paint(g, hex); }
  function cylV(r0, r1, h, x, y, z, hex, seg) { const g = new T.CylinderGeometry(r1, r0, h, seg || 8); g.translate(x, y, z); return paint(g, hex); }
  const merge = (list) => { const mixed = list.some(g => !g.index) && list.some(g => g.index); if (mixed) list = list.map(g => g.index ? g.toNonIndexed() : g); const m = T.mergeGeometries(list, false); if (!m) console.warn('merge failed'); return m; };
  function wheels(list, xs, zs, r, w) { for (const z of zs) for (const x of xs) { list.push(cyl(r, w, x, r, z, '#121214', 12)); list.push(cyl(r * .55, w + .02, x + Math.sign(x) * .005, r, z, '#7d8186', 10)); } }
  function lightsAt(L, tx, ty, tw, th, zr, zf, extra) {
    const l = [];
    for (const s of [-1, 1]) { l.push(bx(tw, th, .06, s * tx, ty, L / 2 + zr, '#ff3a2a')); l.push(bx(tw, th * .9, .06, s * tx, ty, -L / 2 - zf, '#fff3cf')); }
    return merge(l);
  }
  const VEH = {};
  function vehGeo(kind, hex) {
    const key = kind + hex; if (VEH[key]) return VEH[key];
    const P = [], dark = '#1b232b', bump = '#232427';
    let L, rf = 1.5, rest = {};
    if (kind === 'sedan' || kind === 'taxi' || kind === 'police') {
      L = 4.4; const col = kind === 'police' ? '#15171b' : hex;
      P.push(bx(1.85, .62, 4.4, 0, .58, 0, col));
      P.push(bx(1.62, .5, 2.2, 0, 1.15, .15, dark, { tx: .86, tf: .76, tb: .9 }));
      P.push(bx(1.5, .05, 1.5, 0, 1.43, .2, col));
      P.push(bx(1.8, .2, .18, 0, .42, 2.22, bump)); P.push(bx(1.8, .2, .18, 0, .42, -2.22, bump));
      wheels(P, [-.92, .92], [-1.4, 1.4], .34, .22);
      if (kind === 'taxi') { P.push(bx(.7, .2, .32, 0, 1.58, .2, '#f4f1e4')); P.push(bx(1.86, .06, 4.2, 0, .72, 0, '#1a1a1a')); }
      if (kind === 'police') { P.push(bx(1.87, .34, 2.0, 0, .64, .2, '#ececea')); P.push(bx(1.1, .09, .3, 0, 1.5, .2, '#1a1a1a')); P.push(bx(1.7, .04, .5, 0, .91, -1.45, '#ececea')); }
      rest.lights = lightsAt(4.4, .66, .78, .42, .13, .01, .01); rest.roof = kind === 'police' ? 1.55 : 1.45;
    } else if (kind === 'van') {
      L = 5.6;
      P.push(bx(2.0, .7, 5.6, 0, .65, 0, hex));
      P.push(bx(2.0, 1.45, 3.7, 0, 1.72, 1.0, hex));
      P.push(bx(1.9, .9, 1.9, 0, 1.45, -1.85, dark, { tf: .72 }));
      P.push(bx(1.9, .08, 1.7, 0, 1.92, -1.85, hex, { tf: .75 }));
      P.push(bx(2.02, .12, 5.6, 0, 1.0, 0, '#ceccc4'));
      P.push(bx(2.0, .2, .18, 0, .42, 2.8, bump)); P.push(bx(2.0, .2, .18, 0, .42, -2.8, bump));
      P.push(bx(.04, 1.35, .04, 0, 1.7, 2.86, '#222'));
      wheels(P, [-1.0, 1.0], [-1.9, 1.7], .4, .24);
      rest.lights = lightsAt(5.6, .92, .95, .16, .5, .01, .01); rest.roof = 2.5;
    } else if (kind === 'truck') {
      L = 8.5;
      P.push(bx(2.0, .4, 8.5, 0, .64, 0, '#262628'));
      P.push(bx(2.1, 1.5, 2.0, 0, 1.4, -3.2, hex, { tf: .86 }));
      P.push(bx(2.12, .55, 1.7, 0, 1.78, -3.25, dark, { tf: .8 }));
      P.push(bx(2.4, 2.5, 6.0, 0, 2.15, 1.2, '#d9d7cf'));
      P.push(bx(2.42, .22, 6.0, 0, 1.0, 1.2, hex));
      P.push(bx(2.2, 1.7, .05, 0, 2.2, 4.23, '#bdbbb3'));
      P.push(bx(2.2, .2, .2, 0, .55, 4.35, bump));
      wheels(P, [-1.0, 1.0], [-3.2, 1.9, 3.3], .46, .26);
      rest.lights = lightsAt(8.5, .9, .75, .16, .3, .01, .01); rest.roof = 3.4;
    } else { // bus
      L = 11;
      P.push(bx(2.5, 2.3, 11, 0, 1.65, 0, hex));
      P.push(bx(2.52, .85, 10.4, 0, 2.15, .1, dark));
      P.push(bx(2.4, .3, 10.8, 0, 2.95, 0, '#cfd0cc'));
      P.push(bx(2.52, .3, 11, 0, .62, 0, '#2d3a63'));
      P.push(bx(2.0, .85, .05, 0, 2.15, 5.52, dark));
      P.push(bx(2.5, .2, .2, 0, .5, 5.55, bump));
      wheels(P, [-1.14, 1.14], [-3.6, 3.5], .52, .3);
      rest.lights = lightsAt(11, 1.0, 1.15, .2, .3, .01, .01); rest.roof = 3.1;
    }
    return (VEH[key] = { body: merge(P), lights: rest.lights, L, roof: rest.roof });
  }
  const PAINTS = ['#2d3b52', '#9aa0a5', '#1c1d20', '#6b2327', '#d8d6cf', '#3d5648', '#70512f', '#4a4f57'];
  const VAN_PAINTS = ['#d9d7cf', '#8f969b', '#2d4166', '#7b2b27'];

  const matVeh = new T.MeshLambertMaterial({ vertexColors: true });
  const matLight = new T.MeshBasicMaterial({ vertexColors: true });
  const matPoliceR = new T.MeshBasicMaterial({ color: 0xff3030 }), matPoliceB = new T.MeshBasicMaterial({ color: 0x3a6bff });
  const barGeoR = new T.BoxGeometry(.38, .12, .2), barGeoB = new T.BoxGeometry(.38, .12, .2);
  function makeVeh() {
    const g = new T.Group(), body = new T.Mesh(undefined, matVeh), lights = new T.Mesh(undefined, matLight);
    body.castShadow = true; body.receiveShadow = true;
    const bar = new T.Group(), r = new T.Mesh(barGeoR, matPoliceR), b = new T.Mesh(barGeoB, matPoliceB);
    r.position.set(-.25, 0, 0); b.position.set(.25, 0, 0); bar.add(r, b); bar.visible = false;
    g.add(body, lights, bar); g.visible = false; scene.add(g);
    return { root: g, body, lights, bar };
  }
  function setVeh(v, kind, hex, Lw, sx, sy) {
    const d = vehGeo(kind, hex); v.body.geometry = d.body; v.lights.geometry = d.lights;
    v.root.scale.set(sx, sy, Lw / d.L);
    v.bar.visible = kind === 'police'; v.bar.position.set(0, d.roof + .02, .2); v.kind = kind;
  }

  /* ---------------------------------------------------------------- obstacles (barrier / beam props) */
  function geoJersey() {
    return merge([bx(2.3, .3, .7, 0, .15, 0, '#a4a49e'), bx(2.3, .55, .7, 0, .575, 0, '#adada7', { tf: .38, tb: .38 }), bx(2.31, .09, .3, 0, .62, 0, '#d9772b'), bx(2.31, .09, .3, 0, .4, 0, '#e9e6dc')]);
  }
  function geoSaw() {
    const P = [];
    for (const x of [-1.0, 1.0]) for (const z of [-.26, .26]) P.push(bx(.07, .92, .07, x, .46, z, '#c9c6bc'));
    for (let k = 0; k < 6; k++) for (const y of [.82, .55]) P.push(bx(.4, .2, .05, -1.0 + k * .4 + .2, y, 0, (k + (y > .7 ? 0 : 1)) % 2 ? '#d94b2b' : '#ece9df'));
    P.push(bx(2.2, .06, .5, 0, .03, 0, '#444'));
    return merge(P);
  }
  function geoCones() {
    const P = [];
    for (let i = 0; i < 5; i++) { const x = -1.0 + i * .5; P.push(bx(.46, .04, .46, x, .02, 0, '#2c2c2e')); P.push(cylV(.2, .045, .82, x, .45, 0, '#e2602a', 10)); P.push(cylV(.135, .105, .17, x, .5, 0, '#efece4', 10)); }
    return merge(P);
  }
  function geoGantryPosts() {
    return merge([bx(.14, 2.45, .14, -1.3, 1.22, 0, '#b9b8b0'), bx(.14, 2.45, .14, 1.3, 1.22, 0, '#b9b8b0'), bx(.5, .08, .5, -1.3, .04, 0, '#3a3a3c'), bx(.5, .08, .5, 1.3, .04, 0, '#3a3a3c'), bx(.2, .1, .2, -1.3, 1.9, 0, '#d9772b'), bx(.2, .1, .2, 1.3, 1.9, 0, '#d9772b')]);
  }
  function geoGantryLamps() { return merge([bx(.2, .14, .2, -1.3, 2.52, 0, '#ffb02e'), bx(.2, .14, .2, 1.3, 2.52, 0, '#ffb02e')]); }
  let matGantry;
  function drawGantry(g, w, h) {
    g.fillStyle = '#e8e6de'; g.fillRect(0, 0, w, h * .58);
    g.fillStyle = '#b8352a'; let fs = h * .3; g.font = `700 ${fs}px ${FONT}`; const mw = g.measureText('ROAD CLOSED').width; if (mw > w * .86) { fs *= w * .86 / mw; g.font = `700 ${fs}px ${FONT}`; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ROAD CLOSED', w / 2, h * .3);
    g.fillStyle = '#e8e6de'; g.fillRect(0, h * .58, w, h * .42);
    g.save(); g.beginPath(); g.rect(0, h * .58, w, h * .42); g.clip(); g.fillStyle = '#e07a26';
    for (let x = -h; x < w + h; x += h * .36) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * .18, h); g.lineTo(x + h * .18 + h * .42, h * .58); g.lineTo(x + h * .42, h * .58); g.closePath(); g.fill(); }
    g.restore(); g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }

  /* ---------------------------------------------------------------- pools */
  const pools = {};
  function pool(kind, make) { return pools[kind] || (pools[kind] = { free: [], active: [], make }); }
  let frameId = 0;
  function acquire(kind) {
    const p = pools[kind]; const e = p.free.pop() || p.make();
    e.root.visible = true; p.active.push(e); e.stamp = frameId; return e;
  }
  function sweep() {
    for (const k in pools) { const p = pools[k]; let w = 0; for (let i = 0; i < p.active.length; i++) { const e = p.active[i]; if (e.stamp === frameId) p.active[w++] = e; else { e.root.visible = false; if (e.owner) { e.owner._v = null; e.owner = null; } p.free.push(e); } } p.active.length = w; }
  }

  /* ---------------------------------------------------------------- player */
  let P = null;
  const pc = { x: 0, rigX: 0, rigY: .88, rigZ: 0, head: 0, bob: 0, torso: 0, thL: 0, knL: 0, thR: 0, knR: 0, arL: 0, elL: 0, arR: 0, elR: 0, bank: 0, yaw: 0, fall: 0 };
  const vis = { x: 1, camX: 0 };
  /* Characters + bikes come from chars3d.js (CharKit): capsule-limbed riders in layered outfits on a matching vehicle. */
  function buildPlayer(look) { const p = global.CharKit.build(look || (global.Save && global.Save.OUTFITS.courier.look)); scene.add(p.root); return p; }
  function spinWheels(v, dt, sp) { const list = [v.front, v.rear].concat(v.rearList || []); for (const w of list) if (w) w.rotation.x -= sp * dt / (w.userData.R || .3); }
  function updatePlayer(G, dt) {
    const p = G.p; const a = 1 - Math.exp(-dt * 14);
    vis.x += (p.x - vis.x) * a;
    const vx = clamp((p.x - vis.x) * 1.4, -1, 1);
    P.root.position.set((vis.x - 1) * LW, p.y, 0);
    const wantCl = G.cloakT > 0 && G.state !== 'dead' && G.state !== 'over';   // cops-can't-see-you: ghosted model
    if (wantCl !== !!P.cloaked) { P.cloaked = wantCl; P.root.traverse(m => { if (m.isMesh && m.material) { const ms = Array.isArray(m.material) ? m.material : [m.material]; for (const q of ms) { if (q.userData.t0 === undefined) { q.userData.t0 = q.transparent; q.userData.o0 = q.opacity; } q.transparent = wantCl || q.userData.t0; q.opacity = wantCl ? 0.38 : q.userData.o0; q.depthWrite = !wantCl; q.needsUpdate = true; } } }); }
    const dead = G.state === 'dead' || G.state === 'over' || p.dead;
    const ph = p.phase, RP = P.pose, veh = P.veh;
    const t = {};
    const sl = p.slide > 0 && p.grounded, air = !p.grounded;
    const cr = clamp(1 - (G.clock - p.landT) / 0.16, 0, 1) * (p.grounded ? 1 : 0);
    const bob = dead || air ? 0 : Math.sin(ph * 2) * (veh.suspend || .01) - cr * .05;
    let tipZ = 0, tipX = 0, pitch = 0;
    Object.assign(t, { rigX: 0, rigY: RP.rigY, rigZ: RP.rigZ, torso: RP.torso, thL: RP.thL, knL: RP.knL, thR: RP.thR, knR: RP.knR, arL: RP.arL, elL: RP.elL, arR: RP.arR, elR: RP.elR, head: RP.head, bob });
    if (dead) {
      const d = clamp(G.deadT * 3.2, 0, 1);
      Object.assign(t, { rigX: 1.5 * d, rigY: RP.rigY - .5 * d, rigZ: RP.rigZ + .3 * d, torso: -.1, thL: .5, knL: .4, thR: -.2, knR: .7, arL: 1.6, elL: .5, arR: .6, elR: .9, head: 0, bob: 0 });
      tipZ = 1.38 * d; tipX = .45 * d;
      P.root.position.z = Math.min(1.1, G.deadT * 1.6);
    } else if (sl) {
      Object.assign(t, { rigY: RP.rigY - .17, rigZ: RP.rigZ + .04, torso: RP.torso - .72, arL: RP.arL + .62, arR: RP.arR + .62, elL: RP.elL + .35, elR: RP.elR + .35, head: RP.head + .5 });
      P.root.position.z = 0; tipZ = -vx * .1 + .12;
    } else if (air) {
      const up = p.vy > 0; pitch = up ? .13 : -.1;
      Object.assign(t, { torso: RP.torso - (up ? .1 : .02), thL: RP.thL + (up ? .1 : -.05), thR: RP.thR + (up ? .1 : -.05), head: RP.head + (up ? .08 : .0) });
      P.root.position.z = 0;
    } else { P.root.position.z = 0; t.torso -= cr * .12; }
    t.bank = dead ? 0 : -vx * .3; t.yaw = dead ? 0 : -vx * .28;
    const k = dead ? 1 - Math.exp(-dt * 12) : sl || air ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 48);
    for (const key in t) pc[key] += ((t[key]) - (pc[key] || 0)) * k;
    const { rig, torso, aL, aR, lL, lR, root } = P;
    rig.rotation.x = pc.rigX; rig.position.y = pc.rigY; rig.position.z = pc.rigZ; torso.rotation.x = pc.torso;
    lL.th.rotation.x = pc.thL; lL.kn.rotation.x = -pc.knL; lR.th.rotation.x = pc.thR; lR.kn.rotation.x = -pc.knR;
    aL.sh.rotation.x = pc.arL; aL.el.rotation.x = pc.elL; aR.sh.rotation.x = pc.arR; aR.el.rotation.x = pc.elR;
    root.rotation.z = pc.bank; root.rotation.y = pc.yaw; root.rotation.x = pitch;
    P.head.rotation.x = pc.head;
    veh.group.position.y = pc.bob; veh.group.rotation.z = tipZ; veh.group.position.x = tipX; veh.fork.rotation.y = dead ? 0 : -vx * .3;
    spinWheels(veh, dt, dead ? Math.max(0, 14 - G.deadT * 14) : (G.speed || 0));
  }

  /* ---------------------------------------------------------------- scenery */
  const SLOTS = { lamps: [], parked: [] };
  const lampCount = 12, lampSp = 26, parkedN = 12, parkedSp = 15;
  let facMat = [], facLit = [], shopMats = [], boardTex = [];
  const BU = [];      // building pool entries
  let skyline = [];
  const dummy = new T.Object3D();
  const NIGHT = { n: 0 }; let frameDt = .016;

  function setBoxUV(geo, w, h, d, tw, th, ou, ov) {
    const uv = geo.attributes.uv, base = geo.userData.baseUV || (geo.userData.baseUV = Float32Array.from(uv.array));
    const sc = [[d / tw, h / th], [d / tw, h / th], [w / tw, d / th], [w / tw, d / th], [w / tw, h / th], [w / tw, h / th]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, base[i * 2] * sc[f][0] + ou, base[i * 2 + 1] * sc[f][1] + ov); }
    uv.needsUpdate = true;
  }
  function makeBuilding() {
    const geo = new T.BoxGeometry(1, 1, 1), body = new T.Mesh(geo, facMat[0]);
    body.receiveShadow = true;
    const sgeo = new T.PlaneGeometry(1, 1), shop = new T.Mesh(sgeo, shopMats[0]); shop.receiveShadow = false;
    const g = new T.Group(); g.add(body, shop); g.visible = false; scene.add(g);
    return { root: g, body, shop, geo, sgeo };
  }
  function placeBuilding(e, b) {
    const rr = srand(b.seed + 7), side = b.side === 0 ? -1 : 1;
    const wd = Math.max(9, Math.round((9 + b.w * 2.4) / 3) * 3), dp = Math.max(9, Math.round(b.depth / 3) * 3);
    const hh = Math.max(3.2, Math.round((8 + (b.h - 6) * 2.0) * BF / 3.2) * 3.2);
    const st = b.tone + (b.seed % 2 ? 1 : 0); e.body.material = facMat[st % 4];
    e.body.scale.set(wd, hh, dp);
    setBoxUV(e.geo, wd, hh, dp, 18, 12.8, Math.floor(rr() * 6) / 6, Math.floor(rr() * 4) / 4);
    e.body.position.set(side * (WALK_OUT + wd / 2), hh / 2, 0);
    const hasShop = (b.seed % 7) !== 0 && cur.shops > .5;
    e.shop.visible = hasShop;
    if (hasShop) {
      e.shop.material = shopMats[b.seed % SHOPS.length];
      e.shop.scale.set(dp * .96, 3.6, 1); e.shop.position.set(side * (WALK_OUT - .04), 1.8, 0); e.shop.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const uv = e.sgeo.attributes.uv, u = dp * .96 / 12, o = Math.floor(rr() * 4) / 4; // plane uv: (0,1)(1,1)(0,0)(1,0)
      uv.setXY(0, o, 1); uv.setXY(1, o + u, 1); uv.setXY(2, o, 0); uv.setXY(3, o + u, 0); uv.needsUpdate = true;
    }
    e.sig = b; e.bk = BKEY; e.root.visible = BF > .05;
  }
  function makeBoard() {
    const g = new T.Group(), tex = ctex(512, 256, drawBoard(''), false);
    const mat = new T.MeshBasicMaterial({ map: tex });
    const panel = new T.Mesh(new T.PlaneGeometry(7.2, 3.6), mat); panel.position.set(0, 8.2, .08);
    const back = new T.Mesh(new T.BoxGeometry(7.5, 3.9, .2), new T.MeshLambertMaterial({ color: 0x23272d })); back.position.set(0, 8.2, 0);
    const posts = new T.Mesh(merge([bx(.25, 6.4, .25, -2.2, 3.2, -.1, '#3a3d42'), bx(.25, 6.4, .25, 2.2, 3.2, -.1, '#3a3d42')]), matVeh);
    g.add(back, panel, posts); g.visible = false; scene.add(g);
    return { root: g, tex, text: '', panel };
  }

  function buildScene() {
    // sky dome
    const sg = new T.SphereGeometry(300, 24, 16); skyCol = new Float32Array(sg.attributes.position.count * 3);
    sg.setAttribute('color', new T.BufferAttribute(skyCol, 3));
    sky = new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10; scene.add(sky);
    sunDisc = new T.Mesh(new T.CircleGeometry(11, 24), new T.MeshBasicMaterial({ color: 0xffe2b0, fog: false, transparent: true, opacity: .9, depthWrite: false }));
    sunDisc.position.set(-105, 28, -270); sunDisc.lookAt(0, 0, 0); sunDisc.renderOrder = -9; scene.add(sunDisc);
    // lights
    hemi = new T.HemisphereLight(0x8e9bb5, 0x4a3f3a, .9); scene.add(hemi);
    sun = new T.DirectionalLight(0xffb070, 2.2); sun.position.set(-22, 24, 24); sun.target.position.set(0, 0, -16);
    sun.castShadow = true; const ss = mobile ? 1024 : 2048; sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 110; sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
    scene.add(sun, sun.target);
    fill = new T.DirectionalLight(0x8fa3d0, .7); fill.position.set(18, 10, 20); scene.add(fill);
    // ground: road + sidewalks + curbs
    roadTex = ctex(512, 1024, drawRoad, true); roadTex.repeat.set(1, 300 / 12);
    roadMat = new T.MeshLambertMaterial({ map: roadTex }); const road = new T.Mesh(new T.PlaneGeometry(ROAD_HALF * 2, 300), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -140); road.receiveShadow = true; scene.add(road);
    walkTexL = ctex(256, 512, drawWalk, true); walkTexL.repeat.set(1, 300 / 7);
    const wmat = new T.MeshLambertMaterial({ map: walkTexL }); walkMat = wmat;
    for (const s of [-1, 1]) {
      const wk = new T.Mesh(new T.PlaneGeometry(WALK_OUT - CURB_X, 300), wmat); wk.rotation.x = -Math.PI / 2; wk.position.set(s * (CURB_X + WALK_OUT) / 2, .16, -140); wk.receiveShadow = true; scene.add(wk);
      const cb = new T.Mesh(new T.BoxGeometry(.24, .17, 300), new T.MeshLambertMaterial({ color: 0x9a9893 })); cb.position.set(s * (CURB_X - .02), .085, -140); cb.receiveShadow = true; scene.add(cb);
    }
    // outer ground (under far skyline)
    const gnd = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: 0x35343a })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, -.05, -140); scene.add(gnd); ground = gnd;
    // facades & shops
    FAC.forEach((st, i) => {
      const map = ctex(480, 320, drawFacade(st, false), true), em = ctex(480, 320, drawFacade(st, true), true);
      facMat.push(new T.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: .2 }));
    });
    SHOPS.forEach((s, i) => {
      const map = ctex(1024, 300, drawShop(i, false), true), em = ctex(1024, 300, drawShop(i, true), true);
      shopMats.push(new T.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: .55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    });
    pool('bld', makeBuilding); pool('board', makeBoard); buildSky2(); buildProps(); buildItems(); buildItemsTask();
    // far skyline
    const classes = [[26, 7], [44, 7], [70, 6]];
    classes.forEach((c, ci) => {
      const geo = new T.BoxGeometry(1, 1, 1); setBoxUV(geo, 18, c[0], 18, 18, 12.8, 0, 0);
      const im = new T.InstancedMesh(geo, facMat[ci % 3 + 1 > 3 ? 1 : (ci + 1) % 4], c[1] * 2); im.frustumCulled = false; scene.add(im);
      skyline.push({ im, h: c[0], n: c[1] });
    });
    // lamps
    const poleG = merge([cylV(.1, .07, 8.2, 0, 4.1, 0, '#2e3236', 7), bx(1.9, .09, .09, -.95, 8.15, 0, '#2e3236'), bx(.6, .12, .95, -1.75, 8.05, 0, '#3a3e42'), bx(.4, .3, .4, 0, .15, 0, '#2a2d30')]);
    lampPoles = new T.InstancedMesh(poleG, matVeh, lampCount * 2); lampPoles.castShadow = true; lampPoles.frustumCulled = false; scene.add(lampPoles);
    lampHeads = new T.InstancedMesh(new T.BoxGeometry(.5, .06, .8), new T.MeshBasicMaterial({ color: 0xffe0a8 }), lampCount * 2); lampHeads.frustumCulled = false; scene.add(lampHeads);
    const poolTex = ctex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,214,150,.85)'); gr.addColorStop(.5, 'rgba(255,200,130,.28)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
    lampPools = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }), lampCount * 2);
    lampPools.frustumCulled = false; lampPools.renderOrder = 1; scene.add(lampPools);
    for (let i = 0; i < lampCount; i++) for (const s of [0, 1]) SLOTS.lamps.push({ base: i * lampSp + (s ? lampSp / 2 : 0), side: s ? 1 : -1 });
    // parked cars
    pool('parked', () => { const v = makeVeh(); v.body.castShadow = true; return v; });
    for (let i = 0; i < parkedN; i++) for (const s of [-1, 1]) SLOTS.parked.push({ base: i * parkedSp + (s > 0 ? 7 : 0), side: s, prev: 1e9, e: null, present: false, seed: 0 });
    // obstacles
    pool('veh', makeVeh);
    const mk = (geo, lightsGeo) => () => { const g = new T.Group(), m = new T.Mesh(geo, matVeh); m.castShadow = true; m.receiveShadow = true; g.add(m); if (lightsGeo) g.add(new T.Mesh(lightsGeo, matLight)); g.visible = false; scene.add(g); return { root: g }; };
    pool('jersey', mk(geoJersey())); pool('saw', mk(geoSaw())); pool('cones', mk(geoCones()));
    const gtex = ctex(512, 340, drawGantry, false); matGantry = new T.MeshLambertMaterial({ map: gtex });
    pool('gantry', () => {
      const g = new T.Group(), posts = new T.Mesh(geoGantryPosts(), matVeh); posts.castShadow = true;
      const panel = new T.Mesh(new T.BoxGeometry(2.7, 1.66, .1), matGantry); panel.position.set(0, 1.47, 0); panel.castShadow = true;
      g.add(posts, panel, new T.Mesh(geoGantryLamps(), matLight)); g.visible = false; scene.add(g); return { root: g };
    });
    // cash + jammer
    const cashG = merge([bx(.5, .13, .26, 0, 0, 0, '#5f9e5a'), bx(.11, .135, .265, 0, 0, 0, '#d9d6b8')]);
    R.cash = new T.InstancedMesh(cashG, new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x1d4a1d, emissiveIntensity: .8 }), 200); R.cash.frustumCulled = false; R.cash.castShadow = true; scene.add(R.cash);
    pool('jammer', () => {
      const g = new T.Group();
      const body = new T.Mesh(merge([bx(.36, .24, .2, 0, 0, 0, '#2b3036'), cylV(.015, .015, .4, .12, .3, 0, '#8a9097', 5), cylV(.015, .015, .3, -.12, .27, 0, '#8a9097', 5), bx(.24, .07, .02, 0, .02, .105, '#5c6770')]), matVeh);
      const led = new T.Mesh(new T.BoxGeometry(.07, .05, .05), new T.MeshBasicMaterial({ color: 0x7fd4ff })); led.position.set(.12, .52, 0);
      const ring = new T.Mesh(new T.RingGeometry(.42, .52, 32), new T.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2;
      const beam = new T.Mesh(new T.CylinderGeometry(.46, .46, 2.4, 20, 1, true), new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .13, side: T.DoubleSide, depthWrite: false })); beam.position.y = 1.2;
      const hover = new T.Group(); hover.add(body, led); hover.scale.setScalar(1.7);
      g.add(hover, ring, beam); g.visible = false; scene.add(g); return { root: g, hover, ring };
    });
  }

  /* ---------------------------------------------------------------- stage props (instanced, per-stage weights fade them in/out) */
  const PROPS = [];
  function ico(r, sx, sy, sz, x, y, z, hex, det) { const g = new T.IcosahedronGeometry(r, det === undefined ? 1 : det); g.scale(sx, sy, sz); g.translate(x, y, z); return paint(g, hex); }
  function bxr(w, h, d, x, y, z, hex, rx, ry, rz) { const g = new T.BoxGeometry(w, h, d); g.rotateX(rx || 0); g.rotateY(ry || 0); g.rotateZ(rz || 0); g.translate(x, y, z); return paint(g, hex); }
  function cone(r0, r1, h, x, y, z, hex, seg) { const g = new T.CylinderGeometry(r1, r0, h, seg || 8); g.translate(x, y, z); return paint(g, hex); }
  const PROP_GEO = {
    palm() {
      const L = [cylV(.26, .22, 2.6, 0, 1.3, 0, '#7a6048', 7), cylV(.22, .18, 2.6, .12, 3.8, 0, '#85694f', 7), cylV(.18, .15, 2.4, .32, 6.2, 0, '#8d7155', 7)];
      for (let i = 0; i < 9; i++) { const g = new T.BoxGeometry(.55, .05, 3.3); g.translate(0, 0, 1.65); g.rotateX(.42 + (i % 3) * .12); g.rotateY(i * Math.PI * 2 / 9); g.translate(.4, 7.4, 0); L.push(paint(g, i % 2 ? '#3f6b34' : '#4b7a3b')); }
      L.push(ico(.22, 1, 1, 1, .5, 7.1, .2, '#5a4328', 0), ico(.22, 1, 1, 1, .3, 7.1, -.25, '#5a4328', 0)); return merge(L);
    },
    rail() { return merge([bx(.5, 1.0, 4, 0, .5, 0, '#8d8b86'), bx(.14, .14, 4, 0, 1.12, 0, '#a7aaad'), bx(.6, .12, .6, 0, 1.0, -1.9, '#7c7a76'), bx(.6, .12, .6, 0, 1.0, 1.9, '#7c7a76')]); },
    pylon() {
      const L = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const g = new T.CylinderGeometry(.14, .38, 22, 5); g.translate(0, 11, 0); g.rotateZ(-sx * .06); g.rotateX(sz * .06); g.translate(sx * 1.6, 0, sz * 1.6); L.push(paint(g, '#aab0b6')); }
      for (const y of [6, 12, 17]) L.push(bx(4.2, .18, .18, 0, y, 1.1, '#aab0b6'), bx(4.2, .18, .18, 0, y, -1.1, '#aab0b6'), bx(.18, .18, 4.2, 1.0, y, 0, '#aab0b6'), bx(.18, .18, 4.2, -1.0, y, 0, '#aab0b6'));
      L.push(bx(12, .22, .22, 0, 19.5, 0, '#aab0b6'), bx(8, .22, .22, 0, 21.2, 0, '#aab0b6')); return merge(L);
    },
    toll() {
      const L = [bx(16, .7, 5.4, 0, 7.2, 0, '#cfcdc6'), bx(16.2, .22, 5.5, 0, 6.78, 0, '#3a5b7e'), bx(14, .08, .5, 0, 6.66, 0, '#fff0cc'), bx(.9, 7, .9, -7.2, 3.5, 0, '#c4c1b9'), bx(.9, 7, .9, 7.2, 3.5, 0, '#c4c1b9')];
      for (const s of [-1, 1]) { L.push(bx(1.9, 2.5, 3.4, s * 7.7, 1.25, 0, '#e4e0d6'), bx(.06, .9, 2.2, s * 6.74, 1.6, 0, '#33414f'), bx(2.1, .15, 3.6, s * 7.7, 2.55, 0, '#3a5b7e')); }
      return merge(L);
    },
    stallA() { return merge([bx(2.3, .9, 1.3, 0, .45, 0, '#7c5b3b'), bx(2.1, .22, 1.1, 0, 1.0, 0, '#d4a23f'), bx(.8, .4, .6, -.5, 1.3, 0, '#c8553d'), bx(.06, 2.7, .06, -1, 1.35, -.55, '#cfcfcf'), bx(.06, 2.7, .06, 1, 1.35, -.55, '#cfcfcf'), cone(2.1, 0.1, .7, 0, 2.95, 0, '#b8402f', 8)]); },
    stallB() { return merge([bx(2.4, .8, 1.2, 0, .4, .1, '#6d5136'), bx(.65, .6, .65, -.9, 1.1, .1, '#a07a4b'), bx(.65, .6, .65, -.2, 1.1, .1, '#b48a55'), bx(.5, .5, .5, .6, 1.05, .1, '#8f6a3f'), bxr(2.8, .08, 2.2, 0, 2.55, .15, '#2f6f8f', .12, 0, 0), bx(.06, 2.5, .06, -1.3, 1.25, -.7, '#cfcfcf'), bx(.06, 2.2, .06, 1.3, 1.1, -.7, '#cfcfcf')]); },
    tree() { return merge([cylV(.28, .2, 3.2, 0, 1.6, 0, '#5a4631', 7), ico(1.7, 1, .9, 1, 0, 4.2, 0, '#3f6e3a'), ico(1.25, 1, 1, 1, .9, 4.8, .4, '#4a7d42'), ico(1.2, 1, 1, 1, -.9, 4.5, -.4, '#477840')]); },
    flag() { return merge([cylV(.07, .05, 8.4, 0, 4.2, 0, '#c9ccd0', 6), bx(.04, 1.1, .6, 0, 7.5, .35, '#1f7a46'), bx(.045, 1.1, .6, 0, 7.5, .95, '#f2f2ef'), bx(.04, 1.1, .6, 0, 7.5, 1.55, '#1f7a46')]); },
    container() {
      const L = [bx(2.44, 2.6, 6.1, 0, 1.3, 0, '#ffffff')];
      for (let i = 0; i < 9; i++) for (const s of [-1, 1]) L.push(bx(.07, 2.4, .16, s * 1.22, 1.3, -2.7 + i * .67, '#b8b8b8'));
      L.push(bx(2.5, .12, 6.15, 0, 2.6, 0, '#9a9a9a')); return merge(L);
    },
    crane() {
      const L = []; for (const x of [-6, 6]) for (const z of [-3.5, 3.5]) L.push(bx(.7, 20, .7, x, 10, z, '#c9a13a'));
      L.push(bx(14, 1.2, 8.4, 0, 20.4, 0, '#c9a13a'), bx(.5, .5, 8, -6, 8, 0, '#b88f2e'), bx(.5, .5, 8, 6, 8, 0, '#b88f2e'), bx(34, 1.0, 1.2, 14, 21.6, 0, '#d2aa40'), bx(.35, 4, .35, 30, 19.5, 0, '#8a8a8a'), bx(1.6, 1.0, 1.6, 30, 17.2, 0, '#6a6e72')); return merge(L);
    },
    pole() { return merge([cylV(.15, .12, 9, 0, 4.5, 0, '#6b5a48', 6), bx(2.8, .13, .13, 0, 8.4, 0, '#574838'), bx(2.0, .13, .13, 0, 7.6, 0, '#574838'), bx(.1, .22, .1, -1.3, 8.6, 0, '#cfd3d6'), bx(.1, .22, .1, 1.3, 8.6, 0, '#cfd3d6'), bx(.1, .22, .1, 0, 8.6, 0, '#cfd3d6')]); },
    rock() { return merge([ico(1, 1.3, .8, 1, 0, .45, 0, '#9d8b6a', 1), ico(.6, 1, .8, 1, 1.1, .25, .4, '#8e7d5e', 0)]); },
    scrub() { return merge([ico(.5, 1.2, .7, 1, 0, .3, 0, '#8a7f4a', 0), ico(.35, 1, .8, 1, .5, .22, .25, '#9a8d52', 0), ico(.3, 1, .8, 1, -.4, .2, -.2, '#7d7442', 0)]); },
    tank() { return merge([cylV(4, 4, 8.5, 0, 4.25, 0, '#b4b8ba', 14), cone(4.1, 3.2, 1.2, 0, 9.1, 0, '#9ea3a6', 14), bx(.5, 9, .5, 4.3, 4.5, 0, '#6e7478'), bx(1.1, .25, 5, 3.6, 8, 0, '#6e7478'), bx(8.2, .3, .3, 0, 3, 0, '#8a9094')]); },
    chimney() { return merge([cylV(1.9, 1.35, 26, 0, 13, 0, '#8e6a5c', 10), cylV(1.45, 1.38, 3, 0, 22.5, 0, '#d8d8d4', 10), cylV(1.41, 1.36, 3, 0, 17, 0, '#d8d8d4', 10), cylV(1.5, 1.5, .5, 0, 26.2, 0, '#444', 10), bx(6, 4, 6, 0, 2, 5, '#6c7074')]); },
    acacia() { return merge([cylV(.5, .32, 4.8, 0, 2.4, 0, '#5b4631', 6), bxr(.25, 2.4, .25, .9, 5.2, 0, '#5b4631', 0, 0, -.7), bxr(.25, 2.2, .25, -.9, 5.1, 0, '#5b4631', 0, 0, .7), ico(1, 4.8, .85, 4.2, 0, 6.5, 0, '#6c7c3a'), ico(1, 3, .6, 2.8, 1.8, 7.3, 1, '#78883f')]); },
    baobab() { return merge([cylV(1.5, 2.2, 6.5, 0, 3.25, 0, '#8a6f55', 10), cylV(1.3, 1.5, 2.5, 0, 7.5, 0, '#8a6f55', 8), bxr(.4, 3.2, .4, 1.6, 9.6, 0, '#7d6249', 0, 0, -.9), bxr(.4, 3.2, .4, -1.6, 9.6, 0, '#7d6249', 0, 0, .9), bxr(.4, 3.2, .4, 0, 9.6, 1.5, '#7d6249', .9, 0, 0), ico(1, 3.2, 1.3, 3.2, 0, 11.7, 0, '#5f7a35', 1)]); },
    grass() { const L = []; for (let i = 0; i < 6; i++) { const a = i * 1.05; L.push(cone(.2, 0, .9 + (i % 3) * .3, Math.cos(a) * .35, .5, Math.sin(a) * .35, i % 2 ? '#b09f50' : '#9f8f45', 4)); } return merge(L); }
  };
  // sp: metres between slots (per side), n: slots per side, x: [min,max] distance from road centre, sc: scale range, both: mirrored sides
  const PROP_DEF = {
    palm: { sp: 24, n: 8, x: [7.0, 8.9], sc: [.85, 1.25] }, rail: { sp: 4, n: 42, x: [9.35, 9.35], sc: [1, 1], yaw: 'road', solid: true }, pylon: { sp: 42, n: 4, x: [19, 30], sc: [.9, 1.3] },
    toll: { sp: 72, n: 3, x: [0, 0], sc: [1, 1], single: true }, stallA: { sp: 12, n: 14, x: [7.4, 8.7], sc: [.95, 1.1] }, stallB: { sp: 12, n: 14, x: [7.4, 8.7], sc: [.95, 1.1], off: 6 },
    tree: { sp: 15, n: 11, x: [7.2, 8.4], sc: [.85, 1.2] }, flag: { sp: 32, n: 5, x: [6.7, 6.9], sc: [1, 1], yaw: 'road' },
    container: { sp: 15, n: 11, x: [7.9, 8.2], sc: [1, 1], stack: 3, colors: ['#9b3b2f', '#2f5d8c', '#3f7a4f', '#c58a2a', '#6b6f73', '#7a4a7e', '#d0d0cc'], yaw: 'axis' },
    crane: { sp: 75, n: 3, x: [22, 26], sc: [1, 1], yaw: 'road' }, pole: { sp: 30, n: 6, x: [7.9, 8.4], sc: [1, 1] }, rock: { sp: 17, n: 10, x: [10, 34], sc: [.8, 2.6], yaw: 'rand' },
    scrub: { sp: 7, n: 24, x: [7, 17], sc: [.8, 1.6], yaw: 'rand' }, tank: { sp: 38, n: 4, x: [24, 32], sc: [.9, 1.3] }, chimney: { sp: 56, n: 3, x: [22, 34], sc: [.9, 1.2] },
    acacia: { sp: 22, n: 8, x: [10, 32], sc: [.85, 1.4], yaw: 'rand' }, baobab: { sp: 62, n: 3, x: [14, 36], sc: [.9, 1.3], yaw: 'rand' }, grass: { sp: 5, n: 34, x: [6.6, 15], sc: [.8, 1.6], yaw: 'rand' }
  };
  function buildProps() {
    for (const kind in PROP_DEF) {
      const D = PROP_DEF[kind], geo = PROP_GEO[kind](), rr = srand(kind.length * 977 + kind.charCodeAt(0) * 31);
      const slots = [], sides = D.single ? [0] : [-1, 1];
      for (const side of sides) for (let i = 0; i < D.n; i++) {
        const r1 = rr() * .72, r2 = rr(), r3 = rr(), r4 = rr();
        slots.push({ base: i * D.sp + (side > 0 ? D.sp / 2 : 0) + (D.off || 0) + (D.sp > 8 ? (r4 - .5) * D.sp * .3 : 0), side, r1, x: side * (D.x[0] + (D.x[1] - D.x[0]) * r2), sc: D.sc[0] + (D.sc[1] - D.sc[0]) * r3,
          yaw: D.yaw === 'rand' ? r3 * 6.28 : D.yaw === 'road' ? (side > 0 ? Math.PI : 0) : D.yaw === 'axis' ? (r4 < .5 ? 0 : Math.PI) : 0, col: D.colors ? D.colors[(r4 * D.colors.length) | 0] : null, stk: D.stack ? 1 + ((r3 * D.stack) | 0) : 1 });
      }
      const im = new T.InstancedMesh(geo, matVeh, slots.length * (D.stack || 1)); im.frustumCulled = false; im.visible = false;
      if (D.colors) { im.setColorAt(0, _c.set(D.colors[0])); }
      scene.add(im); PROPS.push({ kind, D, im, slots, tot: D.n * D.sp, colored: !!D.colors });
    }
  }
  function syncProps(G) {
    const d = G.dist;
    for (const P of PROPS) {
      const w = cur.props[P.kind] || 0;
      if (w <= .01) { P.im.visible = false; continue; }
      P.im.visible = true; let k = 0;
      for (const s of P.slots) {
        const f = clamp((w - s.r1) * 4, 0, 1); if (f <= 0) continue;
        const z = mod(s.base - d, P.tot) - 24;
        for (let lv = 0; lv < s.stk; lv++) {
          dummy.position.set(s.x, lv * 2.6 * (P.D.stack ? 1 : 0), -z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.setScalar(s.sc * f); dummy.updateMatrix();
          P.im.setMatrixAt(k, dummy.matrix); if (P.colored) P.im.setColorAt(k, _c.set(s.col)); k++;
        }
      }
      P.im.count = k; P.im.instanceMatrix.needsUpdate = true; if (P.colored && P.im.instanceColor) P.im.instanceColor.needsUpdate = true;
    }
    // rain streaks fall in world space and rush toward the camera with the road
    if (rain) {
      rain.visible = cur.rain > .02;
      if (rain.visible) {
        const pa = rain.geometry.attributes.position, a = pa.array, sp = G.speed || 0, dt = G.attract ? .016 : frameDt;
        for (let i = 0; i < rainN; i++) {
          let x = rainP[i * 3], y = rainP[i * 3 + 1], z = rainP[i * 3 + 2];
          y -= 26 * dt; z += sp * dt; if (y < 0 || z > 12) { x = (Math.random() - .5) * 36; y = 10 + Math.random() * 8; z = -70 + Math.random() * 80; }
          rainP[i * 3] = x; rainP[i * 3 + 1] = y; rainP[i * 3 + 2] = z;
          a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x; a[i * 6 + 4] = y + .7; a[i * 6 + 5] = z - sp * dt * 1.4 - .12;
        }
        pa.needsUpdate = true; rain.material.opacity = .32 * cur.rain;
      }
    }
  }
  let rain = null, stars = null; const rainN = 260, rainP = new Float32Array(rainN * 3);
  function buildSky2() {
    const sp = []; const rr = srand(4242);
    for (let i = 0; i < 380; i++) { const a = rr() * Math.PI * 2, e = .12 + rr() * .88, r = 285; sp.push(Math.cos(a) * Math.cos(e * 1.3) * r, Math.sin(e * 1.3) * r, Math.sin(a) * Math.cos(e * 1.3) * r); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    stars = new T.Points(g, new T.PointsMaterial({ color: 0xe6ebf5, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false })); stars.renderOrder = -9.5; stars.frustumCulled = false; scene.add(stars);
    for (let i = 0; i < rainN; i++) { rainP[i * 3] = (Math.random() - .5) * 36; rainP[i * 3 + 1] = Math.random() * 16; rainP[i * 3 + 2] = -70 + Math.random() * 80; }
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(new Float32Array(rainN * 6), 3));
    rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xb4c2d0, transparent: true, opacity: .3, depthWrite: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  }

  /* ---------------------------------------------------------------- road items: letters, turbo pads, ramps, x2 tokens */
  const letterMats = {}, itemRes = {};
  function glyphMat(ch) {
    if (letterMats[ch]) return letterMats[ch];
    const tex = ctex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f6f0e0'; g.font = '700 ' + (ch.length > 1 ? 66 : 92) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h / 2 + 5); }, false);
    return (letterMats[ch] = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  function buildItems() {
    const R_ = itemRes;
    R_.ring = { letter: new T.MeshLambertMaterial({ color: 0xd2a63c, emissive: 0x3a2a08, emissiveIntensity: .8 }), x2: new T.MeshLambertMaterial({ color: 0x5f9f74, emissive: 0x0c2a16, emissiveIntensity: .8 }) };
    R_.disc = new T.MeshLambertMaterial({ color: 0x20262f });
    const ringG = new T.CylinderGeometry(.66, .66, .14, 22); ringG.rotateX(Math.PI / 2);
    const discG = new T.CylinderGeometry(.55, .55, .18, 22); discG.rotateX(Math.PI / 2);
    const plane = new T.PlaneGeometry(.82, .82);
    pool('letter', () => {
      const g = new T.Group(), hub = new T.Group(), ring = new T.Mesh(ringG, R_.ring.letter), disc = new T.Mesh(discG, R_.disc);
      const f = new T.Mesh(plane, glyphMat('A')), b = new T.Mesh(plane, glyphMat('A')); f.position.z = .1; b.position.z = -.1; b.rotation.y = Math.PI;
      ring.castShadow = true; hub.add(ring, disc, f, b); g.add(hub); g.visible = false; scene.add(g); return { root: g, hub, ring, f, b, ch: '' };
    });
    // turbo pad: dark plate with scrolling amber chevrons
    R_.padTex = ctex(256, 512, (g, w, h) => {
      g.fillStyle = '#2a2d31'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b6f73'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#e0ac45'; for (let i = 0; i < 4; i++) { const y = h - 70 - i * 120; g.beginPath(); g.moveTo(40, y); g.lineTo(w / 2, y - 70); g.lineTo(w - 40, y); g.lineTo(w - 40, y + 38); g.lineTo(w / 2, y - 32); g.lineTo(40, y + 38); g.closePath(); g.fill(); }
    }, true);
    R_.padTex.repeat.set(1, 1);
    pool('pad', () => { const g = new T.Group(), m = new T.Mesh(new T.PlaneGeometry(2.1, 4.6), new T.MeshLambertMaterial({ map: R_.padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, emissive: 0x4a3410, emissiveIntensity: .5 })); m.rotation.x = -Math.PI / 2; m.position.y = .035; m.receiveShadow = true; g.add(m); g.visible = false; scene.add(g); return { root: g }; });
    // ramp: grey wedge + hazard-striped slope
    const W = 2.3, L = 3.4, H = 1.25, sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, H); sh.lineTo(0, 0);
    const wg = new T.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false }); wg.rotateY(Math.PI / 2); wg.translate(-W / 2, 0, L / 2);
    R_.stripeTex = ctex(256, 256, (g, w, h) => { g.fillStyle = '#2b2d30'; g.fillRect(0, 0, w, h); g.fillStyle = '#d99a3a'; for (let x = -h; x < w + h; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 32 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); } }, true);
    R_.stripeTex.repeat.set(2, 3);
    const hyp = Math.hypot(L, H);
    pool('ramp', () => {
      const g = new T.Group(), body = new T.Mesh(wg, new T.MeshLambertMaterial({ color: 0x6f7378 })); body.castShadow = true; body.receiveShadow = true;
      const sl = new T.Mesh(new T.PlaneGeometry(W - .1, hyp), new T.MeshLambertMaterial({ map: R_.stripeTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      sl.rotation.x = -Math.PI / 2 + Math.atan2(H, L); sl.position.set(0, H / 2 + .01, 0); sl.rotation.order = 'XYZ';
      g.add(body, sl); g.visible = false; scene.add(g); return { root: g };
    });
  }
  function buildItemsTask() {
    const R_ = itemRes;
    /* ---- location task items: brass key, lockbox, parcel, drop ring, port-pass relics. Each wears a slow teal halo so it reads as 'the special thing'. */
    const brass = new T.MeshStandardMaterial({ color: 0xd2a63c, roughness: .35, metalness: .8 }), steel = new T.MeshStandardMaterial({ color: 0x77808a, roughness: .45, metalness: .75 }),
      steelD = new T.MeshStandardMaterial({ color: 0x3b4149, roughness: .5, metalness: .6 }), card = new T.MeshStandardMaterial({ color: 0xb98d58, roughness: .85 }), cardD = new T.MeshStandardMaterial({ color: 0x8e6a3e, roughness: .9 }),
      tape = new T.MeshStandardMaterial({ color: 0xe0d2a8, roughness: .6 }), halo = new T.MeshBasicMaterial({ color: 0x7fc4c8, transparent: true, opacity: .55, depthWrite: false });
    const haloG = new T.TorusGeometry(.7, .028, 8, 36);
    const beamG = new T.CylinderGeometry(.16, .3, 7, 10, 1, true), beamM = new T.MeshBasicMaterial({ color: 0xbfe0de, transparent: true, opacity: .2, depthWrite: false, side: T.DoubleSide });
    const mkHalo = () => { const g = new T.Group(), h = new T.Mesh(haloG, halo), bm = new T.Mesh(beamG, beamM); bm.position.y = 3.2; g.add(h, bm); return g; };
    const bxm = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
    pool('key', () => {
      const g = new T.Group(), hub = new T.Group(), k = new T.Group();
      const bow = new T.Mesh(new T.TorusGeometry(.17, .055, 10, 22), brass); bow.position.y = .3; bow.castShadow = true;
      k.add(bow, bxm(.08, .56, .06, brass, 0, -.02, 0), bxm(.2, .07, .06, brass, .1, -.2, 0), bxm(.15, .07, .06, brass, .075, -.06, 0)); k.scale.setScalar(1.6); k.rotation.z = .5; hub.add(k, mkHalo()); g.add(hub); g.visible = false; scene.add(g); return { root: g, hub };
    });
    pool('lockbox', () => {
      const g = new T.Group(), hub = new T.Group();
      const sh = new T.Mesh(new T.TorusGeometry(.07, .022, 8, 14, Math.PI), brass); sh.position.set(0, .27, .28);
      hub.add(bxm(.78, .5, .5, steel, 0, 0, 0), bxm(.8, .14, .52, steelD, 0, .3, 0), bxm(.1, .52, .54, steelD, -.24, 0, 0), bxm(.1, .52, .54, steelD, .24, 0, 0), bxm(.14, .18, .06, brass, 0, .1, .27), sh, mkHalo()); g.add(hub); g.scale.setScalar(1.1); g.visible = false; scene.add(g); return { root: g, hub };
    });
    pool('parcel', () => {
      const g = new T.Group(), hub = new T.Group();
      hub.add(bxm(.66, .46, .5, card, 0, 0, 0), bxm(.68, .04, .52, cardD, 0, .235, 0), bxm(.1, .47, .52, tape, 0, 0, 0), bxm(.24, .16, .02, new T.MeshStandardMaterial({ color: 0xf0ece0, roughness: .8 }), .16, .02, .26), mkHalo()); g.add(hub); g.visible = false; scene.add(g); return { root: g, hub };
    });
    pool('drop', () => {
      const g = new T.Group(), ring = new T.Mesh(new T.RingGeometry(1.0, 1.25, 40), new T.MeshBasicMaterial({ color: 0x7fc4c8, transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const inner = new T.Mesh(new T.CircleGeometry(.95, 36), new T.MeshBasicMaterial({ color: 0x2c6e72, transparent: true, opacity: .45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      const wm = new T.MeshBasicMaterial({ color: 0xe8e4d6 }), c1 = bxm(.12, .02, 1.3, wm, 0, .02, 0), c2 = bxm(1.3, .02, .12, wm, 0, .02, 0);
      ring.rotation.x = inner.rotation.x = -Math.PI / 2; ring.position.y = .05; inner.position.y = .045; g.add(inner, ring, c1, c2); g.scale.set(1.05, 1, 1.35); g.visible = false; scene.add(g); return { root: g, ring };
    });
    pool('relic', () => {
      const g = new T.Group(), hub = new T.Group(), v = [];
      const seal = new T.Group(); seal.add(new T.Mesh(new T.CylinderGeometry(.22, .26, .1, 20), new T.MeshStandardMaterial({ color: 0x8e2f2f, roughness: .5, metalness: .3 })), new T.Mesh(new T.CylinderGeometry(.1, .12, .3, 14), brass)); seal.children[1].position.y = .2; seal.rotation.x = .25;
      const man = new T.Group(); man.add(bxm(.5, .66, .05, new T.MeshStandardMaterial({ color: 0xe6e2d4, roughness: .8 }), 0, 0, 0), bxm(.5, .08, .06, new T.MeshStandardMaterial({ color: 0x2f4f78, roughness: .6 }), 0, .3, 0), bxm(.34, .03, .06, steelD, 0, .1, 0), bxm(.34, .03, .06, steelD, 0, 0, 0), bxm(.34, .03, .06, steelD, 0, -.1, 0));
      const ck = new T.Group(), rg = new T.Mesh(new T.TorusGeometry(.14, .04, 8, 18), steel); rg.position.y = .3; ck.add(rg, bxm(.07, .5, .05, steel, 0, .02, 0), bxm(.16, .06, .05, steel, .08, -.14, 0), bxm(.12, .06, .05, steel, .06, -.02, 0), bxm(.5, .1, .06, brass, 0, -.3, 0));
      for (const o of [seal, man, ck]) { o.scale.setScalar(1.3); o.visible = false; hub.add(o); v.push(o); }
      hub.add(mkHalo()); g.add(hub); g.visible = false; scene.add(g); return { root: g, hub, v };
    });
    R_.ring.tletter = new T.MeshLambertMaterial({ color: 0x4f9ea3, emissive: 0x0d2a2c, emissiveIntensity: .8 });
  }
  function syncItems(G) {
    if (!G.items) return;
    for (const it of G.items) {
      if (it.taken || it.z > 135 || it.z + (it.depth || 0) < -6) continue;
      let e = it._v;
      if (!e) { e = it._v = acquire(it.kind === 'x2' || it.kind === 'tletter' ? 'letter' : it.kind); e.owner = it; if (it.kind === 'relic') { e.v.forEach((o, i) => { o.visible = i === it.v; }); } if (it.kind === 'letter' || it.kind === 'x2' || it.kind === 'tletter') { const ch = it.kind === 'x2' ? '×2' : it.ch; if (e.ch !== ch) { e.ch = ch; e.f.material = e.b.material = glyphMat(ch); } e.ring.material = itemRes.ring[it.kind]; } }
      e.stamp = frameId; const x = (it.lane - 1) * LW;
      if (it.kind === 'key' || it.kind === 'lockbox' || it.kind === 'parcel' || it.kind === 'relic') { e.root.position.set(x, (it.y || .95) + Math.sin(G.clock * 2.4 + it.lane) * .06, -it.z); e.hub.rotation.y = G.clock * 1.5; }
      else if (it.kind === 'drop') { e.root.position.set(x, 0, -(it.z + it.depth / 2)); e.ring.rotation.z = G.clock * .6; }
      else if (it.kind === 'letter' || it.kind === 'x2' || it.kind === 'tletter') { e.root.position.set(x, (it.y || .95) + Math.sin(G.clock * 2.4 + it.lane) * .08, -it.z); e.hub.rotation.y = Math.sin(G.clock * 1.8 + it.lane) * .5; }
      else e.root.position.set(x, 0, -(it.z + (it.depth || 0) / 2));
    }
    itemRes.padTex.offset.y = -((G.clock * 1.6) % 1);
  }

  /* ---------------------------------------------------------------- environment: per-stage look, cross-faded over a few seconds */
  const ENV_COLS = ['zen', 'mid', 'hor', 'fog', 'sunCol', 'discCol', 'hemiSky', 'hemiGnd', 'lampCol', 'ground', 'bldTint'];
  const ENV_NUMS = ['fogNear', 'fogFar', 'glow', 'sunInt', 'disc', 'hemiInt', 'fill', 'facEm', 'shopEm', 'lampOn', 'groundY', 'bld', 'sky', 'shops', 'lamps', 'park', 'stars', 'rain'];
  const ENV_VECS = ['sun', 'discPos', 'road', 'walk'];
  const PROP_KINDS = Object.keys(PROP_DEF);
  function mkEnv(s) {
    const e = { props: {} };
    for (const k of ENV_COLS) e[k] = new T.Color(s[k]); for (const k of ENV_NUMS) e[k] = s[k] || 0; for (const k of ENV_VECS) e[k] = (s[k] || [0, 0, 0]).slice();
    for (const k of PROP_KINDS) e.props[k] = (s.props && s.props[k]) || 0; return e;
  }
  function lerpEnv(o, a, b, t) {
    for (const k of ENV_COLS) o[k].copy(a[k]).lerp(b[k], t); for (const k of ENV_NUMS) o[k] = lerp(a[k], b[k], t);
    for (const k of ENV_VECS) for (let i = 0; i < b[k].length; i++) o[k][i] = lerp(a[k][i], b[k][i], t);
    for (const k of PROP_KINDS) o.props[k] = lerp(a.props[k], b.props[k], t);
  }
  const cur = mkEnv(global.STAGES[0]), envA = mkEnv(global.STAGES[0]); let envB = null, envK = 1, envIdx = -1, envDirty = true;
  const ENV_TRANS = 4.5;
  const cz = new T.Color(), cm = new T.Color(), ch = new T.Color(), cg = new T.Color(), sunDir = new T.Vector3(-.38, .1, -1).normalize(), vtmp = new T.Vector3();
  let roadMat, walkMat, BF = 1, BKEY = 0;
  function applyEnv() {
    cz.copy(cur.zen); cm.copy(cur.mid); ch.copy(cur.hor); cg.copy(cur.hor).multiplyScalar(.75);
    sunDir.set(cur.discPos[0], cur.discPos[1], -270).normalize();
    const pos = sky.geometry.attributes.position, glow = cur.glow;
    for (let i = 0; i < pos.count; i++) {
      vtmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const h = vtmp.y; let c;
      if (h <= 0) c = tmpC.copy(ch); else if (h < .28) c = tmpC.copy(ch).lerp(cm, sstep(0, .28, h)); else c = tmpC.copy(cm).lerp(cz, sstep(.28, .9, h));
      const gl = Math.pow(Math.max(0, vtmp.dot(sunDir)), 6) * glow * .9; c.r += cg.r * gl * 1.1; c.g += cg.g * gl; c.b += cg.b * gl * .8;
      skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
    }
    sky.geometry.attributes.color.needsUpdate = true;
    scene.fog.color.copy(cur.fog); scene.fog.near = cur.fogNear; scene.fog.far = cur.fogFar;
    sun.color.copy(cur.sunCol); sun.intensity = cur.sunInt; sun.position.set(cur.sun[0], cur.sun[1], cur.sun[2]);
    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGnd); hemi.intensity = cur.hemiInt; fill.intensity = cur.fill;
    sunDisc.material.opacity = cur.disc; sunDisc.material.color.copy(cur.discCol); sunDisc.position.set(cur.discPos[0], cur.discPos[1], -270); sunDisc.lookAt(0, 0, 0);
    for (const m of facMat) { m.emissiveIntensity = cur.facEm; m.color.copy(cur.bldTint); }
    for (const m of shopMats) m.emissiveIntensity = cur.shopEm;
    const lo = .45 + .55 * cur.lampOn; lampHeads.material.color.copy(cur.lampCol).multiplyScalar(lo); lampPools.material.opacity = cur.lampOn * .75;
    roadMat.color.setRGB(cur.road[0], cur.road[1], cur.road[2]); walkMat.color.setRGB(cur.walk[0], cur.walk[1], cur.walk[2]);
    ground.material.color.copy(cur.ground); ground.position.y = cur.groundY;
    stars.material.opacity = cur.stars * .9; stars.visible = cur.stars > .02;
    BF = Math.round(cur.bld * 8) / 8; BKEY = Math.round(cur.bld * 8) * 10 + (cur.shops > .5 ? 1 : 0); NIGHT.n = clamp(cur.lampOn, 0, 1);
  }
  function updateEnv(G, dt) {
    const idx = R._forceStage !== undefined ? R._forceStage : ((G.stage | 0) % global.STAGES.length);
    const snap = G.attract || G.time < .25 || envIdx < 0;
    if (idx !== envIdx) {
      envIdx = idx; envB = mkEnv(global.STAGES[idx]);
      if (snap) { lerpEnv(cur, envB, envB, 0); envK = 1; } else { lerpEnv(envA, cur, cur, 0); envK = 0; }
      envDirty = true;
    }
    if (envK < 1) { envK = Math.min(1, envK + dt / ENV_TRANS); lerpEnv(cur, envA, envB, sstep(0, 1, envK)); envDirty = true; }
    if (!envDirty) return; envDirty = false; applyEnv();
  }
  R.setStage = function (i) { R._forceStage = i; };

  /* ---------------------------------------------------------------- scroll + sync */
  const mod = (a, m) => ((a % m) + m) % m;
  function syncScenery(G) {
    const d = G.dist;
    roadTex.offset.y = mod(d / 12, 1); walkTexL.offset.y = mod(d / 7, 1); syncProps(G);
    // lamps
    const tot = lampCount * lampSp;
    SLOTS.lamps.forEach((s, i) => {
      const z = mod(s.base - d, tot) - 24;
      dummy.position.set(s.side * (CURB_X + .55), 0, -z); dummy.rotation.set(0, s.side < 0 ? Math.PI : 0, 0); const ls = Math.max(.001, cur.lamps); dummy.scale.set(ls, ls, ls); dummy.updateMatrix(); lampPoles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.side * (CURB_X + .55) - s.side * 1.75 * ls, 8.0 * ls, -z); dummy.rotation.set(0, 0, 0); dummy.scale.set(ls, ls, ls); dummy.updateMatrix(); lampHeads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.side * (CURB_X - 2.2), .05, -z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(9 * ls, 9 * ls, 1); dummy.updateMatrix(); lampPools.setMatrixAt(i, dummy.matrix);
    });
    lampPoles.instanceMatrix.needsUpdate = lampHeads.instanceMatrix.needsUpdate = lampPools.instanceMatrix.needsUpdate = true;
    // parked cars
    const ptot = parkedN * parkedSp;
    for (const s of SLOTS.parked) {
      const z = mod(s.base - d, ptot) - 20;
      if (z > s.prev + 1) { s.seed = (Math.random() * 1e6) | 0; const rr = srand(s.seed); s.present = rr() < .62 * cur.park; s.pi = (rr() * PAINTS.length) | 0; s.flip = rr() < .12; s.kind = rr() < .12 ? 'taxi' : 'sedan'; s.jit = (rr() - .5) * 1.2; if (s.e) { s.e.root.visible = false; pools.parked.active.splice(pools.parked.active.indexOf(s.e), 1); pools.parked.free.push(s.e); s.e = null; } }
      s.prev = z;
      if (!s.present || cur.park < .05) continue;
      if (!s.e) { s.e = acquire('parked'); setVeh(s.e, s.kind, PAINTS[s.pi], 4.4, 1, 1); }
      s.e.stamp = frameId; s.e.root.position.set(s.side * (ROAD_HALF - 1.0), 0, -z + s.jit); s.e.root.rotation.y = s.flip ? Math.PI : 0;
    }
    // far skyline
    for (const sk of skyline) {
      const tot2 = sk.n * 62; let k = 0; const skH = sk.h * cur.sky; if (cur.sky < .03) { sk.im.count = 0; continue; } sk.im.count = sk.n * 2;
      for (let i = 0; i < sk.n; i++) for (const sd of [-1, 1]) {
        const z = mod(i * 62 + (sk.h * 3.7 % 31) + (sd > 0 ? 29 : 0) - d * .96, tot2) - 30;
        dummy.position.set(sd * (24 + ((i * 7 + sk.h) % 5) * 5), skH / 2, -z - 20); dummy.rotation.set(0, 0, 0); dummy.scale.set(18, skH, 18); dummy.updateMatrix(); sk.im.setMatrixAt(k++, dummy.matrix);
      }
      sk.im.instanceMatrix.needsUpdate = true;
    }
  }
  function syncSim(G) {
    for (const side of [0, 1]) for (const b of G.blds[side]) {
      if (b.z > 175 || b.z + b.depth < -22) continue;
      let e = b._v; if (!e) { e = b._v = acquire('bld'); e.owner = b; placeBuilding(e, b); } if (BF <= .05) e.root.visible = false;
      e.stamp = frameId; e.root.position.z = -(b.z + b.depth / 2);
      if (e.sig !== b || e.bk !== BKEY) placeBuilding(e, b);
    }
    for (const b of G.boards) {
      if (b.z > 175 || b.z < -16) continue;
      let e = b._v; if (!e) { e = b._v = acquire('board'); e.owner = b; }
      e.stamp = frameId;
      const side = b.side === 0 ? -1 : 1;
      e.root.position.set(side * (CURB_X + 1.6), 0, -b.z); e.root.rotation.y = side < 0 ? .5 : -.5;
      const tx = b.text || 'WATCHING'; if (e.text !== tx) { e.text = tx; e.tex.userData.draw = drawBoard(tx); redrawBoard(e, tx); }
    }
    for (const o of G.obs) {
      if (o.z > 175 || o.z + o.depth < -16) continue;
      let e = o._v;
      if (!e) {
        const r = srand(o.seed + 3); let kind;
        if (o.type === 'wall') {
          kind = 'veh'; e = acquire('veh');
          const d = o.depth;
          if (d < 5.2) { const q = r(); const k = q < .34 ? 'taxi' : q < .62 ? 'police' : 'sedan'; setVeh(e, k, k === 'sedan' ? PAINTS[(r() * PAINTS.length) | 0] : '#ffffff', clamp(d + .2, 3.2, 5.4), 1.18, 1.3); }
          else if (d < 7.2) setVeh(e, 'van', VAN_PAINTS[(r() * VAN_PAINTS.length) | 0], d + .1, 1, 1);
          else if (d < 11.5) setVeh(e, 'truck', ['#2d4166', '#7b2b27', '#d9d7cf', '#3d5648'][(r() * 4) | 0], d + .1, 1, 1);
          else setVeh(e, 'bus', '#e6e4dc', d + .1, 1, 1);
          e.vk = e.kind;
        } else if (o.type === 'barrier') { const q = r(); kind = q < .38 ? 'jersey' : q < .72 ? 'saw' : 'cones'; e = acquire(kind); e.vk = kind; }
        else { e = acquire('gantry'); e.vk = 'gantry'; }
        o._v = e; e.owner = o; o.vis = e.vk;
      }
      e.stamp = frameId;
      const x = (o.lane - 1) * LW;
      if (o.type === 'wall') e.root.position.set(x, 0, -(o.z + o.depth / 2)); else e.root.position.set(x, 0, -(o.z + o.depth / 2));
      if (e.bar && e.bar.visible) { const f = Math.floor(G.clock * 3.2) % 2; matPoliceR.color.setScalar(1).multiply(tmpC.set(f ? 0xff3030 : 0x501010)); matPoliceB.color.copy(tmpC.set(f ? 0x142a66 : 0x4f7dff)); }
    }
    syncItems(G);
    // cash
    let n = 0;
    for (const c of G.coinsL) {
      if (c.taken || c.z > 130 || c.z < -6 || n >= 200) continue;
      dummy.position.set((c.lane - 1) * LW, c.y + .3 + Math.sin(G.clock * 3 + c.ph) * .05, -c.z);
      dummy.rotation.set(.35, G.clock * 2.2 + c.ph, 0); dummy.scale.setScalar(1.15); dummy.updateMatrix(); R.cash.setMatrixAt(n++, dummy.matrix);
    }
    R.cash.count = n; R.cash.instanceMatrix.needsUpdate = true;
    for (const c of G.chips) {
      if (c.taken || c.z > 130 || c.z < -6) continue;
      let e = c._v; if (!e) { e = c._v = acquire('jammer'); e.owner = c; }
      e.stamp = frameId; e.root.position.set((c.lane - 1) * LW, 0, -c.z);
      e.hover.position.y = .9 + Math.sin(G.clock * 2.6) * .08; e.hover.rotation.y = G.clock * 1.6;
      e.ring.material.opacity = .4 + .15 * Math.sin(G.clock * 4);
    }
  }
  function redrawBoard(e, tx) {
    const t = e.tex, cv = t.image, g = cv.getContext('2d'); drawBoard(tx)(g, cv.width, cv.height); t.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- camera */
  function updateCamera(G, dt) {
    const p = G.p, portrait = W / H < 1.0;
    const cfg = portrait ? { h: 4.2, z: 8.3, fov: 78, ly: 1.2, lz: -15 } : { h: 2.55, z: 5.1, fov: 62, ly: 1.5, lz: -12 };
    vis.camX += (((vis.x - 1) * LW) * .55 - vis.camX) * (1 - Math.exp(-dt * 6));
    const sp = clamp((G.speed - 20) / 22, 0, 1);
    const dead = G.state === 'dead' || G.state === 'over';
    const dd = dead ? clamp(G.deadT / 1.4, 0, 1) : 0;
    const fov = cfg.fov + sp * 5 + (G.boostK || 0) * 7 - dd * 6;
    if (Math.abs(camera.fov - fov) > .01 || camera.aspect !== W / H) { camera.fov = fov; camera.aspect = W / H; camera.updateProjectionMatrix(); }
    const sk = G.fx.shake * .012;
    let sway = 0; if (G.attract || G.state === 'title') sway = Math.sin(G.clock * .35) * .55;
    camera.position.set(vis.camX + sway + (rnd() - .5) * sk, cfg.h + p.y * .22 - (p.slide > 0 ? .15 : 0) - dd * .55 + (rnd() - .5) * sk, cfg.z - dd * 1.7);
    camera.lookAt(vis.camX * .5 + (vis.x - 1) * LW * .25, cfg.ly - dd * .25, cfg.lz);
  }

  /* ---------------------------------------------------------------- governor + API */
  let ema = 1 / 60, slow = 0, fast = 0;
  function applyRatio() { renderer.setPixelRatio(dpr * ratio); renderer.setSize(W, H, false); }
  function governor(dt) {
    if (R.noGov || dt <= 0 || dt > .25) return;
    ema += (dt - ema) * .05;
    if (ema > .022) { slow++; fast = 0; } else if (ema < .0125) { fast++; slow = 0; } else { slow = fast = 0; }
    if (slow > 50 && ratio > .62) { ratio = Math.max(.62, ratio - .12); slow = 0; applyRatio(); if (ratio < .75 && sun.castShadow) { sun.castShadow = false; } }
    else if (fast > 400 && ratio < maxRatio) { ratio = Math.min(maxRatio, ratio + .06); fast = 0; applyRatio(); }
  }

  R.init = function (cv) {
    canvas = cv; mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || (matchMedia && matchMedia('(pointer:coarse)').matches);
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: /keepbuffer/.test(location.search) });
    ANISO = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    dpr = Math.min(global.devicePixelRatio || 1, mobile ? 2 : 2); maxRatio = mobile ? .85 : 1; ratio = maxRatio;
    scene = new T.Scene(); scene.fog = new T.Fog(0xb98c6c, 40, 190);
    camera = new T.PerspectiveCamera(60, 16 / 9, .3, 420);
    buildScene(); P = buildPlayer(wantOutfit && wantOutfit.look); curCharKey = wantOutfit ? wantOutfit.name + '|' + wantOutfit.nick : null; updateEnv({ attract: true, time: 0 }, 0);
    R.ready = true; R.resize(global.innerWidth, global.innerHeight);
    if (document.fonts && document.fonts.load) document.fonts.load('700 40px Oswald').then(() => { texJobs.forEach(t => t.userData.redraw && t.userData.redraw()); for (const e of (pools.board ? pools.board.active.concat(pools.board.free) : [])) if (e.text) redrawBoard(e, e.text); }).catch(() => {});
  };
  R.resize = function (w, h) { W = Math.max(2, w | 0); H = Math.max(2, h | 0); if (renderer) { applyRatio(); camera.aspect = W / H; camera.updateProjectionMatrix(); } };
  /* playable characters: rebuild the model when the equipped character changes */
  let wantOutfit = null, curCharKey = null;
  R.setOutfit = function (o) {
    wantOutfit = o; if (!P || !o) return;
    const key = o.name + '|' + o.nick; if (key === curCharKey) return; curCharKey = key;
    scene.remove(P.root); global.CharKit.dispose(P);
    P = buildPlayer(o.look); P.mats = null;
  };
  R.outfitHex = () => curCharKey;
  /* characters preview: a small studio (key + warm/cool rim lights, soft ground shadow) used for cached PNG cards and a live idle-animated hero */
  const pvCache = {};
  function shadowTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(.6, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); return t; }
  function makePV(cv, w, h, ratio) {
    const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(ratio || 1); r.setSize(w, h, false); r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.setClearColor(0x000000, 0);
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(27, w / h, .5, 40);
    sc.add(new T.HemisphereLight(0xdfe6f0, 0x4b4741, 1.5));
    const key = new T.DirectionalLight(0xfff1dc, 2.6); key.position.set(-3.5, 4.5, 5); sc.add(key);
    const rimC = new T.DirectionalLight(0x8fb2e6, 3.2); rimC.position.set(4.5, 3, -4.5); sc.add(rimC);   // cool rim from behind-right
    const rimW = new T.DirectionalLight(0xffb87a, 2.4); rimW.position.set(-4.5, 2.4, -4); sc.add(rimW);  // warm rim from behind-left
    const fill = new T.DirectionalLight(0xbfd0e6, .5); fill.position.set(4, 1.5, 4); sc.add(fill);
    const pv = { r, sc, cam, cur: null, t: 0, shadow: shadowTex() };
    pv.show = function (ch) {
      if (pv.cur) { sc.remove(pv.cur.root); global.CharKit.dispose(pv.cur); }
      const c = global.CharKit.build(ch.look); pv.cur = c; pv.id = ch.look.id;
      const sh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: pv.shadow, transparent: true, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(0, .01, (c.veh.keke ? .1 : .05)); sh.scale.set(c.veh.keke ? 2.1 : 1.1, c.veh.wb * 1.45 + .6, 1); sh.rotation.z = 0; c.root.add(sh); sh.castShadow = false;
      sc.add(c.root); pv.t = 0; pv.pose(0);
    };
    pv.pose = function (t) {
      const c = pv.cur; if (!c) return; const P_ = c.pose, br = Math.sin(t * 1.7);
      c.rig.position.set(0, P_.rigY + br * .004, P_.rigZ); c.torso.rotation.x = P_.torso + br * .012;
      c.lL.th.rotation.x = P_.thL; c.lL.kn.rotation.x = -P_.knL; c.lR.th.rotation.x = P_.thR; c.lR.kn.rotation.x = -P_.knR;
      c.aL.sh.rotation.x = P_.arL + br * .01; c.aL.el.rotation.x = P_.elL; c.aR.sh.rotation.x = P_.arR + br * .01; c.aR.el.rotation.x = P_.elR;
      c.head.rotation.x = P_.head + Math.sin(t * .6) * .03; c.head.rotation.y = Math.sin(t * .45) * .22;
      c.veh.group.position.y = Math.sin(t * 41) * .0015; c.veh.fork.rotation.y = Math.sin(t * .45) * .12;
      c.root.rotation.y = Math.PI - .78 + Math.sin(t * .4) * .42;
    };
    pv.frame = function (t) { pv.t = t; pv.pose(t); const d = (pv.cur ? (pv.cur.veh.keke ? 6.3 : 5.5) : 5.5) * (pv.zoom || 1); const ox = (pv.ox || 0); cam.position.set(-ox, 1.18 * (pv.zoom || 1) + .05, d); cam.lookAt(-ox, .86, 0); r.render(sc, cam); };
    return pv;
  }
  let stillPV = null;
  R.preview = function (id, ch) {
    if (pvCache[id]) return pvCache[id];
    try {
      if (!stillPV) { const cv = document.createElement('canvas'); stillPV = makePV(cv, 300, 300, 1); }
      stillPV.show(ch); stillPV.pose(.9); stillPV.cur.root.rotation.y = Math.PI - .8; stillPV.t = 0;
      const d = stillPV.cur.veh.keke ? 6.1 : 5.3; stillPV.cam.position.set(0, 1.2, d); stillPV.cam.lookAt(0, .8, 0); stillPV.r.render(stillPV.sc, stillPV.cam);
      const url = stillPV.r.domElement.toDataURL('image/png'); pvCache[id] = url; return url;
    } catch (e) { console.warn('preview', e); return null; }
  };
  /* live hero: idle-animated, rim lit. canvas lives in the Characters screen. */
  let heroPV = null, heroRAF = 0, heroOn = false;
  R.hero = {
    show(cv, ch) { try { if (!heroPV) { const rect = cv.getBoundingClientRect(); heroPV = makePV(cv, cv.width, cv.height, 1); heroPV.zoom = .88; heroPV.ox = .8; } if (!heroPV.id || heroPV.id !== ch.look.id) heroPV.show(ch); } catch (e) { console.warn('hero', e); } },
    start() { if (heroOn || !heroPV) return; heroOn = true; const t0 = performance.now(); const loop = () => { if (!heroOn) return; heroPV.frame((performance.now() - t0) / 1000); heroRAF = requestAnimationFrame(loop); }; loop(); },
    stop() { heroOn = false; cancelAnimationFrame(heroRAF); },
    on() { return heroOn; }
  };
  R.playerPos = () => ({ x: 0, y: 0 });
  R.layout = () => {};
  R.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio, dpr, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
  R.frame = function (G, dt) {
    if (!R.ready) return;
    frameId++;
    frameDt = dt; updateEnv(G, dt); updatePlayer(G, dt); updateCamera(G, dt); syncScenery(G); syncSim(G); sweep();
    renderer.render(scene, camera);
    governor(dt);
  };
  global.Render = R;
})(window);
