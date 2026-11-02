/* SIGNAL LOST — boot, input, loop, sound wiring */
(function () {
  'use strict';
  const G = Game, cv = document.getElementById('game');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let lastStars = 0, W = 0, H = 0, audioOn = false, paused = false, frozen = false, lastBlind = false, startedAt = 0, glOK = true;
  G.hint = !(Save.data.tut && Save.data.tut.done);
  function syncUp() { G.up = Object.assign({ jam: 0, cash: 0, turbo: 0, bail: 0 }, Save.data.up); G.perk = Save.perk(); G.loc = Save.data.loc | 0; if (G.state === 'title' || G.attract) G.stage = G.loc; }
  function syncOutfit() { if (glOK) { try { Render.setOutfit(Save.OUTFITS[Save.data.outfit] || Save.OUTFITS.courier); } catch (e) { console.warn('outfit', e); } } }
  function syncAudioSettings() { const s = Save.data.set; Sfx.setMusicEnabled(s.music); Sfx.setSfxEnabled(s.sfx); if (Sfx.setVoiceEnabled) Sfx.setVoiceEnabled(s.voice !== false); }
  syncUp();

  /* ---------- sizing (full-resolution, devicePixelRatio aware; no low-res buffer) ---------- */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    if (glOK) Render.resize(W, H);
    HUD.resize();
  }
  try { Render.init(cv); } catch (err) { glOK = false; console.error('WebGL init failed', err); document.getElementById('nogl').classList.remove('hidden'); }
  HUD.init(G, { start: () => press(), retry: () => retry(), resume: () => setPaused(false) });
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize(); G.reset(true); syncOutfit();
  Shop.init({
    ui: () => { wake(); try { Sfx.uiBlip(); } catch (e) {} },
    onChange: kind => { syncUp(); syncOutfit(); syncAudioSettings(); syncMute(); try { if (kind === 'buy') Sfx.buy(); else if (kind === 'equip') Sfx.uiBlip(); } catch (e) {} },
    onClose: () => { try { Sfx.uiBlip(); } catch (e) {} }
  });

  /* ---------- audio ---------- */
  function wake() {
    if (!audioOn) { audioOn = true; try { Sfx.init(); syncAudioSettings(); Sfx.startMusic(); Sfx.preloadVoice && Sfx.preloadVoice(); } catch (e) { console.warn('audio', e); } }
    else if (Sfx.ctx && Sfx.ctx.state === 'suspended') Sfx.ctx.resume();
  }
  function say(id, prio, cd) { try { if (Sfx.say) Sfx.say(id, prio || 1, cd === undefined ? 0 : cd); } catch (e) {} }
  function drain() {
    const ev = G.events; if (!ev.length) return;
    for (const e of ev) {
      if (e.type === 'crash' && !G.god && !G.attract && audioOn) setTimeout(() => say(G.newBestPts ? 'best' : 'crash', 6, 0), 900);
      if (e.type === 'crash' && !G.god && !G.attract && !G.runSaved) { // bank the run (always, even if audio is off)
        G.runSaved = true; G.bankedRun = G.finalScore || 0;
        Save.recordRun({ score: G.finalScore || 0, time: G.time, near: G.nearCount, jams: G.jams, bails: G.bails, pts: G.finalPts, coins: G.coins, words: G.wordsDone, missions: G.missionsDone, dist: G.dist });
      }
      if ((e.type === 'crash' || e.type === 'bail') && !G.god && Save.data.set.haptics && navigator.vibrate) { try { navigator.vibrate(e.type === 'crash' ? [60, 40, 140] : 45); } catch (_) {} }
      if (!audioOn) continue;
      try {
        switch (e.type) {
          case 'lane': Sfx.lane(e.dir); break;
          case 'jump': Sfx.jump(); break;
          case 'slide': Sfx.slide(); break;
          case 'land': Sfx.land(); break;
          case 'coin': Sfx.coin(G.combo); break;
          case 'near': Sfx.near(); break;
          case 'outplay': Sfx.outplay(); break;
          case 'bump': case 'edge': Sfx.bump(); break;
          case 'crash': Sfx.crash(); break;
          case 'bail': Sfx.bail(); break;
          case 'chip': Sfx.glitch(); Sfx.duck(); break;
          case 'blindEnd': Sfx.glitchEnd(); break;
          case 'speedup': Sfx.speedup(); break;
          case 'taunt': Sfx.taunt(); break;
          case 'predHit': Sfx.threat && Sfx.threat(); break;
          case 'stage': if (!G.attract) { Sfx.stage(); say(STAGES[e.idx % STAGES.length].id, 3, 0); } break;
          case 'mission': Sfx.mission(); say(e.n % 2 ? 'mission1' : 'mission2', 2, 4); break;
          case 'letter': Sfx.letter(e.i); break;
          case 'word': Sfx.word(); say(e.n % 2 ? 'word1' : 'word2', 4, 4); break;
          case 'daily': Sfx.daily(); say('daily', 5, 4); break;
          case 'rival': say('rival', 2, 8); break;
          case 'ramp': Sfx.ramp(); say('ramp', 1, 14); break;
          case 'wheelie': Sfx.boost(); say('boost', 3, 6); break;
          case 'cloak': Sfx.glitchEnd(); break;
          case 'boost': Sfx.boost(); say('boost', 1, 14); break;
          case 'x2': Sfx.x2(); break;
          case 'task': Sfx.letter(3); break;
          case 'taskdone': Sfx.mission(); say('mission1', 3, 4); break;
          case 'parcel': Sfx.x2(); break;
        }
      } catch (err) { /* never let audio kill the loop */ }
    }
    ev.length = 0;
  }

  /* ---------- state flow ---------- */
  function startGame() {
    wake(); syncUp(); G.reset(false); G.runSaved = false; G.bankedRun = 0; lastStars = 0; paused = false; G.paused = false; startedAt = performance.now();
    try { Sfx.start(); } catch (e) {}
    try { const nm = Sfx.nextTrack ? Sfx.nextTrack() : ''; if (nm) HUD.nowPlaying(nm); if (audioOn) { Sfx.startMusic(); const cid = Save.data.outfit; if (Sfx.preloadVoice) Sfx.preloadVoice(['c_' + cid + '_s', 'c_' + cid + '_g']); setTimeout(() => { if (G.state === 'play' && !G.attract && G.time < 12) say('c_' + cid + '_s', 4, 0); }, 3300); } } catch (e) {}
  }
  function setPaused(p) {
    if (p === paused) return;
    if (p && !(G.state === 'play' && !G.attract)) return;
    paused = p; G.paused = p;
    try { if (audioOn) { if (p) Sfx.stopMusic(); else Sfx.startMusic(); } } catch (e) {}
  }
  function retry() { if (G.state === 'over' && G.overT > 0.7) { G.hint = false; startGame(); } }
  function press() { // generic "start / retry / resume" action
    wake();
    if (paused) setPaused(false);
    else if (G.state === 'title') startGame();
    else if (G.state === 'over') retry();
  }

  /* ---------- keyboard ---------- */
  const KEYS = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'J', KeyW: 'J', Space: 'J', ArrowDown: 'S', KeyS: 'S' };
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.code;
    if (Shop.isOpen()) { if (k === 'Escape') { e.preventDefault(); Shop.closeAll(); } return; }       // modals own the keyboard
    if ((k === 'Enter' || k === 'Space') && e.target && e.target.closest && e.target.closest('button')) return; // let focused buttons click
    if (KEYS[k] || k === 'Enter' || k === 'Escape' || k === 'KeyP') e.preventDefault();
    if (e.repeat && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyA' || k === 'KeyD' || k === 'ArrowUp' || k === 'KeyW' || k === 'Space' || k === 'ArrowDown' || k === 'KeyS')) return;
    if (k === 'KeyM') { wake(); toggleMute(); return; }
    if (k === 'KeyF') { toggleFull(); return; }
    if (k === 'KeyP' || k === 'Escape') { setPaused(!paused); return; }
    wake();
    if (paused) { if (!e.repeat) setPaused(false); return; }
    if (G.state === 'title') { if (!e.repeat && !/^(Shift|Control|Alt|Meta|Tab|CapsLock)/.test(k)) startGame(); return; }
    if (G.state === 'over') { if (k === 'Space' || k === 'Enter' || k === 'KeyR' || KEYS[k]) retry(); return; }
    if (k === 'KeyR') { startGame(); return; }
    const a = KEYS[k]; if (a) G.act(a);
  }, { passive: false });

  /* ---------- pointer / swipe ---------- */
  let ptr = null;
  const TH = 16;
  const isBtn = e => !!(e.target.closest && e.target.closest('button, .modal'));
  document.addEventListener('pointerdown', e => {
    if (isBtn(e)) return;
    if (G.state === 'title' && !G.paused) { wake(); return; }                     // title: only the START button starts a run (also lets the page scroll)
    e.preventDefault(); wake();
    try { document.body.setPointerCapture(e.pointerId); } catch (_) {}
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, moved: false, t: performance.now() };
  });
  document.addEventListener('pointermove', e => {
    if (!ptr || e.pointerId !== ptr.id || ptr.done) return;
    e.preventDefault();
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (Math.abs(dx) > TH && Math.abs(dx) > Math.abs(dy) * 0.8) { ptr.moved = true; ptr.done = true; ptr.x = e.clientX; ptr.y = e.clientY; if (G.state === 'play' && !paused) G.act(dx < 0 ? 'L' : 'R'); }
    else if (dy < -TH && Math.abs(dy) > Math.abs(dx)) { ptr.moved = true; ptr.done = true; ptr.x = e.clientX; ptr.y = e.clientY; if (G.state === 'play' && !paused) G.act('J'); }
    else if (dy > TH && Math.abs(dy) > Math.abs(dx)) { ptr.moved = true; ptr.done = true; ptr.x = e.clientX; ptr.y = e.clientY; if (G.state === 'play' && !paused) G.act('S'); }
  });
  const up = e => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const tap = !ptr.moved && Math.hypot(e.clientX - ptr.ox, e.clientY - ptr.oy) < 12; ptr = null;
    if (tap) press();
  };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', () => { ptr = null; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!(e.target.closest && e.target.closest('.scroll'))) e.preventDefault(); }, { passive: false });

  /* ---------- buttons ---------- */
  function toggleMute() { try { Sfx.toggleMute(); } catch (e) {} syncMute(); }
  function syncMute() { const b = document.getElementById('btn-mute'); b.classList.toggle('off', !!(Sfx.muted)); }
  function toggleFull() {
    const d = document, el = document.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    else (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
  }
  document.getElementById('btn-mute').addEventListener('click', e => { e.stopPropagation(); wake(); toggleMute(); e.currentTarget.blur(); });
  document.getElementById('btn-full').addEventListener('click', e => { e.stopPropagation(); toggleFull(); e.currentTarget.blur(); });
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 60));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  window.addEventListener('blur', () => setPaused(true));
  syncMute();

  /* ---------- loop ---------- */
  const DT = 1 / 120; let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!frozen) {
      if (!paused) {
        const ts = G.state === 'dead' ? 0.4 : 1;
        acc += dt * ts;
        let n = 0;
        while (acc >= DT && n++ < 24) { G.step(DT); acc -= DT; }
        drain();
        if (audioOn) {
          try {
            Sfx.setMode(G.state === 'play' && !G.attract ? 'play' : G.state === 'dead' || G.state === 'over' ? 'over' : 'menu');
            if (G.state === 'play' && !G.attract) {
              const stars = clamp(Math.ceil((G.threat || 1) / 2), 1, 5);
              if (lastStars && stars > lastStars) Sfx.siren(stars);
              lastStars = stars;
            }
            Sfx.setIntensity(G.state === 'play' || G.attract ? (G.threat || 1) : 1, clamp((G.speed - 20) / 22, 0, 1));
            const b = G.blindT > 0; if (b !== lastBlind) { lastBlind = b; Sfx.setBlind(b); }
          } catch (e) {}
        }
      }
      if (glOK) Render.frame(G, dt);
    }
    HUD.update(dt, paused);
  }
  requestAnimationFrame(frame);

  /* ---------- debug / test API ---------- */
  window.SL = {
    Save, Shop, syncUp, syncOutfit, G, Render, HUD, resize,
    freeze(v) { frozen = v !== false; },
    step(secs) { for (let i = 0; i < secs / DT; i++) G.step(DT); drain(); },
    draw(dt) { Render.frame(G, dt || 1 / 60); HUD.update(dt || 1 / 60, paused); },
    start(opts) { wake(); syncUp(); G.runSaved = false; G.reset(false, opts || {}); paused = false; G.paused = false; G.hint = false; },
    sim(secs, opts) { frozen = true; G.reset(false, Object.assign({ god: true, noflash: true }, opts)); G.hint = false; const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { G.step(DT); G.events.length = 0; } frozen = false; return { time: G.time, score: Math.floor(G.score), pred: G.brain.predPct(), godHits: G.godHits || 0, waves: G.waveLog.length }; },
    state() { const p = G.p; return { state: G.state, lane: p.lane, y: p.y, slide: p.slide, grounded: p.grounded, score: Math.floor(G.score), time: G.time, coins: G.coins, threat: G.threat, pred: G.brain.predPct(), blind: G.blindT, mult: G.mult, combo: G.combo, paused, W, H, stats: glOK ? Render.stats() : null }; },
    pause: setPaused,
    loc(i) { Save.data.loc = i; if (Save.data.locs.indexOf(i) < 0) Save.data.locs.push(i); syncUp(); }
  };
})();
