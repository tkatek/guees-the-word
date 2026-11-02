/* Build-time: (a) verify composite — hero over the real classroom bg with the
 * measured PLAY bbox drawn in red, saved for visual QA; (b) produce
 * display-sized copies of logo/hero (retina-safe) to keep the page light. */
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { decodePng, encodePng, encodePngFiltered, alphaBBox } = require('./png-tools');

const ART = path.join(__dirname, '..', 'assets', 'art');
const REFS = path.join(__dirname, 'refs');

/* ---------- generic helpers ---------- */
function resize(img, w, h, method) {
  // method 'avg' = area average (downscale photos), 'nn' = nearest (hard cartoon)
  const out = Buffer.alloc(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(img.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(img.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      const o = (y * w + x) * 4;
      if (method === 'nn') {
        const s = (Math.min(img.height - 1, Math.round((y + .5) * sy - .5)) * img.width +
                   Math.min(img.width - 1, Math.round((x + .5) * sx - .5))) * 4;
        out[o] = img.data[s]; out[o + 1] = img.data[s + 1]; out[o + 2] = img.data[s + 2]; out[o + 3] = img.data[s + 3];
        continue;
      }
      let r = 0, g = 0, b = 0, a = 0, tw = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const s = (yy * img.width + xx) * 4;
        const wgt = 1;
        r += img.data[s] * wgt; g += img.data[s + 1] * wgt; b += img.data[s + 2] * wgt;
        a += img.data[s + 3] * wgt; tw += wgt;
      }
      out[o] = r / tw; out[o + 1] = g / tw; out[o + 2] = b / tw; out[o + 3] = a / tw;
    }
  }
  return { width: w, height: h, data: out };
}

function deflateMax(raw) {
  return zlib.deflateSync(raw, { level: 9, memLevel: 9 });
}
function encodeFiltered(img, file) {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 4;
    const cur = data.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[p + i] = (cur[i] - pr) & 255;
    }
    p += stride;
    cur.copy(prev, 0, 0);
  }
  const idat = deflateMax(raw);
  function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function drawOver(bg, fg, dx, dy, desiredW) {
  const scale = desiredW / fg.width;
  const fh = Math.round(fg.height * scale);
  const small = resize(fg, desiredW, fh, 'avg');
  for (let y = 0; y < fh; y++) {
    const by = dy + y;
    if (by < 0 || by >= bg.height) continue;
    for (let x = 0; x < desiredW; x++) {
      const bx = dx + x;
      if (bx < 0 || bx >= bg.width) continue;
      const s = (y * desiredW + x) * 4, o = (by * bg.width + bx) * 4;
      const a = small.data[s + 3] / 255;
      if (a <= 0) continue;
      bg.data[o] = small.data[s] * a + bg.data[o] * (1 - a);
      bg.data[o + 1] = small.data[s + 1] * a + bg.data[o + 1] * (1 - a);
      bg.data[o + 2] = small.data[s + 2] * a + bg.data[o + 2] * (1 - a);
      bg.data[o + 3] = 255;
    }
  }
  return fh;
}

function rect(img, x, y, w, h, color) {
  const plot = (px, py) => {
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
    const o = (py * img.width + px) * 4;
    img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2]; img.data[o + 3] = 255;
  };
  for (let i = 0; i < w; i++) { plot(x + i, y); plot(x + i, y + h - 1); }
  for (let i = 0; i < h; i++) { plot(x, y + i); plot(x + w - 1, y + i); }
}

/* ---------- 1. QA composite ---------- */
function qaComposite() {
  const geo = JSON.parse(fs.readFileSync(path.join(ART, 'hero-geometry.json'), 'utf8'));
  const bg = decodePng(path.join(ART, 'bg-phone.png'));   // 941x1672
  const hero = decodePng(path.join(ART, 'hero-animals.png'));
  const logo = decodePng(path.join(ART, 'logo.png'));

  // reference placement: logo 78% wide at y≈10%; hero 80% wide starting y≈28%
  const logoW = Math.round(bg.width * 0.78);
  drawOver(bg, logo, Math.round((bg.width - logoW) / 2), Math.round(bg.height * 0.10), logoW);
  const heroW = Math.round(bg.width * 0.80);
  const heroH = drawOver(bg, hero, Math.round((bg.width - heroW) / 2), Math.round(bg.height * 0.28), heroW);

  // draw the measured PLAY pill bbox in red
  const pill = geo.playPill;
  const px = Math.round(bg.width * 0.10 + pill.left * heroW);
  const py = Math.round(bg.height * 0.28 + pill.top * heroH);
  rect(bg, px, py, Math.round(pill.w * heroW), Math.round(pill.h * heroH), [255, 0, 0]);
  const size = encodePng(resize(bg, 471, 836, 'avg'), path.join(REFS, 'qa-composite.png'));
  console.log('qa-composite.png  ' + (size / 1024).toFixed(0) + ' KB (red box = measured PLAY overlay)');
}

/* ---------- 2. display-sized builds ---------- */
function optimize() {
  const logo = decodePng(path.join(ART, 'logo.png'));
  const hero = decodePng(path.join(ART, 'hero-animals.png'));

  // logo: 1400px wide covers 3x phone + 1.6x desktop retina
  const lw = 1400, lh = Math.round(logo.height * lw / logo.width);
  const logoSmall = resize(logo, lw, lh, 'avg');
  const s1 = encodeFiltered(logoSmall, path.join(ART, 'logo.png'));
  console.log('logo.png           ' + lw + 'x' + lh + '  ' + (s1 / 1024).toFixed(0) + ' KB');

  // hero: 1050px wide covers 3x phone (343px slot) and desktop comfortably
  const hw = 1050, hh = Math.round(hero.height * hw / hero.width);
  const heroSmall = resize(hero, hw, hh, 'avg');
  const s2 = encodeFiltered(heroSmall, path.join(ART, 'hero-animals.png'));
  console.log('hero-animals.png   ' + hw + 'x' + hh + '  ' + (s2 / 1024).toFixed(0) + ' KB');
}

qaComposite();
optimize();
