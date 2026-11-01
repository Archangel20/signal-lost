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
  const merge = (list) => T.mergeGeometries(list, false);
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
  const pc = { x: 0, rigX: 0, rigY: 0, torso: 0, thL: 0, knL: 0, thR: 0, knR: 0, arL: 0, elL: 0, arR: 0, elR: 0, bank: 0, yaw: 0, fall: 0 };
  const vis = { x: 1, camX: 0 };
  function buildPlayer() {
    const mk = (c, r) => new T.MeshLambertMaterial({ color: c });
    const skin = mk(0xb98059), hood = mk(0xc65a3e), hoodD = mk(0x8f3f2c), bag = mk(0x1d8081), stripe = new T.MeshLambertMaterial({ color: 0xdfe3df, emissive: 0x555a55 }), pants = mk(0x2c3442), shoe = mk(0xdcdcd4), sole = mk(0x2a2a2a);
    const M = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
    const root = new T.Group(), rig = new T.Group(); rig.position.y = .95; root.add(rig);
    const torso = new T.Group(); rig.add(torso);
    torso.add(M(.46, .6, .26, hood, 0, .36, 0), M(.44, .12, .25, hoodD, 0, .02, 0));
    torso.add(M(.4, .5, .23, bag, 0, .4, .245), M(.405, .05, .235, stripe, 0, .29, .245), M(.405, .05, .235, stripe, 0, .5, .245));
    torso.add(M(.07, .5, .02, pants, -.15, .38, -.13), M(.07, .5, .02, pants, .15, .38, -.13));
    const head = new T.Group(); head.position.set(0, .8, 0); torso.add(head);
    const hm = new T.Mesh(new T.SphereGeometry(.115, 14, 10), skin); hm.castShadow = true; head.add(hm);
    const hd = new T.Mesh(new T.SphereGeometry(.155, 14, 10), hood); hd.scale.set(1, .96, 1.08); hd.position.set(0, .015, .035); hd.castShadow = true; head.add(hd);
    head.add(M(.12, .12, .1, hood, 0, -.12, .02));
    const arm = (s) => {
      const sh = new T.Group(); sh.position.set(s * .295, .63, 0); torso.add(sh);
      sh.add(M(.125, .3, .125, hood, 0, -.15, 0));
      const el = new T.Group(); el.position.y = -.3; sh.add(el);
      el.add(M(.105, .28, .105, hood, 0, -.14, 0), M(.095, .09, .095, skin, 0, -.31, 0));
      return { sh, el };
    };
    const aL = arm(-1), aR = arm(1);
    const leg = (s) => {
      const th = new T.Group(); th.position.set(s * .115, 0, 0); rig.add(th);
      th.add(M(.17, .47, .18, pants, 0, -.235, 0));
      const kn = new T.Group(); kn.position.y = -.47; th.add(kn);
      kn.add(M(.14, .46, .15, pants, 0, -.23, 0), M(.15, .09, .28, shoe, 0, -.5, -.06), M(.152, .03, .285, sole, 0, -.555, -.06));
      return { th, kn };
    };
    const lL = leg(-1), lR = leg(1);
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(root);
    return { root, rig, torso, head, aL, aR, lL, lR };
  }
  function updatePlayer(G, dt) {
    const p = G.p; const a = 1 - Math.exp(-dt * 14);
    vis.x += (p.x - vis.x) * a;
    const vx = clamp((p.x - vis.x) * 1.4, -1, 1);
    P.root.position.set((vis.x - 1) * LW, p.y, 0);
    const dead = G.state === 'dead' || G.state === 'over' || p.dead;
    const ph = p.phase;
    const t = {};
    const sl = p.slide > 0 && p.grounded, air = !p.grounded;
    const cr = clamp(1 - (G.clock - p.landT) / 0.16, 0, 1) * (p.grounded ? 1 : 0);
    if (dead) {
      const d = clamp(G.deadT * 3.2, 0, 1);
      Object.assign(t, { rigX: 1.5 * d, rigY: .95 - .62 * d, torso: -.1, thL: .5, knL: .4, thR: -.2, knR: .7, arL: 1.6, elL: .5, arR: .6, elR: .9, bank: 0, yaw: 0 });
      P.root.position.z = Math.min(1.1, G.deadT * 1.6);
    } else if (sl) {
      Object.assign(t, { rigX: 1.22, rigY: .42, torso: -.15, thL: 1.35, knL: .15, thR: 1.2, knR: .25, arL: 1.9, elL: .2, arR: .8, elR: .4, bank: 0, yaw: 0 });
      P.root.position.z = 0;
    } else if (air) {
      const up = p.vy > 0;
      Object.assign(t, { rigX: -.1, rigY: .95, torso: -.14, thL: up ? 1.0 : .6, knL: up ? 1.25 : .7, thR: up ? -.35 : -.1, knR: up ? .5 : .3, arL: up ? 2.4 : 1.8, elL: .3, arR: up ? 2.2 : 1.6, elR: .35, bank: 0, yaw: 0 });
      P.root.position.z = 0;
    } else {
      const s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(ph + Math.PI), c2 = Math.cos(ph + Math.PI);
      Object.assign(t, {
        rigX: 0, rigY: .95 - Math.abs(s) * .045 - cr * .14, torso: -.2 - cr * .18,
        thL: s * .95 + cr * .5, knL: .22 + 1.05 * Math.max(0, c) + cr * .8, thR: s2 * .95 + cr * .5, knR: .22 + 1.05 * Math.max(0, c2) + cr * .8,
        arL: -s * .85 + .25, elL: 1.25 + .2 * s, arR: -s2 * .85 + .25, elR: 1.25 + .2 * s2, bank: 0, yaw: 0
      });
      P.root.position.z = 0;
    }
    t.bank = dead ? 0 : -vx * .35; t.yaw = dead ? 0 : -vx * .32;
    const k = dead ? 1 - Math.exp(-dt * 12) : sl || air ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 48);
    for (const key in t) pc[key] += (t[key] - pc[key]) * k;
    const { rig, torso, aL, aR, lL, lR, root } = P;
    rig.rotation.x = pc.rigX; rig.position.y = pc.rigY; torso.rotation.x = pc.torso;
    lL.th.rotation.x = pc.thL; lL.kn.rotation.x = -pc.knL; lR.th.rotation.x = pc.thR; lR.kn.rotation.x = -pc.knR;
    aL.sh.rotation.x = pc.arL; aL.el.rotation.x = pc.elL; aR.sh.rotation.x = pc.arR; aR.el.rotation.x = pc.elR;
    root.rotation.z = pc.bank; root.rotation.y = pc.yaw;
    P.head.rotation.x = -pc.torso * .6 - (sl ? .5 : 0);
    // scripted run-in for the title so the camera can show him off
  }

  /* ---------------------------------------------------------------- scenery */
  const SLOTS = { lamps: [], parked: [] };
  const lampCount = 12, lampSp = 26, parkedN = 12, parkedSp = 15;
  let facMat = [], facLit = [], shopMats = [], boardTex = [];
  const BU = [];      // building pool entries
  let skyline = [];
  const dummy = new T.Object3D();
  const NIGHT = { n: 0 };

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
    const hh = Math.round((8 + (b.h - 6) * 2.0) / 3.2) * 3.2;
    const st = b.tone + (b.seed % 2 ? 1 : 0); e.body.material = facMat[st % 4];
    e.body.scale.set(wd, hh, dp);
    setBoxUV(e.geo, wd, hh, dp, 18, 12.8, Math.floor(rr() * 6) / 6, Math.floor(rr() * 4) / 4);
    e.body.position.set(side * (WALK_OUT + wd / 2), hh / 2, 0);
    const hasShop = (b.seed % 7) !== 0;
    e.shop.visible = hasShop;
    if (hasShop) {
      e.shop.material = shopMats[b.seed % SHOPS.length];
      e.shop.scale.set(dp * .96, 3.6, 1); e.shop.position.set(side * (WALK_OUT - .04), 1.8, 0); e.shop.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const uv = e.sgeo.attributes.uv, u = dp * .96 / 12, o = Math.floor(rr() * 4) / 4; // plane uv: (0,1)(1,1)(0,0)(1,0)
      uv.setXY(0, o, 1); uv.setXY(1, o + u, 1); uv.setXY(2, o, 0); uv.setXY(3, o + u, 0); uv.needsUpdate = true;
    }
    e.sig = b;
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
    const road = new T.Mesh(new T.PlaneGeometry(ROAD_HALF * 2, 300), new T.MeshLambertMaterial({ map: roadTex }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -140); road.receiveShadow = true; scene.add(road);
    walkTexL = ctex(256, 512, drawWalk, true); walkTexL.repeat.set(1, 300 / 7);
    const wmat = new T.MeshLambertMaterial({ map: walkTexL });
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
    pool('bld', makeBuilding); pool('board', makeBoard);
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

  /* ---------------------------------------------------------------- environment (dusk -> night) */
  const K = {
    zen: [new T.Color(0x3d4d6e), new T.Color(0x0a111f)], mid: [new T.Color(0x9a7a7a), new T.Color(0x1a2338)], hor: [new T.Color(0xeaa56a), new T.Color(0x2b3552)],
    fog: [new T.Color(0xb98c6c), new T.Color(0x1b2336)], sun: [new T.Color(0xffb070), new T.Color(0x7d93c9)], hs: [new T.Color(0x8e9bb5), new T.Color(0x34406a)], hg: [new T.Color(0x4a3f3a), new T.Color(0x191a22)]
  };
  const cz = new T.Color(), cm = new T.Color(), ch = new T.Color(), cg = new T.Color(), sunDir = new T.Vector3(-.38, .1, -1).normalize(), vtmp = new T.Vector3();
  let lastN = -1;
  function updateEnv(G) {
    const n = G.attract ? 0 : sstep(0, 1, clamp(G.time / 150, 0, 1)); NIGHT.n = n;
    if (Math.abs(n - lastN) < .0015) return; lastN = n;
    cz.copy(K.zen[0]).lerp(K.zen[1], n); cm.copy(K.mid[0]).lerp(K.mid[1], n); ch.copy(K.hor[0]).lerp(K.hor[1], n); cg.copy(K.hor[0]).multiplyScalar(.75 * (1 - n));
    const pos = sky.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      vtmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const h = vtmp.y; let c;
      if (h <= 0) c = tmpC.copy(ch); else if (h < .28) c = tmpC.copy(ch).lerp(cm, sstep(0, .28, h)); else c = tmpC.copy(cm).lerp(cz, sstep(.28, .9, h));
      const gl = Math.pow(Math.max(0, vtmp.dot(sunDir)), 6) * (1 - n) * .9; c.r += cg.r * gl * 1.1; c.g += cg.g * gl; c.b += cg.b * gl * .8;
      skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
    }
    sky.geometry.attributes.color.needsUpdate = true;
    fogCol.copy(K.fog[0]).lerp(K.fog[1], n); scene.fog.color.copy(fogCol);
    sun.color.copy(K.sun[0]).lerp(K.sun[1], n); sun.intensity = lerp(2.3, .6, n);
    sun.position.set(lerp(-22, 12, n), lerp(22, 38, n), lerp(24, 18, n));
    hemi.color.copy(K.hs[0]).lerp(K.hs[1], n); hemi.groundColor.copy(K.hg[0]).lerp(K.hg[1], n); hemi.intensity = lerp(1.2, .7, n);
    fill.intensity = lerp(.7, .55, n);
    sunDisc.material.opacity = .92 * (1 - sstep(.15, .6, n));
    for (const m of facMat) m.emissiveIntensity = lerp(.12, 1.15, sstep(.05, .7, n));
    for (const m of shopMats) m.emissiveIntensity = lerp(.55, 1.0, n);
    lampHeads.material.color.setRGB(lerp(.55, 1, n), lerp(.5, .88, n), lerp(.4, .66, n));
    lampPools.material.opacity = lerp(.0, .75, sstep(.1, .8, n));
  }

  /* ---------------------------------------------------------------- scroll + sync */
  const mod = (a, m) => ((a % m) + m) % m;
  function syncScenery(G) {
    const d = G.dist;
    roadTex.offset.y = mod(d / 12, 1); walkTexL.offset.y = mod(d / 7, 1);
    // lamps
    const tot = lampCount * lampSp;
    SLOTS.lamps.forEach((s, i) => {
      const z = mod(s.base - d, tot) - 24;
      dummy.position.set(s.side * (CURB_X + .55), 0, -z); dummy.rotation.set(0, s.side < 0 ? Math.PI : 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); lampPoles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.side * (CURB_X + .55) - s.side * 1.75, 8.0, -z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); lampHeads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.side * (CURB_X - 2.2), .05, -z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(9, 9, 1); dummy.updateMatrix(); lampPools.setMatrixAt(i, dummy.matrix);
    });
    lampPoles.instanceMatrix.needsUpdate = lampHeads.instanceMatrix.needsUpdate = lampPools.instanceMatrix.needsUpdate = true;
    // parked cars
    const ptot = parkedN * parkedSp;
    for (const s of SLOTS.parked) {
      const z = mod(s.base - d, ptot) - 20;
      if (z > s.prev + 1) { s.seed = (Math.random() * 1e6) | 0; const rr = srand(s.seed); s.present = rr() < .62; s.pi = (rr() * PAINTS.length) | 0; s.flip = rr() < .12; s.kind = rr() < .12 ? 'taxi' : 'sedan'; s.jit = (rr() - .5) * 1.2; if (s.e) { s.e.root.visible = false; pools.parked.active.splice(pools.parked.active.indexOf(s.e), 1); pools.parked.free.push(s.e); s.e = null; } }
      s.prev = z;
      if (!s.present) continue;
      if (!s.e) { s.e = acquire('parked'); setVeh(s.e, s.kind, PAINTS[s.pi], 4.4, 1, 1); }
      s.e.stamp = frameId; s.e.root.position.set(s.side * (ROAD_HALF - 1.0), 0, -z + s.jit); s.e.root.rotation.y = s.flip ? Math.PI : 0;
    }
    // far skyline
    for (const sk of skyline) {
      const tot2 = sk.n * 62; let k = 0;
      for (let i = 0; i < sk.n; i++) for (const sd of [-1, 1]) {
        const z = mod(i * 62 + (sk.h * 3.7 % 31) + (sd > 0 ? 29 : 0) - d * .96, tot2) - 30;
        dummy.position.set(sd * (24 + ((i * 7 + sk.h) % 5) * 5), sk.h / 2, -z - 20); dummy.rotation.set(0, 0, 0); dummy.scale.set(18, sk.h, 18); dummy.updateMatrix(); sk.im.setMatrixAt(k++, dummy.matrix);
      }
      sk.im.instanceMatrix.needsUpdate = true;
    }
  }
  function syncSim(G) {
    for (const side of [0, 1]) for (const b of G.blds[side]) {
      if (b.z > 175 || b.z + b.depth < -22) continue;
      let e = b._v; if (!e) { e = b._v = acquire('bld'); e.owner = b; placeBuilding(e, b); }
      e.stamp = frameId; e.root.position.z = -(b.z + b.depth / 2);
      if (e.sig !== b) placeBuilding(e, b);
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
    const cfg = portrait ? { h: 4.7, z: 9.8, fov: 80, ly: 1.2, lz: -15 } : { h: 2.55, z: 5.1, fov: 62, ly: 1.5, lz: -12 };
    vis.camX += (((vis.x - 1) * LW) * .55 - vis.camX) * (1 - Math.exp(-dt * 6));
    const sp = clamp((G.speed - 20) / 22, 0, 1);
    const dead = G.state === 'dead' || G.state === 'over';
    const dd = dead ? clamp(G.deadT / 1.4, 0, 1) : 0;
    const fov = cfg.fov + sp * 5 - dd * 6;
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
    buildScene(); P = buildPlayer(); updateEnv({ attract: true, time: 0 });
    R.ready = true; R.resize(global.innerWidth, global.innerHeight);
    if (document.fonts && document.fonts.load) document.fonts.load('700 40px Oswald').then(() => { texJobs.forEach(t => t.userData.redraw && t.userData.redraw()); for (const e of (pools.board ? pools.board.active.concat(pools.board.free) : [])) if (e.text) redrawBoard(e, e.text); }).catch(() => {});
  };
  R.resize = function (w, h) { W = Math.max(2, w | 0); H = Math.max(2, h | 0); if (renderer) { applyRatio(); camera.aspect = W / H; camera.updateProjectionMatrix(); } };
  R.playerPos = () => ({ x: 0, y: 0 });
  R.layout = () => {};
  R.stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio, dpr, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
  R.frame = function (G, dt) {
    if (!R.ready) return;
    frameId++;
    updateEnv(G); updatePlayer(G, dt); updateCamera(G, dt); syncScenery(G); syncSim(G); sweep();
    renderer.render(scene, camera);
    governor(dt);
  };
  global.Render = R;
})(window);
