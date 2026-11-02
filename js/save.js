/* SIGNAL LOST — persistent save (localStorage): wallet, garage upgrades, outfits, run stats, daily best, settings. */
(function (global) {
  'use strict';
  const KEY = 'sl_save_v1';
  const UPGRADES = {
    jam:    { name: 'Jammer battery', desc: 'Signal jammer lasts longer (+1.5 s per level).', max: 3, cost: [500, 1200, 2600] },
    magnet: { name: 'Cash magnet', desc: 'Pulls nearby cash toward you. Wider each level.', max: 3, cost: [600, 1400, 3000] },
    bail:   { name: 'Bail-out', desc: 'Survive one crash per run: the street clears and you keep going.', max: 1, cost: [1800] }
  };
  const OUTFITS = {
    courier: { name: 'Courier', cost: 0, hood: 0xc65a3e, hoodD: 0x8f3f2c, bag: 0x1d8081, pants: 0x2c3442, stripe: 0xdfe3df, stripeE: 0x555a55, swatch: ['#c65a3e', '#1d8081'] },
    night:   { name: 'Night Shift', cost: 1500, hood: 0x23262d, hoodD: 0x15171b, bag: 0x2b303a, pants: 0x14161a, stripe: 0x6fdcff, stripeE: 0x2a7fa0, swatch: ['#23262d', '#6fdcff'] },
    hiviz:   { name: 'Hi-Viz Crew', cost: 2500, hood: 0xe0742a, hoodD: 0xa4501c, bag: 0x2a2f36, pants: 0x1d2330, stripe: 0xe8ecef, stripeE: 0x6a6f72, swatch: ['#e0742a', '#2a2f36'] },
    ghost:   { name: 'Ghost', cost: 4000, hood: 0xd9d8d3, hoodD: 0xa9a8a3, bag: 0x585d66, pants: 0x34383e, stripe: 0xf0b24a, stripeE: 0x7a5a1f, swatch: ['#d9d8d3', '#585d66'] }
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fresh = () => ({
    v: 1, wallet: 0, up: { jam: 0, magnet: 0, bail: 0 }, owned: ['courier'], outfit: 'courier',
    stats: { runs: 0, time: 0, cash: 0, longest: 0, near: 0, jams: 0, bails: 0, best: 0, bestPred: 0 },
    daily: { d: today(), best: 0, runs: 0 }, set: { music: true, sfx: true, haptics: true }, tut: {}
  });
  const S = { UPGRADES, OUTFITS, data: fresh(), today };
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const f = fresh();
    if (d && typeof d === 'object') {
      f.wallet = Math.max(0, +d.wallet || 0);
      Object.keys(f.up).forEach(k => { f.up[k] = Math.max(0, Math.min(UPGRADES[k].max, +(d.up && d.up[k]) || 0)); });
      f.owned = Array.isArray(d.owned) ? d.owned.filter(id => OUTFITS[id]) : f.owned; if (f.owned.indexOf('courier') < 0) f.owned.unshift('courier');
      f.outfit = OUTFITS[d.outfit] && f.owned.indexOf(d.outfit) >= 0 ? d.outfit : 'courier';
      Object.assign(f.stats, d.stats || {}); Object.assign(f.set, d.set || {}); f.tut = d.tut || {};
      if (d.daily && d.daily.d === today()) f.daily = Object.assign(f.daily, d.daily);
    }
    S.data = f;
  }
  S.save = function () { try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) {} };
  S.rollDay = function () { if (S.data.daily.d !== today()) S.data.daily = { d: today(), best: 0, runs: 0 }; };
  S.cost = function (id) { const u = UPGRADES[id], lv = S.data.up[id]; return lv >= u.max ? null : u.cost[lv]; };
  S.buyUpgrade = function (id) {
    const c = S.cost(id); if (c === null || S.data.wallet < c) return false;
    S.data.wallet -= c; S.data.up[id]++; S.save(); return true;
  };
  S.buyOutfit = function (id) {
    const o = OUTFITS[id]; if (!o || S.data.owned.indexOf(id) >= 0 || S.data.wallet < o.cost) return false;
    S.data.wallet -= o.cost; S.data.owned.push(id); S.data.outfit = id; S.save(); return true;
  };
  S.equip = function (id) { if (S.data.owned.indexOf(id) >= 0) { S.data.outfit = id; S.save(); return true; } return false; };
  /* called once per finished (non-god) run */
  S.recordRun = function (r) {
    S.rollDay(); const d = S.data, st = d.stats;
    d.wallet += Math.max(0, r.score | 0); st.runs++; st.time += r.time || 0; st.cash += r.score | 0; st.longest = Math.max(st.longest, r.time || 0);
    st.near += r.near | 0; st.jams += r.jams | 0; st.bails += r.bails | 0; st.best = Math.max(st.best, r.score | 0); st.bestPred = Math.max(st.bestPred, r.pred | 0);
    d.daily.runs++; d.daily.best = Math.max(d.daily.best, r.score | 0);
    S.save();
  };
  S.tutDone = function (k) { S.data.tut[k] = 1; S.save(); };
  load();
  global.Save = S;
})(window);
