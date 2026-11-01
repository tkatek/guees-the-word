/*
 * crop-buttons.js — BUILD-TIME: splits the approved 4-button strip
 * (Undo / Clear / Hint / Pause, touching white borders) into individual
 * transparent PNGs. Seams = narrow near-white vertical bands between buttons.
 * Run:  node tools/crop-buttons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, encodePng, crop, alphaBBox } = require('./png-tools.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tests', '_pack_preview', 'Image ChatGPT 31 oct. 2026, 20_13_02-8.png');
const OUT = path.join(ROOT, 'assets', 'art');

const img = decodePng(SRC);
const box = alphaBBox(img);
const s = crop(img, box.x, box.y, box.w, box.h);
const W = s.width, H = s.height, d = s.data;

// "whiteness" per column: fraction of pixels in the middle band that are near-white
const y0 = Math.floor(H * 0.30), y1 = Math.floor(H * 0.70);
const white = new Array(W).fill(0);
for (let x = 0; x < W; x++) {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const o = (y * W + x) * 4;
    if (d[o] > 225 && d[o + 1] > 225 && d[o + 2] > 225 && d[o + 3] > 200) n++;
  }
  white[x] = n / (y1 - y0);
}

// find interior white seams: runs of width 3..40 where whiteness > 0.8, between 15%..85% width
const seams = [];
let run = null;
for (let x = Math.floor(W * 0.15); x < Math.floor(W * 0.85); x++) {
  if (white[x] > 0.8) {
    if (!run) run = { x0: x, x1: x }; else run.x1 = x;
  } else if (run) {
    const w = run.x1 - run.x0 + 1;
    if (w >= 3 && w <= 48) seams.push(Math.round((run.x0 + run.x1) / 2));
    run = null;
  }
}
console.log('seams found at x =', seams.join(', '), 'of', W);
if (seams.length !== 3) throw new Error('expected 3 seams, got ' + seams.length);

const cuts = [0].concat(seams, [W]);
const names = ['btn-undo', 'btn-clear', 'btn-hint', 'btn-pause'];
for (let i = 0; i < 4; i++) {
  const a = cuts[i], b = cuts[i + 1];
  let minX = b, maxX = a;
  for (let x = a; x < b; x++) {
    for (let y = 0; y < H; y += 2) {
      if (d[(y * W + x) * 4 + 3] > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; break; }
    }
  }
  const btn = crop(s, minX, 0, maxX - minX + 1, H);
  // trim vertical margins too
  let top = H, bottom = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < btn.width; x += 2) {
      if (btn.data[(y * btn.width + x) * 4 + 3] > 30) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
    }
  }
  const finalBtn = crop(btn, 0, top, btn.width, bottom - top + 1);
  const file = path.join(OUT, names[i] + '.png');
  encodePng(finalBtn, file);
  console.log('  ' + names[i] + '.png', finalBtn.width + 'x' + finalBtn.height);
}
console.log('Done.');
