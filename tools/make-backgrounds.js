/*
 * make-backgrounds.js — BUILD-TIME: derives clean classroom backgrounds from the
 * user's approved desktop (1672x941) and phone (941x1672) mockups by erasing the
 * baked-in game UI (board column + everything below it) and re-filling each row
 * from clean wall/floor pixels beside the erased zone (mirror-tiling keeps the
 * wood planks and wall gradient continuous).
 * Run:  node tools/make-backgrounds.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, encodePng } = require('./png-tools.js');

const ROOT = path.join(__dirname, '..');
const PACK = path.join(ROOT, 'tests', '_pack_preview');

function makeBg(srcFile, outFile, greenBox) {
  const img = decodePng(srcFile);
  const { width: W, height: H, data: d } = img;

  // 1) locate the chalkboard: greenish pixels in the central band
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = Math.floor(W * 0.2); x < Math.floor(W * 0.8); x++) {
      const o = (y * W + x) * 4;
      const r = d[o], g = d[o + 1], b = d[o + 2];
      if (g > 70 && g < 190 && g > r + 25 && g > b + 25 && d[o + 3] > 200) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0) throw new Error('no board found in ' + srcFile);
  console.log('  board bbox in ' + path.basename(srcFile) + ': ' + (x1 - x0) + 'x' + (y1 - y0) +
    ' at (' + x0 + ',' + y0 + ')');

  // 2) erase the UI column: the board plus everything below it (slots/tiles/
  //    buttons/progress rows can be WIDER than the board), so erase at least
  //    the central 76% of the image width, from just above the board to the bottom.
  const ex0 = Math.max(0, Math.min(x0 - 40, Math.floor(W * 0.12)));
  const ex1 = Math.min(W - 1, Math.max(x1 + 40, Math.floor(W * 0.88)));
  const ey0 = Math.max(0, y0 - 16);
  const ew = ex1 - ex0 + 1;

  // 3) mirror-tile fill: source strip sits to the LEFT of the erased zone
  //    (or right when there is more room), 64px wide.
  const stripW = Math.min(64, ex0);
  const stripX = ex0 - stripW; // >= 0
  for (let y = ey0; y < H; y++) {
    for (let x = ex0; x <= ex1; x++) {
      const k = (x - ex0) % (stripW * 2);
      const sx = stripX + (k < stripW ? k : stripW * 2 - 1 - k); // mirrored tiling
      const so = (y * W + sx) * 4, o = (y * W + x) * 4;
      d[o] = d[so]; d[o + 1] = d[so + 1]; d[o + 2] = d[so + 2]; d[o + 3] = 255;
    }
  }

  const bytes = encodePng(img, outFile);
  console.log('  wrote ' + path.relative(ROOT, outFile) + ' (' + (bytes / 1024).toFixed(0) + 'KB)');
}

console.log('Building clean backgrounds from approved mockups...');
makeBg(path.join(PACK, 'Image ChatGPT 31 oct. 2026, 20_12_51-1.png'),
       path.join(ROOT, 'assets', 'art', 'bg-desktop.png'));
makeBg(path.join(PACK, 'Image ChatGPT 31 oct. 2026, 20_12_52-2.png'),
       path.join(ROOT, 'assets', 'art', 'bg-phone.png'));
console.log('Done.');
