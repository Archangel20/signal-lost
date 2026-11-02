/* SIGNAL LOST — procedural WebAudio: trap/hip-hop soundtrack + clean SFX (no assets).
   Menu = calm loop. In-game = beat + 808 + moody chords; layers rise with wanted stars (1..5). */
(function (global) {
  'use strict';
  const A = {
    ctx: null, enabled: true, muted: false, musicEnabled: true, sfxEnabled: true, volume: 0.85,
    mode: 'menu', stars: 1, speedR: 0, playing: false, blind: false, timer: null
  };
  try { A.muted = localStorage.getItem('sl_muted') === '1'; } catch (e) {}
  let E = null; // active engine (live, or an offline one while rendering)
  const MUSV = 0.19;
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);
  const now = () => (E.t0 !== undefined ? E.t0 : E.c.currentTime);

  /* ------------------------------------------------------------ engine graph */
  function makeEngine(c) {
    const e = { c, step: 0, nextT: 0, tier: 1, pendTier: 1, mode: A.mode, tempo: 136, t0: undefined };
    const G = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const F = (type, f, q, to) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; if (to) b.connect(to); return b; };
    e.master = G(A.muted ? 0 : A.volume);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.18;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    e.master.connect(comp); comp.connect(lim); lim.connect(c.destination);
    e.sfxBus = G(A.sfxEnabled ? 0.9 : 0, e.master);
    // music chain: musBus -> (dry | radio-filter) -> lowpass -> musOut -> master
    e.musOut = G(A.musicEnabled ? 1 : 0, e.master);
    e.musLP = F('lowpass', 16000, 0.5, e.musOut);
    e.dry = G(1, e.musLP);
    e.radio = F('bandpass', 1400, 0.7); e.wet = G(0, e.musLP); e.radio.connect(e.wet);
    e.musBus = G(MUSV); e.musBus.connect(e.dry); e.musBus.connect(e.radio);
    e.drumBus = G(1, e.musBus); e.padBus = G(1, e.musBus); e.leadBus = G(1, e.musBus);
    // 808 bus: soft saturation adds harmonics so the sub is audible on phone speakers
    const ws = c.createWaveShaper(), cur = new Float32Array(1025);
    for (let i = 0; i < 1025; i++) { const x = i / 512 - 1; cur[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
    ws.curve = cur; ws.oversample = '2x';
    e.bassBus = G(0.36, ws); ws.connect(F('lowpass', 2400, 0.7, e.musBus));
    // dotted-8th echo for pads / pluck / bells
    e.dly = c.createDelay(1.0); e.dly.delayTime.value = 0.33;
    const dlp = F('lowpass', 2300, 0.5), dfb = G(0.38, e.dly);
    e.send = G(1, e.dly); e.dly.connect(dlp); dlp.connect(dfb); dlp.connect(G(0.3, e.musBus));
    const len = c.sampleRate; e.noise = c.createBuffer(1, len, c.sampleRate);
    const d = e.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return e;
  }

  /* ------------------------------------------------------------ primitives */
  function tone(freq, dur, type, vol, o) {
    o = o || {}; const c = E.c, t = (o.t !== undefined ? o.t : now()) + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const atk = o.atk || 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    let out = g;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(o.bus || E.sfxBus);
    if (o.send) { const s = c.createGain(); s.gain.value = o.send; out.connect(s); s.connect(E.send); }
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  function noise(dur, vol, o) {
    o = o || {}; const c = E.c, t = (o.t !== undefined ? o.t : now()) + (o.delay || 0);
    const s = c.createBufferSource(); s.buffer = E.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    f.Q.value = o.q || 0.8;
    const g = c.createGain(), atk = o.atk || 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    let out = g;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(o.bus || E.sfxBus);
    if (o.send) { const q = c.createGain(); q.gain.value = o.send; out.connect(q); q.connect(E.send); }
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  /* ------------------------------------------------------------ instruments */
  function kick(t, v) {
    const c = E.c, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(E.drumBus); o.start(t); o.stop(t + 0.36);
    noise(0.012, 0.16 * v, { t, f: 2600, type: 'highpass', bus: E.drumBus });
    // fake sidechain: pads/leads dip on every kick
    const pg = E.padBus.gain; pg.setValueAtTime(0.45, t); pg.linearRampToValueAtTime(1, t + 0.2);
  }
  function clap(t, v) {
    for (let i = 0; i < 3; i++) noise(0.025, 0.34 * v, { t: t + i * 0.011, f: 1500, q: 1.3, bus: E.drumBus });
    noise(0.2, 0.3 * v, { t: t + 0.033, f: 1700, q: 0.9, bus: E.drumBus, send: 0.22 });
    tone(210, 0.09, 'triangle', 0.2 * v, { t, slide: 150, bus: E.drumBus });
  }
  function hat(t, v, open) { noise(open ? 0.16 : 0.03, 0.17 * v, { t, f: 8200, type: 'highpass', q: 0.7, bus: E.drumBus }); }
  function bass(t, midi, dur, v) {
    const c = E.c, o = c.createOscillator(), g = c.createGain(), f = mf(midi);
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.62 * v, t + 0.006);
    g.gain.setValueAtTime(0.62 * v, t + Math.max(0.01, dur - 0.09)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g); g.connect(E.bassBus); o.start(t); o.stop(t + dur + 0.06);
  }
  function pad(t, notes, dur, cutoff, v) {
    const c = E.c, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + dur * 0.6);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.18); g.gain.setValueAtTime(v, t + dur - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    lp.connect(g); g.connect(E.padBus);
    const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(E.send);
    for (const n of notes) for (const dt of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(n); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.3);
    }
  }
  function pluck(t, midi, v) { tone(mf(midi), 0.2, 'triangle', 0.2 * v, { t, bus: E.leadBus, send: 0.35, atk: 0.003 }); tone(mf(midi + 12), 0.08, 'sine', 0.06 * v, { t, bus: E.leadBus }); }
  function bell(t, midi, dur, v) {
    tone(mf(midi), dur, 'sine', 0.2 * v, { t, bus: E.leadBus, send: 0.55, atk: 0.006 });
    tone(mf(midi) * 2.0, dur * 0.5, 'sine', 0.07 * v, { t, bus: E.leadBus, send: 0.4 });
    tone(mf(midi) * 3.01, 0.12, 'sine', 0.03 * v, { t, bus: E.leadBus });
  }
  function stab(t, notes, v) {
    const c = E.c, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    lp.connect(g); g.connect(E.leadBus); const s = c.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(E.send);
    for (const n of notes) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(n + 12); o.detune.value = n % 2 ? 6 : -6; o.connect(lp); o.start(t); o.stop(t + 0.27); }
  }

  /* ------------------------------------------------------------ song data (A minor: Am | F | C | G) */
  const ROOT = [33, 29, 36, 31];
  const CHORD = [[57, 60, 64, 67], [53, 57, 60, 64], [52, 55, 60, 64], [50, 55, 59, 62]];
  const BASS_P = [
    [[0, 0, 12]],
    [[0, 0, 6], [10, 0, 4]],
    [[0, 0, 3], [6, 0, 2], [10, 0, 3], [14, 12, 2]],
    [[0, 0, 3], [3, 0, 1], [6, 0, 2], [10, 0, 2], [12, 7, 1], [14, 0, 2]],
    [[0, 0, 2], [3, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 2], [11, 0, 1], [12, 7, 2], [14, 0, 1], [15, 12, 1]],
    [[0, 0, 2], [3, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 2], [10, 7, 1], [11, 0, 1], [12, 7, 2], [14, 0, 1], [15, 12, 1]]
  ];
  const KICK_P = [[0], [0, 10], [0, 7, 10], [0, 3, 7, 10], [0, 3, 7, 10, 13], [0, 3, 7, 10, 12, 14]];
  const LEAD = [
    [[0, 81, 6], [6, 79, 2], [8, 76, 6], [14, 79, 2]],
    [[0, 77, 6], [6, 76, 2], [8, 72, 6], [12, 76, 2]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 4], [12, 83, 2], [14, 79, 2]],
    [[0, 79, 6], [6, 74, 2], [8, 74, 4], [12, 71, 4]]
  ];
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  const HAT16 = [1, 0.3, 0.6, 0.3];

  function scheduleStep(e) {
    const t = e.nextT, s = e.step, st = s & 15, bar = (s >> 4) & 3, c = e.c;
    if (st === 0) e.tier = e.pendTier;
    const menu = e.mode === 'menu', tier = menu ? 0 : e.tier, last = bar === 3;
    const base = menu ? 84 : 136 + (tier >= 5 ? 6 : 0) + A.speedR * 6;
    e.tempo += (base - e.tempo) * 0.25;
    const sp = 60 / e.tempo / 4;
    e.dly.delayTime.value = sp * 3;
    // chords
    if (st === 0) pad(t, CHORD[bar], sp * 16, menu ? 1300 : [900, 900, 1200, 1500, 1800, 2200][tier], menu ? 0.085 : tier >= 4 ? 0.06 : 0.075);
    // drums
    const kv = menu ? 0.6 : 0.85;
    if (KICK_P[tier].indexOf(st) >= 0) kick(t, kv);
    if (last && tier >= 3 && st === 15) kick(t, 0.7);
    if (menu ? st === 8 : tier >= 2 && st === 8) clap(t, menu ? 0.45 : 0.8);
    if (tier >= 4 && (st === 14 || (last && st >= 12))) clap(t, last && st >= 12 ? 0.35 + (st - 12) * 0.1 : 0.3);
    // hats
    if (menu) { if (st % 2 === 0) hat(t, 0.28 + (st % 4 === 0 ? 0.12 : 0)); }
    else if (tier === 1) { if (st % 4 === 2) hat(t, 0.4); }
    else if (tier === 2) { if (st % 2 === 0) hat(t, st % 4 === 0 ? 0.55 : 0.4); if (st === 6 || st === 14) hat(t, 0.45, true); }
    else {
      hat(t, 0.5 * HAT16[st & 3] + 0.12, (st === 6 || st === 14) && tier >= 3 && !(last && st === 14));
      if ((bar & 1) && st >= 12 && st % 2 === 0) hat(t + sp * 0.5, 0.42); // 32nd roll
      if (tier >= 5 && st >= 14) hat(t + sp * 0.5, 0.4);
      if (tier >= 4 && last && st === 13) hat(t + sp * 0.33, 0.4), hat(t + sp * 0.66, 0.4);
    }
    // 808
    const bp = BASS_P[menu ? 0 : tier];
    for (let i = 0; i < bp.length; i++) if (bp[i][0] === st) bass(t, ROOT[bar] + bp[i][1], bp[i][2] * sp, menu ? 0.55 : 1);
    // pluck arp
    if (!menu && tier >= 3 && (st % 2 === 0 || tier >= 5)) pluck(t, CHORD[bar][ARP[(st >> 1) & 7] % 4] + 12 + (st % 2 ? 12 : 0), tier >= 4 ? 0.9 : 0.7);
    // bells / lead
    if (menu || tier >= 4) {
      const L = LEAD[bar];
      for (let i = 0; i < L.length; i++) if (L[i][0] === st && (!menu || i % 2 === 0)) bell(t, L[i][1] - (menu ? 0 : 0), L[i][2] * sp * 0.9, menu ? 0.55 : 0.8);
    }
    if (!menu && tier >= 5 && (st === 0 || st === 6 || st === 10)) stab(t, CHORD[bar].slice(0, 3), 1);
    e.step++; e.nextT += sp;
  }
  function pump() {
    if (!E || !A.playing) return;
    const c = E.c, lim = c.currentTime + 0.16;
    if (E.nextT < c.currentTime) E.nextT = c.currentTime + 0.03; // we fell behind (tab throttled) — resync
    while (E.nextT < lim) scheduleStep(E);
  }

  /* ------------------------------------------------------------ public control */
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { A.enabled = false; return; }
    try { A.ctx = new AC(); } catch (e) { A.enabled = false; return; }
    E = makeEngine(A.ctx);
  };
  A.startMusic = function () {
    if (!E || A.playing) return;
    A.playing = true; E.nextT = E.c.currentTime + 0.06;
    A.timer = setInterval(pump, 25);
  };
  A.stopMusic = function () { A.playing = false; clearInterval(A.timer); };
  A.setMode = function (m) {
    if (A.mode === m) return;
    const prev = A.mode; A.mode = m;
    if (!E) return;
    const t = E.c.currentTime;
    if (m === 'over') { E.musLP.frequency.cancelScheduledValues(t); E.musLP.frequency.setTargetAtTime(520, t, 0.12); E.pendTier = 1; return; }
    E.musLP.frequency.cancelScheduledValues(t); E.musLP.frequency.setTargetAtTime(16000, t, 0.25);
    if ((prev === 'menu') !== (m === 'menu')) { E.mode = m; E.step = 0; E.tier = E.pendTier = 1; if (A.playing) E.nextT = Math.max(E.nextT, t + 0.05); }
    else E.mode = m;
  };
  A.setIntensity = function (threat, speedRatio) {
    A.stars = Math.max(1, Math.min(5, Math.ceil((threat || 0) / 2)));
    A.speedR = speedRatio || 0;
    if (E && A.mode === 'play') E.pendTier = A.stars;
  };
  A.setBlind = function (b) {
    if (A.blind === b) return; A.blind = b;
    if (!E) return;
    const t = E.c.currentTime;
    E.dry.gain.cancelScheduledValues(t); E.wet.gain.cancelScheduledValues(t); E.radio.frequency.cancelScheduledValues(t);
    E.dry.gain.setTargetAtTime(b ? 0.15 : 1, t, 0.14); E.wet.gain.setTargetAtTime(b ? 1.7 : 0, t, 0.14);
    E.radio.frequency.setValueAtTime(b ? 400 : 1400, t);
    E.radio.frequency.exponentialRampToValueAtTime(b ? 1500 : 3500, t + 0.45);
    if (!b) E.radio.frequency.setValueAtTime(1400, t + 0.5);
  };
  A.duck = function (amt, secs) {
    if (!E) return; const t = E.c.currentTime, g = E.musBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(MUSV * (1 - amt), t); g.linearRampToValueAtTime(MUSV, t + secs);
  };
  A.setMuted = function (m) {
    A.muted = !!m; try { localStorage.setItem('sl_muted', A.muted ? '1' : '0'); } catch (e) {}
    if (E) E.master.gain.setTargetAtTime(A.muted ? 0 : A.volume, E.c.currentTime, 0.04);
  };
  A.toggleMute = function () { A.setMuted(!A.muted); return A.muted; };
  A.setMusicEnabled = function (on) { A.musicEnabled = !!on; if (E) E.musOut.gain.setTargetAtTime(on ? 1 : 0, E.c.currentTime, 0.05); };
  A.setSfxEnabled = function (on) { A.sfxEnabled = !!on; if (E) E.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, E.c.currentTime, 0.05); };

  /* ------------------------------------------------------------ SFX (all soft, no square-wave buzz) */
  const S = (fn) => function () { if (!E || !A.enabled) return; fn.apply(null, arguments); };
  A.lane = S(function (dir) { noise(0.17, 0.2, { f: dir > 0 ? 600 : 2600, fTo: dir > 0 ? 2600 : 600, q: 1.1, atk: 0.04, pan: 0.5 * (dir || 0) }); });
  A.jump = S(function () { noise(0.24, 0.16, { f: 500, fTo: 2000, q: 1, atk: 0.05 }); tone(150, 0.14, 'sine', 0.2, { slide: 280 }); });
  A.slide = S(function () { noise(0.32, 0.17, { f: 2600, fTo: 380, q: 1, atk: 0.04 }); });
  A.land = S(function () { tone(95, 0.13, 'sine', 0.3, { slide: 46 }); noise(0.07, 0.12, { f: 700, type: 'lowpass' }); });
  A.coin = S(function (combo) {
    const f = 1318.5 * Math.pow(2, Math.min(10, combo || 0) / 24);
    tone(f, 0.32, 'sine', 0.14, { send: 0.18 }); tone(f * 2, 0.16, 'sine', 0.05);
    tone(f * 1.5, 0.4, 'sine', 0.12, { delay: 0.07, send: 0.18 }); tone(f * 3, 0.2, 'sine', 0.04, { delay: 0.07 });
  });
  A.near = S(function () { noise(0.13, 0.12, { f: 2400, fTo: 6000, type: 'highpass', q: 0.7, atk: 0.02 }); tone(990, 0.1, 'triangle', 0.07, { slide: 1480 }); });
  A.outplay = S(function () { [660, 880, 1320].forEach((f, i) => tone(f, 0.4, 'sine', 0.1, { delay: i * 0.075, send: 0.3 })); });
  A.bump = S(function () { tone(125, 0.16, 'sine', 0.3, { slide: 55 }); noise(0.1, 0.16, { f: 600, type: 'lowpass' }); });
  A.crash = S(function () {
    tone(120, 0.7, 'sine', 0.55, { slide: 30 });
    noise(0.75, 0.42, { f: 3200, fTo: 220, type: 'lowpass', q: 0.6 });
    noise(0.18, 0.25, { f: 1900, q: 1.5, delay: 0.02, send: 0.3 }); noise(0.14, 0.18, { f: 2700, q: 1.8, delay: 0.09 });
    A.duck(0.7, 1.1);
  });
  A.glitch = S(function () { // jammer on: soft radio tuning sweep, no noise burst
    noise(0.65, 0.1, { f: 280, fTo: 3200, q: 2.2, atk: 0.15, send: 0.25 });
    tone(880, 0.18, 'sine', 0.08, { send: 0.3 }); tone(1320, 0.3, 'sine', 0.07, { delay: 0.1, send: 0.3 });
  });
  A.glitchEnd = S(function () { noise(0.5, 0.08, { f: 3200, fTo: 300, q: 2.2, atk: 0.08, send: 0.2 }); tone(660, 0.3, 'sine', 0.07, { slide: 440, send: 0.25 }); });
  A.taunt = S(function () { noise(0.05, 0.08, { f: 1900, q: 2.5 }); tone(1250, 0.04, 'sine', 0.04); });
  A.speedup = S(function () { tone(300, 0.3, 'sine', 0.07, { slide: 640, atk: 0.1 }); });
  A.threat = S(function () { tone(98, 0.3, 'sine', 0.1, { slide: 74 }); });
  A.uiBlip = S(function () { tone(720, 0.05, 'sine', 0.07, { slide: 900 }); });
  A.buy = S(function () { [1046.5, 1568].forEach((f, i) => tone(f, 0.4, 'sine', 0.11, { delay: i * 0.09, send: 0.25 })); noise(0.05, 0.06, { f: 6000, type: 'highpass', delay: 0.01 }); });
  A.deny = S(function () { tone(180, 0.12, 'sine', 0.14, { slide: 120 }); });
  A.bail = S(function () { noise(0.55, 0.25, { f: 4000, fTo: 250, type: 'lowpass', q: 0.8 }); tone(180, 0.4, 'sine', 0.35, { slide: 60 }); [523, 784, 1047].forEach((f, i) => tone(f, 0.45, 'sine', 0.08, { delay: 0.25 + i * 0.08, send: 0.3 })); });
  A.start = S(function () {
    const t = now(); bass(t, 33, 0.7, 0.9); noise(0.38, 0.1, { f: 300, fTo: 4200, q: 1.1, atk: 0.2 });
    // route bass() through sfx: it writes to bassBus (music chain), fine — it is a stinger
  });
  A.siren = S(function (level) { // police siren swell when stars rise
    const c = E.c, t = now(), dur = 1.5 + level * 0.25, v = 0.035 + level * 0.012;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 880; lfo.type = 'triangle'; lfo.frequency.value = 0.85 + level * 0.12; lg.gain.value = 300;
    lfo.connect(lg); lg.connect(o.frequency); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(E.sfxBus); const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(E.send);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  });

  /* ------------------------------------------------------------ offline rendering (tests: level + tempo analysis) */
  A.renderOffline = async function (secs, o) {
    o = o || {}; const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext; if (!OAC) return null;
    const sr = 22050, oc = new OAC(1, Math.ceil(sr * secs), sr), live = E, liveMode = A.mode, liveSpeed = A.speedR;
    A.mode = o.mode || 'play'; A.speedR = 0;
    E = makeEngine(oc); E.mode = A.mode; E.tier = E.pendTier = o.tier || 3; E.nextT = 0.02;
    try {
      if (o.sfx) { for (const [i, nm] of o.sfx.entries()) { E.t0 = 0.3 + i * 1.2; A[nm[0]].apply(null, nm.slice(1)); E.t0 = undefined; } }
      else while (E.nextT < secs) scheduleStep(E);
      const buf = await oc.startRendering(); return { sr, data: Array.from(buf.getChannelData(0)) };
    } finally { E = live; A.mode = liveMode; A.speedR = liveSpeed; }
  };

  global.Sfx = A;
})(window);
