/*
 * extract-art.js — BUILD-TIME script: cuts the approved UI art out of the
 * user's uploaded asset pack (tests/_pack_preview/*.png) into assets/art/.
 * Run:  node tools/extract-art.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { decodePng, encodePng, crop, alphaBBox, columnClusters } = require('./png-tools.js');

const ROOT = path.join(__dirname, '..');
const PACK = path.join(ROOT, 'tests', '_pack_preview');
const OUT = path.join(ROOT, 'assets', 'art');
fs.mkdirSync(OUT, { recursive: true });

function packName(n) {
  return path.join(PACK, 'Image ChatGPT 31 oct. 2026, ' + n + '.png');
}
function saveTrimmed(srcFile, outFile, pad) {
  const img = decodePng(srcFile);
  const box = alphaBBox(img);
  if (!box) throw new Error('fully transparent: ' + srcFile);
  const p = pad || 0;
  const x = Math.max(0, box.x - p), y = Math.max(0, box.y - p);
  const w = Math.min(img.width - x, box.w + p * 2), h = Math.min(img.height - y, box.h + p * 2);
  const bytes = encodePng(crop(img, x, y, w, h), outFile);
  console.log('  ' + path.relative(ROOT, outFile), w + 'x' + h, (bytes / 1024).toFixed(0) + 'KB');
  return { x, y, w, h };
}

console.log('Extracting approved art from asset pack...');

// Cell 3 = clean transparent chalkboard.
saveTrimmed(packName('20_12_53-3'), path.join(OUT, 'board.png'), 2);

// Cell 5 = empty 4-slot wooden progress board.
const prog = saveTrimmed(packName('20_12_56-5'), path.join(OUT, 'progress.png'), 2);

// Progress slot centers: detect the dark inset circles inside progress.png so the
// renderer can overlay checkmarks at the right positions without magic numbers.
const progImg = decodePng(path.join(OUT, 'progress.png'));
(function () {
  const w = progImg.width, h = progImg.height, d = progImg.data;
  const colDark = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y++) {
      const o = (y * w + x) * 4;
      const lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      if (d[o + 3] > 200 && lum < 90) colDark[x]++;
    }
  }
  const runs = [];
  let run = null;
  for (let x = 0; x < w; x++) {
    if (colDark[x] > h * 0.08) { if (!run) run = { x0: x, x1: x }; else run.x1 = x; }
    else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  const centers = runs.map(function (r) { return (r.x0 + r.x1) / 2 / w; });
  console.log('  progress slot centers (fraction of width): ' + centers.map(function (c) { return c.toFixed(3); }).join(', '));
  fs.writeFileSync(path.join(OUT, 'progress-slots.json'), JSON.stringify({ centers: centers, slotTop: 0.5 }, null, 2));
})();

console.log('Done.');
