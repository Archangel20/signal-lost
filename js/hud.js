/* SIGNAL LOST — GTA-style HUD (DOM + one 2D canvas for the minimap). Reads Game state; never changes the sim. */
(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const H = {};
  const el = {};
  const LW = 2.6;
  let G, last = {}, lastTicker = null, subHideAt = 0, jamDesatUntil = 0, mm, mmc, mmS = 0, starsBuilt = false;
  const STAR = 'M15 2.5l3.6 7.5 8.2 1.1-6 5.7 1.5 8.2L15 21.1l-7.3 3.9 1.5-8.2-6-5.7 8.2-1.1z';

  function sentence(s) {
    s = String(s || '').toLowerCase();
    s = s.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    s = s.replace(/\bi\b/g, 'I');
    return s;
  }
  H.sentence = sentence;
  const money = n => '$' + Math.floor(n).toLocaleString('en-US');
  const mmss = t => { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  function setText(key, node, v) { if (last[key] !== v) { last[key] = v; node.textContent = v; } }
  function setCls(key, node, cls, on) { on = !!on; if (last[key] !== on) { last[key] = on; node.classList.toggle(cls, on); } }

  H.init = function (game, handlers) {
    G = game; H.h = handlers || {};
    ['hud', 'money', 'mult', 'stars', 'predict', 'jam', 'jamtxt', 'toasts', 'hint', 'subs', 'title', 'pause', 'over', 'wtxt', 'csub', 'crows', 'lanes', 'verdict', 'tip', 'cscore', 'cnew', 'best', 'game', 'mapwrap', 'btn-retry', 'btn-start', 'minimap', 'bail', 'cwallet', 'wallet'].forEach(k => el[k] = $(k));
    el.sm = el.subs.querySelector('.msg');
    let s = '';
    for (let i = 0; i < 5; i++) s += `<path d="${STAR}" transform="translate(${i * 30} 0)"/>`;
    el.stars.innerHTML = s; el.starsP = Array.from(el.stars.querySelectorAll('path'));
    mm = el.minimap; mmc = mm.getContext('2d');
    el['btn-retry'].addEventListener('click', e => { e.stopPropagation(); H.h.retry && H.h.retry(); });
    el['btn-garage-over'] = $('btn-garage-over');
    el['btn-start'].addEventListener('click', e => { e.stopPropagation(); H.h.start && H.h.start(); });
    el.pause.addEventListener('pointerup', () => H.h.resume && H.h.resume());
    H.resize();
  };
  H.resize = function () {
    if (!mm) return;
    const r = el.mapwrap.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2.5);
    const s = Math.max(60, Math.round(r.width));
    if (s * d !== mm.width) { mm.width = Math.round(s * d); mm.height = Math.round(s * d); }
    mmS = s * d;
  };

  /* ---------------- minimap: heading-up, stylised lane scale ---------------- */
  function drawMap() {
    const S = mmS || mm.width, R = S / 2, c = mmc;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = '#20252c'; c.fillRect(0, 0, S, S);
    const py = R * 1.28, kz = R * 1.1 / 62, kx = R * 0.085;           // px per metre (forward / sideways, sideways exaggerated)
    const X = x => R + x * kx, Y = z => py - z * kz;
    // buildings
    c.fillStyle = '#2f353d';
    for (const s of [0, 1]) for (const b of G.blds[s]) {
      if (b.z > 70 || b.z + b.depth < -20) continue;
      const x0 = s === 0 ? X(-30) : X(10), w = 20 * kx;
      c.fillRect(x0, Y(b.z + b.depth) + 1, w, b.depth * kz - 2);
    }
    // sidewalk + road
    c.fillStyle = '#4a4f57'; c.fillRect(X(-10), 0, 20 * kx, S);
    c.fillStyle = '#3a3f47'; c.fillRect(X(-5.9), 0, 11.8 * kx, S);
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = Math.max(1, S / 140); c.setLineDash([S / 38, S / 38]);
    for (const l of [-LW / 2, LW / 2]) { c.beginPath(); c.moveTo(X(l), 0); c.lineTo(X(l), S); c.stroke(); }
    c.setLineDash([]);
    // the city's bets (unresolved predictions)
    for (const w of G.waves) {
      if (w.sampled || w.z > 66 || w.blind) continue;
      const x = (w.bet - 1) * LW;
      c.fillStyle = 'rgba(214,64,56,.22)'; c.strokeStyle = 'rgba(214,64,56,.85)'; c.lineWidth = Math.max(1, S / 110);
      const h = Math.max(6, Math.min(w.depth || 4, 8) * kz);
      c.fillRect(X(x) - 1.15 * kx, Y(w.z) - h, 2.3 * kx, h); c.strokeRect(X(x) - 1.15 * kx, Y(w.z) - h, 2.3 * kx, h);
    }
    // obstacles
    for (const o of G.obs) {
      if (o.z > 70 || o.z + o.depth < -20) continue;
      const x = (o.lane - 1) * LW;
      c.fillStyle = o.type === 'wall' ? '#e8e8e4' : o.type === 'barrier' ? '#e07a26' : '#c9c9c4';
      const h = Math.max(3, o.depth * kz);
      c.fillRect(X(x) - 1.05 * kx, Y(o.z + o.depth), 2.1 * kx, h);
    }
    // cash + jammers
    c.fillStyle = '#79b95f';
    for (const k of G.coinsL) { if (k.taken || k.z > 66 || k.z < -12) continue; c.fillRect(X((k.lane - 1) * LW) - S / 120, Y(k.z) - S / 120, S / 60, S / 60); }
    for (const k of G.chips) { if (k.taken || k.z > 70) continue; c.fillStyle = '#8fd8ff'; c.beginPath(); c.arc(X((k.lane - 1) * LW), Y(k.z), S / 40, 0, 7); c.fill(); }
    // player
    const px = X((G.p.x - 1) * LW);
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = Math.max(1, S / 90);
    c.beginPath(); c.moveTo(px, py - S / 22); c.lineTo(px + S / 31, py + S / 31); c.lineTo(px, py + S / 70); c.lineTo(px - S / 31, py + S / 31); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.lineWidth = Math.max(2, S / 40); c.strokeStyle = '#0b0d10'; c.beginPath(); c.arc(R, R, R - c.lineWidth / 2, 0, 7); c.stroke();
    c.lineWidth = Math.max(1, S / 120); c.strokeStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(R, R, R - S / 28, 0, 7); c.stroke();
  }

  /* ---------------- toasts (near miss, outsmarted, etc.) ---------------- */
  function updateToasts() {
    for (const p of G.pops) {
      if (!p._el) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = p.text; el.toasts.appendChild(d); p._el = d; }
      const t = p.t, a = clamp(Math.min(t / .12, (p.life - t) / .35), 0, 1);
      p._el.style.opacity = a;
    }
    // remove nodes of finished pops
    const live = new Set(G.pops.map(p => p._el));
    for (const n of Array.from(el.toasts.children)) if (!live.has(n)) n.remove();
  }

  /* ---------------- per-frame ---------------- */
  H.update = function (dt, paused) {
    const st = G.state, playing = st === 'play' || st === 'dead';
    const inTitle = st === 'title' && G.attract;
    setCls('t_hud', el.hud, 'hidden', !playing || G.attract); // hud visible during play + dead
    setCls('t_title', el.title, 'hidden', !inTitle); setCls('t_bodytitle', document.body, 'intitle', inTitle);
    setCls('t_pause', el.pause, 'hidden', !paused);
    if (inTitle) {
      const sv = global.Save && Save.data, day = sv && sv.daily.d === Save.today() ? sv.daily : { best: 0, runs: 0 };
      const b = [G.best ? 'Best ' + money(G.best) : '', day.best ? 'Today ' + money(day.best) : ''].filter(Boolean).join('  ·  ');
      setText('best', el.best, b); if (sv) setText('wallet', el.wallet, money(sv.wallet));
    }

    // dead / over screens
    const overOn = (st === 'dead' && G.deadT > 0.25) || st === 'over';
    setCls('t_over', el.over, 'hidden', !overOn);
    if (overOn) {
      const kv = (G.killerObj && G.killerObj.vis) || G.killerVis || (G.killer && G.killer !== 'wall' ? 'barrier' : '');
      const busted = /police|gantry|jersey|saw|cones|barrier/.test(kv);
      setCls('t_busted', el.over, 'busted', busted); setText('wtxt', el.wtxt, busted ? 'Busted' : 'Wasted');
      setCls('t_in', el.over, 'in', true);
      const card = st === 'over' && G.overT > 0.35; setCls('t_card', el.over, 'card', card);
      if (card && !last.cardBuilt) buildCard(); if (!card) last.cardBuilt = false;
    } else { setCls('t_in', el.over, 'in', false); setCls('t_card', el.over, 'card', false); last.cardBuilt = false; }
    // canvas grading
    setCls('t_gray', el.game, 'gray', st === 'dead' || st === 'over');

    if (!playing || G.attract) return;
    const blind = G.blindT > 0;
    // money, multiplier
    setText('money', el.money, money(st === 'dead' ? (G.finalScore || G.score) : G.score));
    setText('mult', el.mult, G.mult >= 2 ? 'Combo x' + Math.floor(G.mult * 10) / 10 : '');
    // wanted stars
    const stars = clamp(Math.ceil((G.threat || 1) / 2), 1, 5);
    for (let i = 0; i < 5; i++) { const on = i < stars; if (last['s' + i] !== on) { last['s' + i] = on; el.starsP[i].classList.toggle('off', !on); } }
    setCls('t_jamstars', el.stars, 'jam', blind);
    const pp = Math.round(G.brain.predPct());
    setCls('t_bail', el.bail, 'hidden', !(G.up && G.up.bail > 0));
    setText('bailtxt', el.bail, G.bailUsed ? 'Bail-out used' : 'Bail-out ready');
    setText('pred', el.predict, blind ? 'City prediction offline' : 'City prediction ' + pp + '%');
    setCls('t_jam', el.jam, 'on', blind);
    if (blind) setText('jamtxt', el.jamtxt, 'Signal jammed ' + Math.ceil(G.blindT) + 's');
    // jammer desaturation dip (only on grab, ~0.8 s)
    if (blind && !last.wasBlind) jamDesatUntil = performance.now() + 800;
    last.wasBlind = blind;
    if (st === 'play') setCls('t_desat', el.game, 'desat', performance.now() < jamDesatUntil);

    // subtitles from the city's radio
    const tk = G.ticker;
    if (tk && tk !== lastTicker && tk.text) {
      lastTicker = tk; el.sm.textContent = sentence(tk.text); el.subs.classList.add('on'); subHideAt = performance.now() + 3400;
    }
    if (performance.now() > subHideAt || st === 'dead') el.subs.classList.remove('on');
    // first-run tutorial: three short hints, then never again (persisted in Save)
    const tutOn = G.hint && st === 'play', tt = G.time;
    const stage = !tutOn ? -1 : tt < 4.5 ? 0 : tt < 8.5 ? 1 : tt < 13 ? 2 : -1;
    setCls('t_hint', el.hint, 'hidden', stage < 0);
    if (stage !== last.tutStage) {
      last.tutStage = stage; const touch = document.documentElement.classList.contains('touch');
      if (stage === 0) el.hint.innerHTML = touch ? '<b>Swipe</b> left / right to change lane' : '<b>← →</b> change lane';
      if (stage === 1) el.hint.innerHTML = touch ? '<b>Swipe up</b> to jump · <b>down</b> to slide' : '<b>↑</b> jump · <b>↓</b> slide';
      if (stage === 2) el.hint.innerHTML = 'Grab <b>blue jammers</b> to blind the city · spend cash in the <b>Garage</b>';
    }
    if (tutOn && tt >= 13) { G.hint = false; global.Save && Save.tutDone('done'); }
    updateToasts();
    drawMap();
  };

  function buildCard() {
    last.cardBuilt = true;
    const sm = G.summary || { lines: [], verdict: '', tip: '', overall: 0, share: [.33, .33, .33] };
    setText('cscore', el.cscore, money(G.finalScore || 0));
    el.cnew.textContent = G.newBest ? 'New best' : (G.best ? 'Best ' + money(G.best) : '');
    el.csub.textContent = 'Survived ' + mmss(G.time);
    el.crows.innerHTML = sm.lines.map(l => `<div class="k">${l.k}</div><div class="v${l.hot ? ' hot' : ''}">${l.v}</div>`).join('');
    const names = ['Left', 'Middle', 'Right'], mx = Math.max.apply(null, sm.share);
    el.lanes.innerHTML = sm.share.map((s, i) => `<div class="ln${s === mx && s >= .5 ? ' hot' : ''}"><div class="bar" style="height:${Math.max(4, Math.round(s * 100))}%"></div>${names[i]} ${Math.round(s * 100)}%</div>`).join('');
    const sv = global.Save && Save.data;
    if (sv) {
      const day = sv.daily.d === Save.today() ? sv.daily : { best: 0 }, earned = G.bankedRun || 0;
      el.cwallet.textContent = (earned ? '+' + money(earned) + ' banked · ' : '') + 'wallet ' + money(sv.wallet) + (day.best ? ' · today ' + money(day.best) : '');
    }
    el.verdict.textContent = sentence(sm.verdict); el.tip.textContent = sentence(sm.tip);
  }
  global.HUD = H;
})(window);
