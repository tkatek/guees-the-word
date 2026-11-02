/*
 * make-home-art.js — build-time asset preparation for the redesigned home
 * screen, from the user's ORIGINAL reference files (never modified):
 *
 *  1. assets/art/logo.png
 *     The wooden "GUESS THE ANIMAL" sign ships with a near-binary alpha
 *     channel (0-3 or 249-254 — an optimizer artifact). Re-binarize so every
 *     visible pixel is fully opaque (a=253 renders as translucent over the
 *     classroom wall), then trim the transparent margins.
 *
 *  2. assets/art/hero-animals.png
 *     The five animals + wooden PLAY sign arrives on an opaque white square.
 *     Remove ONLY the external white background:
 *       - flood-fill near-white pixels from the image borders (the panda's
 *         fur / rabbit / eye highlights are enclosed by outlines, so the
 *         fill never reaches them);
 *       - decontaminate the 1-2px anti-aliased fringe: estimate per-pixel
 *         coverage against the nearest solid content color and un-blend the
 *         white out of it (no white halos, no chewed edges);
 *       - trim to the content bounding box.
 *
 *  3. Prints the green PLAY pill's bbox as percentages of the trimmed hero,
 *     used by css/style.css to keep the invisible interactive button locked
 *     to the artwork at every scale.
 *
 * Run: node tools/make-home-art.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { decodePng, encodePngFiltered, alphaBBox } = require('./png-tools');

const REFS = path.join(__dirname, 'refs');
const ART = path.join(__dirname, '..', 'assets', 'art');

/* ---------------- 1. logo ---------------- */
function buildLogo() {
  const img = decodePng(path.join(REFS, 'ref2.png'));
  const n = img.width * img.height;
  let semi = 0;
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3];
    if (a >= 128) {
      if (a < 255) semi++;
      img.data[i * 4 + 3] = 255;      // 249-254 optimizer alpha -> solid
    } else {
      img.data[i * 4 + 3] = 0;
    }
  }
  const bbox = alphaBBox(img, 8);
  const out = cropImg(img, bbox.x, bbox.y, bbox.w, bbox.h);
  const size = encodePngFiltered(out, path.join(ART, 'logo.png'));
  console.log('logo.png            ' + out.width + 'x' + out.height +
    '  ' + (size / 1024).toFixed(0) + ' KB  (re-binarized ' + semi + ' soft px)');
  return out;
}

/* ---------------- 2. hero (white removal) ---------------- */

function isBgWhite(r, g, b) {
  // near-white with low chroma: pure white bg + its AA blend toward outlines
  return r >= 232 && g >= 232 && b >= 232 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 14;
}

function buildHero() {
  const img = decodePng(path.join(REFS, 'ref-play-art.png'));
  const W = img.width, H = img.height;
  const d = img.data;
  const bg = new Uint8Array(W * H);        // 1 = external white background

  // flood fill from every border pixel that is near-white
  const queue = new Int32Array(W * H);
  let qh = 0, qt = 0;
  function push(x, y) {
    const p = y * W + x;
    if (bg[p]) return;
    const o = p * 4;
    if (!isBgWhite(d[o], d[o + 1], d[o + 2])) return;
    bg[p] = 1;
    queue[qt++] = p;
  }
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  const solid = new Uint8Array(W * H);     // 1 = keep, fully opaque
  for (let p = 0; p < W * H; p++) solid[p] = bg[p] ? 0 : 1;

  // nearest solid color for fringe estimation (small fixed radius search)
  function nearestSolid(x, y, radius) {
    for (let r = 1; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (solid[ny * W + nx]) {
            const o = (ny * W + nx) * 4;
            return [d[o], d[o + 1], d[o + 2]];
          }
        }
      }
    }
    return null;
  }

  // Coverage of a fringe pixel: how far it drifted from white toward the
  // nearest solid color, i.e. alpha = maxChan |C-255| / maxChan |F-255|.
  const FRINGE_DEPTH = 2;   // decontaminate 2px on each side of the edge
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = solid[p] ? 1 : 0;

  const edits = [];
  for (let pass = 0; pass < FRINGE_DEPTH; pass++) {
    // collect the current boundary: content pixels touching bg (or bg pixels
    // touching content, for the recovery direction)
    const boundaryContent = [];
    const boundaryBg = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const isC = alpha[p] >= 0.5, isB = alpha[p] < 0.5;
        let touchC = false, touchB = false;
        const nb = [p - 1, p + 1, p - W, p + W];
        for (let k = 0; k < 4; k++) {
          if (alpha[nb[k]] >= 0.5) touchC = true; else touchB = true;
        }
        if (isC && touchB) boundaryContent.push(p);
        if (isB && touchC) boundaryBg.push(p);
      }
    }
    boundaryContent.forEach(p => {
      const o = p * 4;
      const F = nearestSolid(p % W, (p / W) | 0, 3);
      if (!F) return;
      let a = 0;
      for (let c = 0; c < 3; c++) {
        const denom = Math.abs(255 - F[c]);
        if (denom > 24) a = Math.max(a, (255 - d[o + c]) / denom);
      }
      a = Math.max(0, Math.min(1, a));
      if (a < 0.999) {
        edits.push({ p, a });
        alpha[p] = a;
      }
    });
    boundaryBg.forEach(p => {
      const o = p * 4;
      if (!isBgWhite(d[o], d[o + 1], d[o + 2])) {
        // partially covered AA ring on the background side: recover it
        const F = nearestSolid(p % W, (p / W) | 0, 3);
        if (!F) return;
        let a = 0;
        for (let c = 0; c < 3; c++) {
          const denom = Math.abs(255 - F[c]);
          if (denom > 24) a = Math.max(a, (255 - d[o + c]) / denom);
        }
        a = Math.max(0, Math.min(1, a));
        if (a > 0.02) {
          edits.push({ p, a });
          alpha[p] = a;
        }
      }
    });
    // apply soft alpha before the next boundary scan
    edits.forEach(e => { solid[e.p] = alpha[e.p] >= 0.5 ? 1 : 0; });
  }

  // write final RGBA: un-blend white from semi pixels (F = 255 + (C-255)/a)
  for (let p = 0; p < W * H; p++) {
    const o = p * 4;
    const a = alpha[p];
    if (a === 0) { d[o + 3] = 0; continue; }
    if (a < 0.999) {
      for (let c = 0; c < 3; c++) {
        d[o + c] = Math.max(0, Math.min(255, Math.round(255 + (d[o + c] - 255) / a)));
      }
    }
    d[o + 3] = Math.round(a * 255);
  }

  const bbox = alphaBBox(img, 8);
  const out = cropImg(img, bbox.x, bbox.y, bbox.w, bbox.h);
  const size = encodePngFiltered(out, path.join(ART, 'hero-animals.png'));
  console.log('hero-animals.png    ' + out.width + 'x' + out.height +
    '  ' + (size / 1024).toFixed(0) + ' KB  (flood-filled bg + ' + edits.length + ' fringe px)');
  return { out, offX: bbox.x, offY: bbox.y };
}

