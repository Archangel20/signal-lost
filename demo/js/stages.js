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
      zen: 0x4f7aa8, mid: 0xa7b8c6, hor: 0xf0c48a, fog: 0xcdb08c, fogNear: 40, fogFar: 190, glow: 0.85,
      sunCol: 0xffd9a0, sunInt: 2.3, sun: [-22, 24, 24], disc: 0.9, discCol: 0xffe2b0, discPos: [-105, 28], hemiSky: 0x9fb0c8, hemiGnd: 0x5a4a3c, hemiInt: 1.15, fill: 0.7,
      facEm: 0.1, shopEm: 0.45, lampOn: 0.0, lampCol: 0xffe0a8, road: [1, 1, 1], walk: [1, 1, 1], ground: 0x4a4a48, groundY: -0.05,
      bld: 1, bldTint: 0xffffff, sky: 1, skyTint: 0xffffff, shops: 1, lamps: 1, park: 1, stars: 0, rain: 0, props: { palm: 1 } },
    { id: 'st02', name: 'Third Mainland Bridge', sub: 'Dusk over the lagoon',
      zen: 0x2c3558, mid: 0x8a6a7e, hor: 0xe88e5a, fog: 0xa87a68, fogNear: 35, fogFar: 200, glow: 1,
      sunCol: 0xff9a5a, sunInt: 1.7, sun: [-22, 14, 24], disc: 0.95, discCol: 0xffb070, discPos: [-110, 12], hemiSky: 0x7d7fa0, hemiGnd: 0x3a3038, hemiInt: 1.0, fill: 0.6,
      facEm: 0.35, shopEm: 0.6, lampOn: 0.55, lampCol: 0xffd9a0, road: [0.95, 0.93, 0.95], walk: [0.95, 0.95, 0.98], ground: 0x2a3b52, groundY: -6,
      bld: 0, bldTint: 0xc8b8c0, sky: 0.4, skyTint: 0xb8a0b0, shops: 0, lamps: 1, park: 0, stars: 0.25, rain: 0, props: { rail: 1, pylon: 1 } },
    { id: 'st03', name: 'Lekki Toll Gate', sub: 'Night shift, VIP lane open',
      zen: 0x070c18, mid: 0x131c34, hor: 0x2a3552, fog: 0x151c2c, fogNear: 30, fogFar: 170, glow: 0,
      sunCol: 0x7d93c9, sunInt: 0.6, sun: [12, 38, 18], disc: 0, discCol: 0xdfe6f5, discPos: [70, 45], hemiSky: 0x34406a, hemiGnd: 0x15161c, hemiInt: 0.75, fill: 0.55,
      facEm: 1.0, shopEm: 1.0, lampOn: 0.85, lampCol: 0xffd9a0, road: [0.9, 0.92, 1], walk: [0.9, 0.92, 1], ground: 0x1b1c20, groundY: -0.05,
      bld: 0.8, bldTint: 0x9aa4b8, sky: 1, skyTint: 0x9aa4b8, shops: 1, lamps: 1, park: 0.8, stars: 0.8, rain: 0, props: { toll: 1, palm: 0.3 } },
    { id: 'st04', name: 'Ikeja Market', sub: 'Midday rush, mind the crowd',
      zen: 0x7fa0bf, mid: 0xc9c8bd, hor: 0xe9d9b6, fog: 0xd8c9a6, fogNear: 45, fogFar: 170, glow: 0.3,
      sunCol: 0xfff0d0, sunInt: 2.6, sun: [8, 34, 16], disc: 0.55, discCol: 0xfff4dc, discPos: [40, 50], hemiSky: 0xb0b8c0, hemiGnd: 0x6a5a48, hemiInt: 1.3, fill: 0.7,
      facEm: 0.08, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.02, 0.98, 0.92], walk: [1.1, 1.0, 0.9], ground: 0x6a5a48, groundY: -0.05,
      bld: 0.7, bldTint: 0xf0d8b8, sky: 0.6, skyTint: 0xf0d8b8, shops: 1, lamps: 1, park: 1, stars: 0, rain: 0, props: { stallA: 1, stallB: 1, palm: 0.35 } },
    { id: 'st05', name: 'Abuja Boulevard', sub: 'Clean roads, clear morning',
      zen: 0x3f78c4, mid: 0x8fb4d8, hor: 0xdfeaf0, fog: 0xc4d4e0, fogNear: 50, fogFar: 200, glow: 0.2,
      sunCol: 0xfff4e0, sunInt: 2.4, sun: [14, 30, 20], disc: 0.8, discCol: 0xfff6e4, discPos: [60, 40], hemiSky: 0xa8c4e8, hemiGnd: 0x4a5a4a, hemiInt: 1.25, fill: 0.7,
      facEm: 0.05, shopEm: 0.3, lampOn: 0, lampCol: 0xffe8c0, road: [1.1, 1.1, 1.12], walk: [1.15, 1.15, 1.15], ground: 0x4a5a44, groundY: -0.05,
      bld: 1.15, bldTint: 0xe8e4d8, sky: 1.1, skyTint: 0xe8e4d8, shops: 0, lamps: 1, park: 0.6, stars: 0, rain: 0, props: { tree: 1, flag: 1 } },
    { id: 'st06', name: 'Harbour Docks', sub: 'Apapa container terminal',
      zen: 0x4a5560, mid: 0x7c868c, hor: 0xb4b8b0, fog: 0x8e9498, fogNear: 30, fogFar: 170, glow: 0.1,
      sunCol: 0xdde4ea, sunInt: 1.25, sun: [-10, 26, 18], disc: 0.15, discCol: 0xe8ecef, discPos: [-60, 36], hemiSky: 0x8a96a2, hemiGnd: 0x3a3c3e, hemiInt: 1.05, fill: 0.6,
      facEm: 0.18, shopEm: 0.3, lampOn: 0.3, lampCol: 0xffe0b0, road: [0.92, 0.94, 0.96], walk: [0.9, 0.92, 0.95], ground: 0x424a50, groundY: -0.05,
      bld: 0.42, bldTint: 0x8c9094, sky: 0.5, skyTint: 0x8c9094, shops: 0, lamps: 1, park: 0.3, stars: 0, rain: 0, props: { container: 1, crane: 1 } },
    { id: 'st07', name: 'Desert Highway', sub: 'Northern road, no shade',
      zen: 0x4d86c0, mid: 0xcfd6d4, hor: 0xf2dcb0, fog: 0xe4cfa4, fogNear: 60, fogFar: 230, glow: 0.4,
      sunCol: 0xfff0c8, sunInt: 2.9, sun: [6, 38, 10], disc: 0.95, discCol: 0xfff6dc, discPos: [30, 60], hemiSky: 0xc8d0d8, hemiGnd: 0x8a7452, hemiInt: 1.4, fill: 0.6,
      facEm: 0, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.18, 1.12, 1.02], walk: [1.5, 1.3, 1.0], ground: 0xc9a874, groundY: -0.15,
      bld: 0, bldTint: 0xd8c8a0, sky: 0, skyTint: 0xd8c8a0, shops: 0, lamps: 0, park: 0, stars: 0, rain: 0, props: { pole: 1, rock: 1, scrub: 1 } },
    { id: 'st08', name: 'Rainy Industrial Zone', sub: 'Wet roads, factory lights',
      zen: 0x1f272d, mid: 0x3a444a, hor: 0x5a666a, fog: 0x434c52, fogNear: 18, fogFar: 125, glow: 0,
      sunCol: 0x9fb0b8, sunInt: 0.75, sun: [0, 30, 10], disc: 0, discCol: 0xdde4ea, discPos: [0, 40], hemiSky: 0x5f7078, hemiGnd: 0x20262a, hemiInt: 0.85, fill: 0.5,
      facEm: 0.55, shopEm: 0.5, lampOn: 0.8, lampCol: 0xffd9a0, road: [0.62, 0.66, 0.7], walk: [0.7, 0.72, 0.75], ground: 0x24282a, groundY: -0.05,
      bld: 0.5, bldTint: 0x6f777c, sky: 0.5, skyTint: 0x5f686c, shops: 0, lamps: 1, park: 0.4, stars: 0, rain: 1, props: { tank: 1, chimney: 1 } },
    { id: 'st09', name: 'Savanna Sunset', sub: 'Open road, long shadows',
      zen: 0x4a3a6a, mid: 0xc4705a, hor: 0xf4a548, fog: 0xd28a58, fogNear: 45, fogFar: 200, glow: 1.1,
      sunCol: 0xff8c3a, sunInt: 2.1, sun: [-26, 10, 22], disc: 1, discCol: 0xffb050, discPos: [-95, 12], hemiSky: 0xc88a6a, hemiGnd: 0x4a3a30, hemiInt: 1.0, fill: 0.5,
      facEm: 0, shopEm: 0.3, lampOn: 0, lampCol: 0xffe0a8, road: [1.0, 0.92, 0.85], walk: [1.25, 1.05, 0.8], ground: 0x7a6a3a, groundY: -0.1,
      bld: 0, bldTint: 0xc8a070, sky: 0, skyTint: 0xc8a070, shops: 0, lamps: 0, park: 0, stars: 0.1, rain: 0, props: { acacia: 1, baobab: 0.5, grass: 1 } },
    { id: 'st10', name: 'Victoria Island', sub: 'Skyline at midnight',
      zen: 0x03060f, mid: 0x0b1226, hor: 0x1d2a4a, fog: 0x0c1426, fogNear: 35, fogFar: 190, glow: 0,
      sunCol: 0x6f86c0, sunInt: 0.55, sun: [12, 38, 18], disc: 0.35, discCol: 0xdfe6f5, discPos: [70, 45], hemiSky: 0x28345c, hemiGnd: 0x0c0e14, hemiInt: 0.65, fill: 0.5,
      facEm: 1.3, shopEm: 1.1, lampOn: 0.9, lampCol: 0xffd9a0, road: [0.85, 0.88, 1], walk: [0.85, 0.88, 1], ground: 0x14161c, groundY: -0.05,
      bld: 1.5, bldTint: 0x8fa0c4, sky: 1.7, skyTint: 0x8fa0c4, shops: 1, lamps: 1, park: 1, stars: 1, rain: 0, props: { palm: 0.7 } }
  ];
  global.STAGES = STAGES;
  global.STAGE_TIME = stageTime;
  global.stageAt = t => Math.floor(Math.max(0, t) / stageTime) % STAGES.length;
})(window);
