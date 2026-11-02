/* SIGNAL LOST — the ten stages. Pure data: the simulation reads names, the renderer reads the look.
   A new stage begins every STAGE_TIME seconds of running (default 180 s = 3 minutes, override with ?stagetime=10 for testing). */
(function (global) {
  'use strict';
  let stageTime = 180;
  try { const m = /[?&]stagetime=([0-9.]+)/.exec(location.search); if (m && +m[1] >= 3) stageTime = +m[1]; } catch (e) {}
  /* colours are 0xRRGGBB. road / walk are RGB multipliers on the road & pavement textures (values above 1 brighten).
     bld = building height factor (0 hides them), sky = far-skyline height factor, lamps = street-lamp scale,
     park = share of parked cars, shops = shop-front signs visible, props = roadside prop weights 0..1 */
  const STAGES = [
    { id: 'st01', name: 'Lagos Island', sub: 'Golden hour on the Marina',
      zen: 0x3b72b4, mid: 0x9bbcd8, hor: 0xf6cd92, fog: 0xcdb08c, fogNear: 40, fogFar: 190, glow: 0.85,
      sunCol: 0xffd9a0, sunInt: 2.3, sun: [-22, 24, 24], disc: 0.9, discCol: 0xffe2b0, discPos: [-105, 28], hemiSky: 0x9fb0c8, hemiGnd: 0x5a4a3c, hemiInt: 1.15, fill: 0.7,
      facEm: 0.1, shopEm: 0.45, lampOn: 0.0, lampCol: 0xffe0a8, road: [1, 1, 1], walk: [1, 1, 1], ground: 0x4a4a48, groundY: -0.05,
      bld: 1, bldTint: 0xffffff, sky: 1, skyTint: 0xffffff, shops: 1, lamps: 1, park: 1, stars: 0, rain: 0, props: { palm: 1 } },
    { id: 'st02', name: 'Third Mainland Bridge', sub: 'Dusk over the lagoon',
      zen: 0x3d4f86, mid: 0xb07f90, hor: 0xffa868, fog: 0xc8907a, fogNear: 35, fogFar: 200, glow: 1,
      sunCol: 0xff9a5a, sunInt: 2.2, sun: [-22, 14, 24], disc: 0.95, discCol: 0xffb070, discPos: [-110, 12], hemiSky: 0x9a9cc8, hemiGnd: 0x5a4a50, hemiInt: 1.45, fill: 0.8,
      facEm: 0.35, shopEm: 0.6, lampOn: 0.55, lampCol: 0xffd9a0, road: [1.15, 1.12, 1.12], walk: [1.15, 1.15, 1.18], ground: 0x2a3b52, groundY: -6,
      bld: 0, bldTint: 0xe0cdd2, sky: 0.4, skyTint: 0xd0b8c8, shops: 0, lamps: 1, park: 0, stars: 0.25, rain: 0, props: { rail: 1, pylon: 1 } },
    { id: 'st03', name: 'Lekki Toll Gate', sub: 'Night shift, VIP lane open',
      zen: 0x14234a, mid: 0x2f4a82, hor: 0x6a86bc, fog: 0x34487a, fogNear: 30, fogFar: 170, glow: 0,
      sunCol: 0xa6b8f0, sunInt: 1.5, sun: [12, 38, 18], disc: 0, discCol: 0xdfe6f5, discPos: [70, 45], hemiSky: 0x7084c4, hemiGnd: 0x2c3040, hemiInt: 1.5, fill: 0.9,
      facEm: 1.0, shopEm: 1.0, lampOn: 0.85, lampCol: 0xffd9a0, road: [1.35, 1.38, 1.5], walk: [1.4, 1.42, 1.55], ground: 0x2a2c34, groundY: -0.05,
      bld: 0.8, bldTint: 0xc4cce0, sky: 1, skyTint: 0xc4cce0, shops: 1, lamps: 1, park: 0.8, stars: 0.8, rain: 0, props: { toll: 1, palm: 0.3 } },
    { id: 'st04', name: 'Ikeja Market', sub: 'Midday rush, mind the crowd',
      zen: 0x5b93cc, mid: 0xb4d0e2, hor: 0xf0e2bc, fog: 0xd8c9a6, fogNear: 45, fogFar: 170, glow: 0.3,
      sunCol: 0xfff0d0, sunInt: 2.6, sun: [8, 34, 16], disc: 0.55, discCol: 0xfff4dc, discPos: [40, 50], hemiSky: 0xb0b8c0, hemiGnd: 0x6a5a48, hemiInt: 1.3, fill: 0.7,
      facEm: 0.08, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.02, 0.98, 0.92], walk: [1.1, 1.0, 0.9], ground: 0x6a5a48, groundY: -0.05,
      bld: 0.7, bldTint: 0xf0d8b8, sky: 0.6, skyTint: 0xf0d8b8, shops: 1, lamps: 1, park: 1, stars: 0, rain: 0, props: { stallA: 1, stallB: 1, palm: 0.35 } },
    { id: 'st05', name: 'Abuja Boulevard', sub: 'Clean roads, clear morning',
      zen: 0x2f73d0, mid: 0x86b6e4, hor: 0xe4f0f8, fog: 0xc4d4e0, fogNear: 50, fogFar: 200, glow: 0.2,
      sunCol: 0xfff4e0, sunInt: 2.4, sun: [14, 30, 20], disc: 0.8, discCol: 0xfff6e4, discPos: [60, 40], hemiSky: 0xa8c4e8, hemiGnd: 0x4a5a4a, hemiInt: 1.25, fill: 0.7,
      facEm: 0.05, shopEm: 0.3, lampOn: 0, lampCol: 0xffe8c0, road: [1.1, 1.1, 1.12], walk: [1.15, 1.15, 1.15], ground: 0x4a5a44, groundY: -0.05,
      bld: 1.15, bldTint: 0xe8e4d8, sky: 1.1, skyTint: 0xe8e4d8, shops: 0, lamps: 1, park: 0.6, stars: 0, rain: 0, props: { tree: 1, flag: 1 } },
    { id: 'st06', name: 'Harbour Docks', sub: 'Apapa container terminal',
      zen: 0x5d7a96, mid: 0x9db4c4, hor: 0xd6dcd6, fog: 0xb4bcc0, fogNear: 30, fogFar: 170, glow: 0.1,
      sunCol: 0xdde4ea, sunInt: 2.0, sun: [-10, 26, 18], disc: 0.15, discCol: 0xe8ecef, discPos: [-60, 36], hemiSky: 0xa8b8c8, hemiGnd: 0x3a3c3e, hemiInt: 1.4, fill: 0.8,
      facEm: 0.18, shopEm: 0.3, lampOn: 0.3, lampCol: 0xffe0b0, road: [1.1, 1.12, 1.14], walk: [1.1, 1.12, 1.14], ground: 0x424a50, groundY: -0.05,
      bld: 0.42, bldTint: 0xb4bcc0, sky: 0.5, skyTint: 0xb4bcc0, shops: 0, lamps: 1, park: 0.3, stars: 0, rain: 0, props: { container: 1, crane: 1 } },
    { id: 'st07', name: 'Desert Highway', sub: 'Northern road, no shade',
      zen: 0x4d86c0, mid: 0xcfd6d4, hor: 0xf2dcb0, fog: 0xe4cfa4, fogNear: 60, fogFar: 230, glow: 0.4,
      sunCol: 0xfff0c8, sunInt: 2.9, sun: [6, 38, 10], disc: 0.95, discCol: 0xfff6dc, discPos: [30, 60], hemiSky: 0xc8d0d8, hemiGnd: 0x8a7452, hemiInt: 1.4, fill: 0.6,
      facEm: 0, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.18, 1.12, 1.02], walk: [1.5, 1.3, 1.0], ground: 0xc9a874, groundY: -0.15,
      bld: 0, bldTint: 0xd8c8a0, sky: 0, skyTint: 0xd8c8a0, shops: 0, lamps: 0, park: 0, stars: 0, rain: 0, props: { pole: 1, rock: 1, scrub: 1 } },
    { id: 'st08', name: 'Rainy Industrial Zone', sub: 'Wet roads, factory lights',
      zen: 0x3a4a58, mid: 0x667a88, hor: 0x9aaab0, fog: 0x6e7e86, fogNear: 22, fogFar: 140, glow: 0,
      sunCol: 0x9fb0b8, sunInt: 1.5, sun: [0, 30, 10], disc: 0, discCol: 0xdde4ea, discPos: [0, 40], hemiSky: 0x8fa4b0, hemiGnd: 0x20262a, hemiInt: 1.3, fill: 0.8,
      facEm: 0.55, shopEm: 0.5, lampOn: 0.8, lampCol: 0xffd9a0, road: [0.95, 1.0, 1.06], walk: [1.0, 1.02, 1.08], ground: 0x30363a, groundY: -0.05,
      bld: 0.5, bldTint: 0xa4b0b8, sky: 0.5, skyTint: 0x8c989e, shops: 0, lamps: 1, park: 0.4, stars: 0, rain: 1, props: { tank: 1, chimney: 1 } },
    { id: 'st09', name: 'Savanna Sunset', sub: 'Open road, long shadows',
      zen: 0x6a5a9a, mid: 0xe0805a, hor: 0xffb85a, fog: 0xe49a60, fogNear: 45, fogFar: 200, glow: 1.1,
      sunCol: 0xff8c3a, sunInt: 2.6, sun: [-26, 10, 22], disc: 1, discCol: 0xffb050, discPos: [-95, 12], hemiSky: 0xe0a07a, hemiGnd: 0x4a3a30, hemiInt: 1.4, fill: 0.7,
      facEm: 0, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.1, 1.0, 0.92], walk: [1.25, 1.05, 0.8], ground: 0x7a6a3a, groundY: -0.1,
      bld: 0, bldTint: 0xc8a070, sky: 0, skyTint: 0xc8a070, shops: 0, lamps: 0, park: 0, stars: 0.1, rain: 0, props: { acacia: 1, baobab: 0.5, grass: 1 } },
    { id: 'st10', name: 'Victoria Island', sub: 'Skyline at midnight',
      zen: 0x0f1c40, mid: 0x2a4278, hor: 0x5a78b0, fog: 0x2a3c6a, fogNear: 35, fogFar: 190, glow: 0,
      sunCol: 0x8ea6e0, sunInt: 1.4, sun: [12, 38, 18], disc: 0.35, discCol: 0xdfe6f5, discPos: [70, 45], hemiSky: 0x6a80c0, hemiGnd: 0x1c2030, hemiInt: 1.45, fill: 0.85,
      facEm: 1.3, shopEm: 1.1, lampOn: 0.9, lampCol: 0xffd9a0, road: [1.3, 1.35, 1.5], walk: [1.3, 1.35, 1.5], ground: 0x22262e, groundY: -0.05,
      bld: 1.5, bldTint: 0xb4c4e8, sky: 1.7, skyTint: 0xb4c4e8, shops: 1, lamps: 1, park: 1, stars: 1, rain: 0, props: { palm: 0.7 } }
  ];
  global.STAGES = STAGES;
  global.STAGE_TIME = stageTime;
  global.stageAt = t => Math.floor(Math.max(0, t) / stageTime) % STAGES.length;
})(window);
