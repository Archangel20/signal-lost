/* SIGNAL LOST — WebAudio chiptune SFX + adaptive music (no assets) */
(function (global) {
  'use strict';
  const A = {
    ctx: null, master: null, sfxBus: null, musBus: null, musFilter: null, noiseBuf: null,
    muted: false, enabled: true, musicOn: false, step: 0, nextT: 0, timer: null,
    tempo: 124, intensity: 0, blind: false, volume: 0.55
  };
  try { A.muted = localStorage.getItem('sl_muted') === '1'; } catch (e) {}

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { A.enabled = false; return; }
    const c = A.ctx = new AC();
    A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : A.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.14;
    A.master.connect(comp); comp.connect(c.destination);
    A.sfxBus = c.createGain(); A.sfxBus.gain.value = 0.9; A.sfxBus.connect(A.master);
    A.musFilter = c.createBiquadFilter(); A.musFilter.type = 'lowpass'; A.musFilter.frequency.value = 9000;
    A.musBus = c.createGain(); A.musBus.gain.value = 0.42;
    A.musBus.connect(A.musFilter); A.musFilter.connect(A.master);
    const len = c.sampleRate * 1;
    A.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('sl_muted', m ? '1' : '0'); } catch (e) {}
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : A.volume, A.ctx.currentTime, 0.02);
  };
  A.toggleMute = function () { A.setMuted(!A.muted); return A.muted; };

  function tone(freq, dur, type, vol, opts) {
    if (!A.ctx || A.muted) return;
    opts = opts || {};
    const c = A.ctx, t = (opts.t || c.currentTime) + (opts.delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    if (opts.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = opts.vib; lg.gain.value = freq * 0.03; l.connect(lg); lg.connect(o.frequency);
      l.start(t); l.stop(t + dur + 0.05);
    }
    const a = opts.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opts.bus || A.sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, opts) {
    if (!A.ctx || A.muted) return;
    opts = opts || {};
    const c = A.ctx, t = (opts.t || c.currentTime) + (opts.delay || 0);
    const s = c.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = opts.type || 'bandpass';
    f.frequency.setValueAtTime(opts.f || 2000, t);
    if (opts.fTo) f.frequency.exponentialRampToValueAtTime(opts.fTo, t + dur);
    f.Q.value = opts.q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(opts.bus || A.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  A.jump = function () { tone(260, 0.16, 'square', 0.16, { slide: 780 }); tone(520, 0.1, 'triangle', 0.1, { slide: 1040, delay: 0.02 }); };
  A.slide = function () { noise(0.22, 0.28, { f: 3200, fTo: 500, q: 1.2 }); tone(300, 0.14, 'sawtooth', 0.07, { slide: 90 }); };
  A.lane = function (dir) { tone(dir > 0 ? 520 : 440, 0.05, 'square', 0.09, { slide: dir > 0 ? 700 : 330 }); noise(0.05, 0.07, { f: 5000, type: 'highpass' }); };
  A.land = function () { tone(110, 0.09, 'triangle', 0.18, { slide: 55 }); noise(0.06, 0.1, { f: 900, type: 'lowpass' }); };
  A.coin = function (combo) {
    const base = 880 * Math.pow(2, Math.min(12, combo || 0) / 12 * 0.6);
    tone(base, 0.07, 'square', 0.12); tone(base * 1.5, 0.12, 'square', 0.11, { delay: 0.055 });
  };
  A.near = function () {
    tone(180, 0.18, 'sawtooth', 0.15, { slide: 1400 });
    tone(1400, 0.1, 'square', 0.1, { delay: 0.12, slide: 2100 });
    noise(0.16, 0.2, { f: 1200, fTo: 6000, q: 0.7 });
  };
  A.outplay = function () {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.11, 'square', 0.12, { delay: i * 0.05 }));
    tone(262, 0.3, 'triangle', 0.16);
  };
  A.bump = function () { tone(150, 0.14, 'sawtooth', 0.18, { slide: 60 }); noise(0.12, 0.2, { f: 700, type: 'lowpass' }); };
  A.crash = function () {
    noise(0.7, 0.55, { f: 3000, fTo: 120, type: 'lowpass', q: 0.5 });
    tone(220, 0.6, 'sawtooth', 0.22, { slide: 35 });
    tone(110, 0.8, 'square', 0.14, { slide: 28, delay: 0.05 });
  };
  A.glitch = function () {
    for (let i = 0; i < 10; i++) tone(300 + Math.random() * 1800, 0.05, i % 2 ? 'square' : 'sawtooth', 0.12, { delay: i * 0.045 });
    noise(0.5, 0.3, { f: 8000, fTo: 400, type: 'bandpass', q: 3 });
    tone(80, 0.6, 'sawtooth', 0.2, { slide: 600, delay: 0.1 });
  };
  A.glitchEnd = function () { tone(900, 0.25, 'square', 0.12, { slide: 200 }); noise(0.2, 0.15, { f: 600, type: 'lowpass' }); };
  A.taunt = function () { tone(1760, 0.04, 'square', 0.05); tone(1320, 0.04, 'square', 0.05, { delay: 0.05 }); tone(1760, 0.06, 'square', 0.04, { delay: 0.1 }); };
  A.speedup = function () { [330, 392, 494, 659].forEach((f, i) => tone(f, 0.08, 'square', 0.1, { delay: i * 0.04 })); };
  A.start = function () { [196, 294, 392, 587].forEach((f, i) => tone(f, 0.14, 'square', 0.13, { delay: i * 0.06 })); noise(0.3, 0.2, { f: 400, fTo: 5000, q: 1 }); };
  A.uiBlip = function () { tone(660, 0.05, 'square', 0.08); };
  A.threat = function () { tone(98, 0.35, 'sawtooth', 0.12, { slide: 73 }); tone(104, 0.35, 'sawtooth', 0.1, { slide: 77 }); };

  /* ---------- music: A-minor synthwave, 16th-note scheduler ---------- */
  const BASS = [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 41, 41, 53, 45]; // per 16th, pattern of 16 → 1 bar (shifts per bar)
  const ROOTS = [45, 48, 43, 41]; // Am C G F (as midi 45=A2)
  const ARP = [0, 7, 12, 7, 3, 7, 12, 15];
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);

  function schedule() {
    if (!A.ctx || !A.musicOn) return;
    const c = A.ctx, sp = 60 / A.tempo / 4;
    while (A.nextT < c.currentTime + 0.14) {
      const s = A.step, t = A.nextT, bar = Math.floor(s / 16) % 4, st = s % 16;
      const root = ROOTS[bar];
      if (!A.muted) {
        // kick
        if (st % 4 === 0 || (A.intensity > 3 && st === 14)) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
          g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          o.connect(g); g.connect(A.musBus); o.start(t); o.stop(t + 0.2);
        }
        // hats
        if (st % 2 === 1 || A.intensity > 5) noise(0.04, st % 4 === 3 ? 0.16 : 0.08, { t, f: 8000, type: 'highpass', bus: A.musBus });
        // snare-ish clap
        if (st === 4 || st === 12) noise(0.12, 0.22, { t, f: 1800, q: 0.6, bus: A.musBus });
        // bass (offbeat pulse)
        if (st % 2 === 0 || st === 15) {
          const n = root + (st === 6 || st === 14 ? 12 : 0) + (st === 10 ? 7 : 0);
          tone(mf(n), 0.13, 'sawtooth', 0.2, { t, bus: A.musBus });
        }
        // arp (comes in with threat)
        if (A.intensity >= 2) {
          const n = root + 24 + ARP[st % 8] + (bar === 1 ? 0 : 0);
          tone(mf(n), 0.09, 'square', 0.055 + A.intensity * 0.004, { t, bus: A.musBus });
        }
        // lead stabs at high threat
        if (A.intensity >= 6 && (st === 0 || st === 3 || st === 8 || st === 11)) {
          tone(mf(root + 36 + (st === 8 ? 3 : st === 11 ? 7 : 0)), 0.2, 'square', 0.06, { t, bus: A.musBus, vib: 6 });
        }
      }
      A.step++;
      A.nextT += sp * (A.blind ? 1.0 : 1.0);
    }
  }

  A.startMusic = function () {
    if (!A.ctx || A.musicOn) return;
    A.musicOn = true; A.step = 0; A.nextT = A.ctx.currentTime + 0.06;
    A.timer = setInterval(schedule, 25);
  };
  A.stopMusic = function () { A.musicOn = false; clearInterval(A.timer); };
  A.setIntensity = function (v, speedRatio) {
    A.intensity = v;
    A.tempo = 118 + (speedRatio || 0) * 36;
  };
  A.setBlind = function (b) {
    if (!A.ctx || A.blind === b) { A.blind = b; return; }
    A.blind = b;
    const t = A.ctx.currentTime;
    A.musFilter.frequency.cancelScheduledValues(t);
    A.musFilter.frequency.setTargetAtTime(b ? 520 : 9000, t, b ? 0.05 : 0.4);
  };
  A.duck = function (amt, secs) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.musBus.gain.cancelScheduledValues(t);
    A.musBus.gain.setValueAtTime(0.42 * (1 - amt), t);
    A.musBus.gain.linearRampToValueAtTime(0.42, t + secs);
  };

  global.Sfx = A;
})(window);
