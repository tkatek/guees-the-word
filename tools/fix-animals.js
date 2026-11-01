/*
 * fix-animals.js — BUILD-TIME second pass: upgrades the weakest picks.
 *  - frog  -> icon-park:frog (full-body, colored) fallback game-icons + gradient
 *  - lion  -> game-icons:lion (full body) baked with a warm gradient
 *  - koala -> game-icons:koala baked with gradient
 *  - sheep -> Wikimedia Commons "Sheep cartoon 04.svg" (CC0)
 *  - chameleon -> game-icons:chameleon-glyph with green gradient
 *  - porcupine/armadillo/hummingbird -> re-baked with gradients (not flat)
 *  - woodpecker -> thesvg-color:woodpecker (colored)
 * Gradient baking: single-path monochrome icons get a two-stop linear gradient
 * so the success reveal shows shading instead of one flat color. The black
 * silhouette state is unaffected (brightness(0) flattens everything).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'animals');

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function scrub(svg) {
  let out = svg
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  if (out.indexOf('<svg') === -1 || !/viewBox=/i.test(out)) return null;
  out = out.replace(/\s(width|height)="\d+(\.\d+)?"/gi, '');
  return out.trim();
}

function bakeGradient(svg, hex) {
  const dark = shade(hex, 0.55), light = shade(hex, 1.15);
  // drop any existing fill attributes so the gradient applies cleanly
  let body = svg.replace(/\sfill="[^"]*"/gi, '');
  const defs = '<defs><linearGradient id="amg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + light + '"/><stop offset="1" stop-color="' + dark + '"/>' +
    '</linearGradient></defs>';
  // inject defs right after the opening <svg ...> and set fill on all shapes
  body = body.replace(/<svg([^>]*)>/i, function (m, attrs) {
    return '<svg' + attrs + '>' + defs;
  });
  body = body.replace(/<(path|circle|ellipse|rect|polygon|g)(\s)/g, '<$1 fill="url(#amg)"$2');
  return body;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'AnimalMysteryGame/1.0 (educational asset fetch)' } });
  if (!res.ok) return null;
  return res.text();
}

async function gameIconsGradient(icon, hex) {
  const raw = await get('https://api.iconify.design/game-icons/' + icon + '.svg');
  if (!raw || raw.indexOf('<svg') === -1) return null;
  const clean = scrub(raw);
  if (!clean) return null;
  return {
    svg: bakeGradient(clean, hex),
    credit: {
      source: 'Iconify game-icons:' + icon + ' (gradient-shaded)',
      license: 'CC-BY-3.0 (game-icons.net, Lorc/Delapouite)',
      url: 'https://game-icons.net/' + icon + '.html',
      author: 'Lorc / Delapouite (game-icons.net)'
    }
  };
}

async function directIconify(prefix, icon) {
  const raw = await get('https://api.iconify.design/' + prefix + '/' + icon + '.svg');
  if (!raw || raw.indexOf('<svg') === -1) return null;
  const clean = scrub(raw);
  if (!clean) return null;
  const lic = {
    'icon-park': 'Apache-2.0 (IconPark)',
    'thesvg-color': 'Free with attribution (thesvg.com) — see collection page',
    'game-icons': 'CC-BY-3.0 (game-icons.net)'
  }[prefix] || 'see Iconify collection page';
  return { svg: clean, credit: { source: 'Iconify ' + prefix + ':' + icon, license: lic, url: 'https://api.iconify.design/' + prefix + '/' + icon + '.svg', author: prefix } };
}

async function commonsSheep() {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=File:' +
    encodeURIComponent('Sheep cartoon 04.svg') + '&prop=imageinfo&iiprop=url|mime|extmetadata';
  const raw = await get(api);
  if (!raw) return null;
  try {
    const pages = JSON.parse(raw).query.pages;
    const page = Object.values(pages)[0];
    const info = page.imageinfo && page.imageinfo[0];
    if (!info) return null;
    const svg = await get(info.url);
    const clean = svg && scrub(svg);
    if (!clean) return null;
    const meta = info.extmetadata || {};
    return {
      svg: clean,
      credit: {
        source: 'Wikimedia Commons: Sheep cartoon 04.svg',
        license: ((meta.LicenseShortName && meta.LicenseShortName.value) || 'CC0') + ' (Wikimedia Commons)',
        url: info.descriptionurl || info.url,
        author: (meta.Artist && String(meta.Artist.value).replace(/<[^>]*>/g, '').trim()) || 'unknown'
      }
    };
  } catch (e) { return null; }
}

(async function () {
  const manifestPath = path.join(OUT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const jobs = [
    { qid: 'q006', run: async () => (await directIconify('icon-park', 'frog')) || (await gameIconsGradient('frog', '#7BC96F')) },
    { qid: 'q009', run: () => gameIconsGradient('lion', '#E5A33B') },
    { qid: 'q014', run: commonsSheep },
    { qid: 'q020', run: () => gameIconsGradient('koala', '#A8B5B0') },
    { qid: 'q034', run: async () => (await gameIconsGradient('chameleon-glyph', '#7ED957')) || (await gameIconsGradient('chameleon', '#7ED957')) },
    { qid: 'q035', run: () => gameIconsGradient('porcupine', '#A8896A') },
    { qid: 'q036', run: () => gameIconsGradient('armadillo', '#E5C296') },
    { qid: 'q038', run: () => directIconify('thesvg-color', 'woodpecker') },
    { qid: 'q039', run: () => gameIconsGradient('hummingbird', '#57C7A8') }
  ];
  for (const job of jobs) {
    const got = await job.run();
    if (got) {
      fs.writeFileSync(path.join(OUT, job.qid + '.svg'), got.svg);
      manifest[job.qid] = Object.assign({ animalRef: '(upgraded)' }, got.credit);
      console.log(job.qid + ' OK <- ' + got.credit.source);
    } else {
      console.log(job.qid + ' FAILED (keeping previous)');
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('done');
})();
