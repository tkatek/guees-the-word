/*
 * extract-ui-sprites.js — BUILD-TIME: cuts the individual UI sprites out of the
 * approved pack images, preserving transparency:
 *   undo.png  <- 20_12_57-6.png  (single purple pill, baked "Undo" text)
 *   clear.png <- 20_12_59-7.png  (single red pill)
 *   hint.png  <- 20_13_02-8.png  (single yellow pill)
 *   pause.png <- 20_13_03-9.png  LEFT cluster  (orange pause button)
 *   slot.png  <- 20_13_03-9.png  RIGHT cluster (cream/gold answer placeholder)
 * Run:  node tools/extract-ui-sprites.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, encodePng, crop, alphaBBox } = require('./png-tools.js');

const ROOT = path.join(__dirname, '..');
const PACK = path.join(ROOT, 'tests', '_pack_preview');
const OUT = path.join(ROOT, 'assets', 'art');

function pack(n) { return path.join(PACK, 'Image ChatGPT 31 oct. 2026, ' + n + '.png'); }

function saveTrim(file, outFile) {
  const img = decodePng(file);
  const b = alphaBBox(img, 10);
  const c = crop(img, b.x, b.y, b.w, b.h);
  encodePng(c, outFile);
  console.log('  ' + path.relative(ROOT, outFile), c.width + 'x' + c.height, 'ratio', (c.width / c.height).toFixed(2));
}

console.log('Extracting UI sprites...');
saveTrim(pack('20_12_57-6'), path.join(OUT, 'btn-undo.png'));
saveTrim(pack('20_12_59-7'), path.join(OUT, 'btn-clear.png'));
saveTrim(pack('20_13_02-8'), path.join(OUT, 'btn-hint.png'));

// image 9: two sprites side by side — split at the transparent gap
const img9 = decodePng(pack('20_13_03-9'));
const W = img9.width, H = img9.height, d = img9.data;
const colA = new Array(W).fill(0);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y += 3) colA[x] += d[(y * W + x) * 4 + 3] > 60 ? 1 : 0;
let runs = [], run = null;
for (let x = 0; x < W; x++) {
  if (colA[x] > 2) { if (!run) run = { x0: x, x1: x }; else run.x1 = x; }
  else if (run) { if (run.x1 - run.x0 > 30) runs.push(run); run = null; }
}
if (run) runs.push(run);
if (runs.length !== 2) throw new Error('expected 2 sprites in image 9, got ' + runs.length);
[['btn-pause.png', runs[0]], ['slot.png', runs[1]]].forEach(([name, r]) => {
  const c = crop(img9, r.x0, 0, r.x1 - r.x0 + 1, H);
  const b = alphaBBox(c, 10);
  const t = crop(c, b.x, b.y, b.w, b.h);
  encodePng(t, path.join(OUT, name));
  console.log('  assets/art/' + name, t.width + 'x' + t.height, 'ratio', (t.width / t.height).toFixed(2));
});
console.log('Done.');