/* ---------------- 3. PLAY pill bbox ---------------- */

function measurePlayPill(hero) {
  const { out } = hero;
  const W = out.width, H = out.height, d = out.data;
  const x0 = Math.round(W * 0.28), x1 = Math.round(W * 0.72);  // center band only (leaves sit outside)
  const y0 = Math.round(H * 0.58), y1 = Math.round(H * 0.97);
  const rowCnt = new Array(H).fill(0);
  const colCnt = new Array(W).fill(0);
  let maxRow = 0, maxCol = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4;
      if (d[o + 3] < 200) continue;
      const r = d[o], g = d[o + 1], b = d[o + 2];
      // the bright green pill: strongly green-dominant, saturated
      if (g > 120 && g - r > 42 && g - b > 26 && r < 185) {
        rowCnt[y]++; colCnt[x]++;
        if (rowCnt[y] > maxRow) maxRow = rowCnt[y];
      }
    }
  }
  for (let x = x0; x < x1; x++) if (colCnt[x] > maxCol) maxCol = colCnt[x];

  function band(counts, lo, hi, max) {
    let best = null, run = null;
    for (let i = lo; i <= hi; i++) {
      const present = counts[i] > max * 0.22;
      if (present) { if (!run) run = { a: i, b: i }; else run.b = i; }
      else if (run) { if (!best || run.b - run.a > best.b - best.a) best = run; run = null; }
    }
    if (run && (!best || run.b - run.a > best.b - best.a)) best = run;
    return best;
  }
  const rows = band(rowCnt, y0, y1 - 1, maxRow);
  const cols = band(colCnt, x0, x1 - 1, maxCol, );
  if (!rows || !cols) throw new Error('play pill not found');
  // pad by the pill's white outline + shadow (~1.5% of width)
  const pad = Math.round(W * 0.012);
  const bx0 = Math.max(0, cols.a - pad), bx1 = Math.min(W - 1, cols.b + pad);
  const by0 = Math.max(0, rows.a - pad), by1 = Math.min(H - 1, rows.b + pad);
  const pct = (v, m) => (v / m * 100).toFixed(2) + '%';
  console.log('PLAY pill bbox (of hero): left ' + pct(bx0, W) + '  width ' + pct(bx1 - bx0 + 1, W) +
    '  top ' + pct(by0, H) + '  height ' + pct(by1 - by0 + 1, H));
  return { left: bx0 / W, top: by0 / H, w: (bx1 - bx0 + 1) / W, h: (by1 - by0 + 1) / H };
}

function cropImg(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    img.data.copy(out, row * w * 4, ((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4);
  }
  return { width: w, height: h, data: out };
}

buildLogo();
const hero = buildHero();
const pill = measurePlayPill(hero);
fs.writeFileSync(path.join(ART, 'hero-geometry.json'),
  JSON.stringify({ playPill: pill }, null, 2) + '\n');
console.log('hero-geometry.json  written');
