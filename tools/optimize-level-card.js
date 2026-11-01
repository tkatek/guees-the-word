/*
 * optimize-level-card.js — BUILD TIME ONLY (not loaded by the game).
 * 1. Analyzes assets/art/level-card.png: transparent padding, plaque box,
 *    cream interior, bottom leaf zones — so CSS can align dynamic text to the
 *    visible artwork instead of the outer transparent canvas.
 * 2. Crops the transparent margin and area-resamples (premultiplied alpha,
 *    no halos) to a 768px-wide UI copy: assets/art/level-card-ui.png.
 * Run: node tools/optimize-level-card.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, encodePng, crop, alphaBBox } = require('./png-tools.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'art', 'level-card.png');
const OUT = path.join(ROOT, 'assets', 'art', 'level-card-ui.png');
const TARGET_W = 768; // max on-screen card ~340px => 2.2x DPR covered

const img = decodePng(SRC);

function px(im, x, y) {
  const o = (y * im.width + x) * 4;
  return [im.data[o], im.data[o + 1], im.data[o + 2], im.data[o + 3]];
}
const opaque = (p) => p[3] >= 40;
// cream card interior (~#f9efdc); excludes the white frame gloss (g-b ~ 0)
const cream = (p) => p[3] >= 40 && p[0] >= 222 && p[1] >= 205 && p[2] >= 168 &&
  (p[0] - p[2]) >= 20 && (p[0] - p[1]) <= 45 && (p[1] - p[2]) >= 4;
// green leaves
const green = (p) => p[3] >= 40 && p[1] >= 95 && p[1] > p[0] + 18 && p[1] > p[2] + 18;

console.log('source:', img.width + 'x' + img.height, fs.statSync(SRC).size + ' bytes');
[4, 12, 32].forEach((t) => {
  const b = alphaBBox(img, t);
  console.log('  alpha bbox @' + t + ':', JSON.stringify(b));
});

const bbox = alphaBBox(img, 6);
const art = crop(img, bbox.x, bbox.y, bbox.w, bbox.h);
const W = art.width, H = art.height;
const pctX = (v) => +((v / W) * 100).toFixed(2);
const pctY = (v) => +((v / H) * 100).toFixed(2);

// ---- plaque box (top wooden plaque) -------------------------------------
const cx = Math.floor(W / 2);
let yTop = 0;
while (yTop < H && !opaque(px(art, cx, yTop))) yTop++;
let yBot = yTop;
while (yBot < H && !cream(px(art, cx, yBot)) && !green(px(art, cx, yBot))) yBot++;
const yMid = Math.round((yTop + yBot) / 2);
let xL = cx;
while (xL > 0 && opaque(px(art, xL - 1, yMid)) && !cream(px(art, xL - 1, yMid)) && !green(px(art, xL - 1, yMid))) xL--;
let xR = cx;
while (xR < W - 1 && opaque(px(art, xR + 1, yMid)) && !cream(px(art, xR + 1, yMid)) && !green(px(art, xR + 1, yMid))) xR++;

// ---- cream interior ------------------------------------------------------
let cTop = yBot;
while (cTop < H && !cream(px(art, cx, cTop))) cTop++;
let cBot = cTop;
while (cBot < H && cream(px(art, cx, cBot))) cBot++;
const rowRun = (y) => {
  let l = cx, r = cx;
  while (l > 0 && cream(px(art, l - 1, y))) l--;
  while (r < W - 1 && cream(px(art, r + 1, y))) r++;
  return [l, r];
};
const yMidCream = Math.round((cTop + cBot) / 2);
const [cL, cR] = rowRun(yMidCream);
const yName = cTop + Math.round((cBot - cTop) * 0.2);
const yStar = cTop + Math.round((cBot - cTop) * 0.82);
const [nameL, nameR] = rowRun(yName);
const [starL, starR] = rowRun(yStar);

// ---- bottom leaf clusters (green pixels below mid-height) ----------------
let leafLmax = 0, leafRmin = W;
for (let y = Math.floor(H * 0.5); y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (green(px(art, x, y))) {
      if (x < W / 2) { if (x > leafLmax) leafLmax = x; }
      else { if (x < leafRmin) leafRmin = x; }
    }
  }
}

const report = {
  cropped: { w: W, h: H, aspect: +(W / H).toFixed(4) },
  plaque: {
    left: pctX(xL), right: pctX(xR), top: pctY(yTop), bottom: pctY(yBot),
    centerXPct: pctX((xL + xR) / 2), centerYPct: pctY((yTop + yBot) / 2),
    widthPct: +(pctX(xR) - pctX(xL)).toFixed(2), heightPct: +(pctY(yBot) - pctY(yTop)).toFixed(2)
  },
  cream: { left: pctX(cL), right: pctX(cR), top: pctY(cTop), bottom: pctY(cBot) },
  nameRow: { left: pctX(nameL), right: pctX(nameR), y: pctY(yName) },
  starRow: { left: pctX(starL), right: pctX(starR), y: pctY(yStar) },
  bottomLeaves: { leftClusterMaxXPct: pctX(leafLmax), rightClusterMinXPct: pctX(leafRmin) }
};
console.log('\ngeometry (% of cropped art):');
console.log(JSON.stringify(report, null, 2));

// ---- area resample to TARGET_W (premultiplied alpha) ---------------------
function resample(src, targetW) {
  const scale = src.width / targetW;
  const targetH = Math.max(1, Math.round(src.height / scale));
  const out = Buffer.alloc(targetW * targetH * 4);
  for (let oy = 0; oy < targetH; oy++) {
    const sy0 = oy * scale, sy1 = Math.min(src.height, sy0 + scale);
    for (let ox = 0; ox < targetW; ox++) {
      const sx0 = ox * scale, sx1 = Math.min(src.width, sx0 + scale);
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          const o = (sy * src.width + sx) * 4;
          const al = src.data[o + 3];
          const aw = wgt * al;
          r += src.data[o] * aw;
          g += src.data[o + 1] * aw;
          b += src.data[o + 2] * aw;
          a += aw;
          area += wgt;
        }
      }
      const o = (oy * targetW + ox) * 4;
      if (a <= 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / area);
    }
  }
  return { width: targetW, height: targetH, data: out };
}

const small = resample(art, TARGET_W);
const bytes = encodePng(small, OUT);
console.log('\nwrote', path.relative(ROOT, OUT), small.width + 'x' + small.height, bytes + ' bytes',
  '(' + Math.round((1 - bytes / fs.statSync(SRC).size) * 100) + '% smaller than source)');
