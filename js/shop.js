/* SIGNAL LOST — Garage (upgrades, outfits, stats) + Settings modal. DOM only; state lives in Save. */
(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);
  const S = global.Save;
  const money = n => '$' + Math.floor(n).toLocaleString('en-US');
  const mmss = t => { t = Math.floor(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const Shop = { hooks: {} };
  let shop, body, settings, openCount = 0;

  Shop.isOpen = () => !!(shop && (!shop.classList.contains('hidden') || !settings.classList.contains('hidden')));

  function pips(id) { const u = S.UPGRADES[id], lv = S.data.up[id]; let h = ''; for (let i = 0; i < u.max; i++) h += '<i' + (i < lv ? ' class="on"' : '') + '></i>'; return '<span class="pips" aria-label="level ' + lv + ' of ' + u.max + '">' + h + '</span>'; }

  function render() {
    const d = S.data; let h = '<h3>Upgrades</h3>';
    for (const id of Object.keys(S.UPGRADES)) {
      const u = S.UPGRADES[id], c = S.cost(id), lv = d.up[id];
      const btn = c === null ? '<button class="buy eq" disabled>' + (u.max === 1 ? 'Owned' : 'Maxed') + '</button>'
        : '<button class="buy" data-buy="up:' + id + '"' + (d.wallet < c ? ' disabled' : '') + '>' + money(c) + '</button>';
      h += '<div class="item"><div class="nm">' + u.name + (u.max > 1 ? pips(id) : '') + '</div><div class="ds">' + u.desc + '</div><div class="act">' + btn + '</div></div>';
    }
    h += '<h3>Outfits</h3>';
    for (const id of Object.keys(S.OUTFITS)) {
      const o = S.OUTFITS[id], own = d.owned.indexOf(id) >= 0, on = d.outfit === id;
      const btn = on ? '<button class="buy eq" disabled>Equipped</button>' : own ? '<button class="buy own" data-buy="equip:' + id + '">Equip</button>'
        : '<button class="buy" data-buy="outfit:' + id + '"' + (d.wallet < o.cost ? ' disabled' : '') + '>' + money(o.cost) + '</button>';
      h += '<div class="item"><div class="nm"><span class="sw"><i style="background:' + o.swatch[0] + '"></i><i style="background:' + o.swatch[1] + '"></i></span>' + o.name + '</div><div class="ds">' + (id === 'courier' ? 'The standard-issue delivery hoodie.' : own ? 'Owned.' : 'Cosmetic only.') + '</div><div class="act">' + btn + '</div></div>';
    }
    const st = d.stats; S.rollDay();
    h += '<h3>Your stats</h3><div class="stats">' +
      [['Best run', money(Math.max(st.best, global.Game ? Game.best : 0))], ['Best today', money(d.daily.best)], ['Runs today', d.daily.runs], ['Total runs', st.runs], ['Total earned', money(st.cash)],
       ['Longest run', mmss(st.longest)], ['Near misses', st.near], ['Jammers grabbed', st.jams], ['Bail-outs used', st.bails]].map(r => '<div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div>').join('') + '</div>';
    h += '<p class="note">Cash you earn at the end of every run is banked here. Upgrades are permanent.</p>';
    body.innerHTML = h; $('shop-wallet').textContent = money(d.wallet);
  }
  Shop.render = render;

  function refreshSettings() {
    const set = S.data.set, M = { master: !global.Sfx.muted, music: set.music, sfx: set.sfx, haptics: set.haptics };
    settings.querySelectorAll('[data-set]').forEach(b => b.setAttribute('aria-checked', M[b.dataset.set] ? 'true' : 'false'));
  }
  Shop.refreshSettings = refreshSettings;

  Shop.openShop = function () { render(); shop.classList.remove('hidden'); body.scrollTop = 0; $('shop-close').focus({ preventScroll: true }); };
  Shop.closeShop = function () { shop.classList.add('hidden'); Shop.hooks.onClose && Shop.hooks.onClose(); };
  Shop.openSettings = function () { refreshSettings(); settings.classList.remove('hidden'); $('set-close').focus({ preventScroll: true }); };
  Shop.closeSettings = function () { settings.classList.add('hidden'); Shop.hooks.onClose && Shop.hooks.onClose(); };
  Shop.closeAll = function () { if (!shop.classList.contains('hidden')) Shop.closeShop(); else if (!settings.classList.contains('hidden')) Shop.closeSettings(); };

  Shop.init = function (hooks) {
    Shop.hooks = hooks || {};
    shop = $('shop'); body = $('shop-body'); settings = $('settings');
    $('shop-close').addEventListener('click', e => { e.stopPropagation(); Shop.closeShop(); });
    $('set-close').addEventListener('click', e => { e.stopPropagation(); Shop.closeSettings(); });
    for (const id of ['btn-garage', 'btn-garage-over']) $(id).addEventListener('click', e => { e.stopPropagation(); Shop.hooks.ui && Shop.hooks.ui(); Shop.openShop(); });
    for (const id of ['btn-settings', 'btn-gear']) $(id).addEventListener('click', e => { e.stopPropagation(); Shop.hooks.ui && Shop.hooks.ui(); Shop.openSettings(); });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-buy]'); if (!b || b.disabled) return;
      const [kind, id] = b.dataset.buy.split(':'); let ok = false;
      if (kind === 'up') ok = S.buyUpgrade(id); else if (kind === 'outfit') ok = S.buyOutfit(id); else if (kind === 'equip') ok = S.equip(id);
      if (ok) { Shop.hooks.onChange && Shop.hooks.onChange(kind === 'equip' ? 'equip' : 'buy'); }
      const y = body.scrollTop; render(); body.scrollTop = y;
    });
    settings.addEventListener('click', e => {
      const b = e.target.closest('[data-set]'); if (!b) return;
      const k = b.dataset.set, set = S.data.set;
      if (k === 'master') global.Sfx.setMuted(!global.Sfx.muted); else { set[k] = !set[k]; S.save(); }
      if (k === 'music') global.Sfx.setMusicEnabled(set.music); if (k === 'sfx') global.Sfx.setSfxEnabled(set.sfx);
      Shop.hooks.onChange && Shop.hooks.onChange('settings'); refreshSettings();
    });
    [shop, settings].forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) { m === shop ? Shop.closeShop() : Shop.closeSettings(); } }));
    $('shop-wallet').textContent = money(S.data.wallet);
  };
  Shop.money = money;
  global.Shop = Shop;
})(window);
