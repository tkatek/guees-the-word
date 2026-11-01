/*
 * fetch-animals.js — BUILD-TIME: downloads 40 colored full-body animal
 * illustrations into assets/animals/q001.svg … q040.svg (neutral names),
 * plus a manifest with source/license/author for attribution.
 *
 * Source priority:
 *   1. Iconify colored emoji sets (noto=Apache-2.0, fluent-emoji-flat=MIT,
 *      openmoji=CC-BY-SA-4.0, twemoji=CC-BY-4.0) — full-body variants only.
 *   2. Iconify search over other colored sets (icon-park=Apache-2.0 …).
 *   3. Wikimedia Commons (openclipart/PD, CC-licensed SVGs) with metadata.
 *   4. Last resort: game-icons (CC-BY-3.0) baked with the animal's color.
 *
 * Every SVG is scrubbed of <title>/<desc> so no animal name leaks, and is
 * checked for a viewBox + actual geometry. Run: node tools/fetch-animals.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'animals');
fs.mkdirSync(OUT, { recursive: true });

const LICENSES = {
  'noto': 'Apache-2.0 (Google Noto Emoji)',
  'noto-v1': 'Apache-2.0 (Google Noto Emoji v1)',
  'fluent-emoji-flat': 'MIT (Microsoft Fluent Emoji)',
  'fluent-emoji': 'MIT (Microsoft Fluent Emoji)',
  'openmoji': 'CC-BY-SA-4.0 (OpenMoji)',
  'twemoji': 'CC-BY-4.0 (Twitter Twemoji)',
  'emojione': 'Free for personal and commercial use (EmojiOne)',
  'streamline-emoji-color': 'Streamline free license',
  'icon-park': 'Apache-2.0 (IconPark)',
  'game-icons': 'CC-BY-3.0 (game-icons.net)'
};
const COLORED_PREFIXES = Object.keys(LICENSES).filter(p => p !== 'game-icons');

// qid, animal, preferred full-body icon candidates (in order), fallback search terms
const ANIMALS = [
  { qid: 'q001', name: 'cat', candidates: [['noto', 'cat'], ['fluent-emoji-flat', 'cat'], ['twemoji', 'cat']] },
  { qid: 'q002', name: 'dog', candidates: [['noto', 'dog'], ['fluent-emoji-flat', 'dog'], ['twemoji', 'dog']] },
  { qid: 'q003', name: 'pig', candidates: [['noto', 'pig'], ['fluent-emoji-flat', 'pig'], ['twemoji', 'pig']] },
  { qid: 'q004', name: 'cow', candidates: [['noto', 'cow'], ['fluent-emoji-flat', 'cow'], ['twemoji', 'cow']] },
  { qid: 'q005', name: 'duck', candidates: [['noto', 'duck'], ['fluent-emoji-flat', 'duck'], ['twemoji', 'duck']] },
  { qid: 'q006', name: 'frog', candidates: [['noto', 'frog-face'], ['fluent-emoji-flat', 'frog']], search: ['frog full body', 'frog cartoon'], commons: 'frog clipart svg' },
  { qid: 'q007', name: 'fish', candidates: [['noto', 'fish'], ['fluent-emoji-flat', 'fish'], ['twemoji', 'fish']] },
  { qid: 'q008', name: 'hen', candidates: [['noto', 'chicken'], ['fluent-emoji-flat', 'chicken'], ['twemoji', 'chicken']] },
  { qid: 'q009', name: 'lion', search: ['lion', 'lion full body'], commons: 'lion cartoon svg', color: '#E5A33B' },
  { qid: 'q010', name: 'bear', candidates: [['noto', 'bear'], ['fluent-emoji-flat', 'bear'], ['twemoji', 'bear']] },
  { qid: 'q011', name: 'goat', candidates: [['noto', 'goat'], ['fluent-emoji-flat', 'goat'], ['twemoji', 'goat']] },
  { qid: 'q012', name: 'deer', candidates: [['noto', 'deer'], ['fluent-emoji-flat', 'deer'], ['twemoji', 'deer']] },
  { qid: 'q013', name: 'horse', candidates: [['noto', 'horse'], ['fluent-emoji-flat', 'horse'], ['twemoji', 'horse']] },
  { qid: 'q014', name: 'sheep', candidates: [['noto', 'ram'], ['fluent-emoji-flat', 'ram']], search: ['sheep', 'sheep wool'], commons: 'sheep clipart svg' },
  { qid: 'q015', name: 'snake', candidates: [['noto', 'snake'], ['fluent-emoji-flat', 'snake'], ['twemoji', 'snake']] },
  { qid: 'q016', name: 'mouse', candidates: [['noto', 'mouse'], ['fluent-emoji-flat', 'mouse'], ['twemoji', 'mouse']] },
  { qid: 'q017', name: 'tiger', candidates: [['noto', 'tiger'], ['fluent-emoji-flat', 'tiger'], ['twemoji', 'tiger']] },
  { qid: 'q018', name: 'zebra', candidates: [['noto', 'zebra'], ['fluent-emoji-flat', 'zebra'], ['twemoji', 'zebra']] },
  { qid: 'q019', name: 'panda', search: ['panda', 'giant panda'], commons: 'panda cartoon svg', color: '#2E3440' },
  { qid: 'q020', name: 'koala', search: ['koala'], commons: 'koala clipart svg', color: '#A8B5B0' },
  { qid: 'q021', name: 'rabbit', candidates: [['noto', 'rabbit'], ['fluent-emoji-flat', 'rabbit'], ['twemoji', 'rabbit']] },
  { qid: 'q022', name: 'monkey', candidates: [['noto', 'monkey'], ['fluent-emoji-flat', 'monkey'], ['twemoji', 'monkey']] },
  { qid: 'q023', name: 'turtle', candidates: [['noto', 'turtle'], ['fluent-emoji-flat', 'turtle'], ['twemoji', 'turtle']] },
  { qid: 'q024', name: 'camel', candidates: [['noto', 'dromedary-camel'], ['noto', 'two-hump-camel'], ['fluent-emoji-flat', 'two-hump-camel'], ['twemoji', 'two-hump-camel']] },
  { qid: 'q025', name: 'penguin', candidates: [['noto', 'penguin'], ['fluent-emoji-flat', 'penguin'], ['twemoji', 'penguin']] },
  { qid: 'q026', name: 'giraffe', candidates: [['noto', 'giraffe'], ['fluent-emoji-flat', 'giraffe'], ['twemoji', 'giraffe']] },
  { qid: 'q027', name: 'dolphin', candidates: [['noto', 'dolphin'], ['fluent-emoji-flat', 'dolphin'], ['twemoji', 'dolphin']] },
  { qid: 'q028', name: 'parrot', candidates: [['noto', 'parrot'], ['fluent-emoji-flat', 'parrot'], ['twemoji', 'parrot']] },
  { qid: 'q029', name: 'elephant', candidates: [['noto', 'elephant'], ['fluent-emoji-flat', 'elephant'], ['twemoji', 'elephant']] },
  { qid: 'q030', name: 'kangaroo', candidates: [['noto', 'kangaroo'], ['fluent-emoji-flat', 'kangaroo'], ['twemoji', 'kangaroo']] },
  { qid: 'q031', name: 'flamingo', candidates: [['noto', 'flamingo'], ['fluent-emoji-flat', 'flamingo'], ['twemoji', 'flamingo']] },
  { qid: 'q032', name: 'octopus', candidates: [['noto', 'octopus'], ['fluent-emoji-flat', 'octopus'], ['twemoji', 'octopus']] },
  { qid: 'q033', name: 'rhinoceros', candidates: [['noto', 'rhinoceros'], ['fluent-emoji-flat', 'rhinoceros'], ['twemoji', 'rhinoceros']] },
  { qid: 'q034', name: 'chameleon', search: ['chameleon'], commons: 'chameleon clipart svg', color: '#7ED957' },
  { qid: 'q035', name: 'porcupine', search: ['porcupine'], commons: 'porcupine cartoon svg', color: '#8A6F4D' },
  { qid: 'q036', name: 'armadillo', search: ['armadillo'], commons: 'armadillo clipart svg', color: '#D9B489' },
  { qid: 'q037', name: 'hippopotamus', candidates: [['noto', 'hippopotamus'], ['fluent-emoji-flat', 'hippopotamus'], ['twemoji', 'hippopotamus']] },
  { qid: 'q038', name: 'woodpecker', search: ['woodpecker'], commons: 'woodpecker clipart svg', color: '#E64980' },
  { qid: 'q039', name: 'hummingbird', search: ['hummingbird'], commons: 'hummingbird clipart svg', color: '#57C7A8' },
  { qid: 'q040', name: 'orangutan', candidates: [['noto', 'orangutan'], ['fluent-emoji-flat', 'orangutan'], ['twemoji', 'orangutan']] }
];

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'AnimalMysteryGame/1.0 (educational game asset fetch)' } });
  if (!res.ok) return null;
  return res.text();
}

function scrub(svg) {
  // remove metadata that could name the animal, plus fixed sizing
  let out = svg
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  if (out.indexOf('<svg') === -1) return null;
  if (!/viewBox=/i.test(out)) return null;
  if (!/<(path|circle|ellipse|rect|polygon|g|use)/i.test(out)) return null;
  // drop fixed width/height so CSS controls sizing
  out = out.replace(/\s(width|height)="\d+(\.\d+)?"/gi, '');
  return out.trim();
}

async function fromIconify(prefix, icon, color) {
  let url = 'https://api.iconify.design/' + prefix + '/' + encodeURIComponent(icon) + '.svg';
  if (color) url += '?color=' + encodeURIComponent(color);
  const raw = await get(url);
  if (!raw || raw.indexOf('<svg') === -1 || raw.indexOf('404') === 0) return null;
  const clean = scrub(raw);
  return clean ? {
    svg: clean,
    source: 'Iconify ' + prefix + ':' + icon,
    license: LICENSES[prefix] || 'see Iconify collection page',
    url: 'https://api.iconify.design/' + prefix + '/' + icon + '.svg',
    author: prefix
  } : null;
}

async function iconifySearch(term) {
  const raw = await get('https://api.iconify.design/search?query=' + encodeURIComponent(term) + '&limit=64');
  if (!raw) return [];
  try { return JSON.parse(raw).icons || []; } catch (e) { return []; }
}

async function fromCommons(query) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    '&gsrsearch=' + encodeURIComponent('filetype:svg ' + query) +
    '&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url|mime|extmetadata';
  const raw = await get(api);
  if (!raw) return null;
  let pages;
  try { pages = JSON.parse(raw).query.pages; } catch (e) { return null; }
  const list = Object.values(pages).sort((a, b) => (a.index || 99) - (b.index || 99));
  for (const page of list) {
    const info = page.imageinfo && page.imageinfo[0];
    if (!info || info.mime !== 'image/svg+xml') continue;
    const meta = info.extmetadata || {};
    const lic = (meta.LicenseShortName && meta.LicenseShortName.value) || '';
    const artist = (meta.Artist && String(meta.Artist.value).replace(/<[^>]*>/g, '').trim()) || 'unknown';
    // avoid heavy restrictions; accept common open licenses
    if (!/public domain|cc0|cc by(?!.*nc)|cc by-sa|attribution/i.test(lic)) continue;
    if (/fair use|non-free/i.test(lic)) continue;
    const svg = await get(info.url);
    if (!svg) continue;
    const clean = scrub(svg);
    if (!clean || clean.length > 400000) continue;
    return {
      svg: clean,
      source: 'Wikimedia Commons: ' + page.title.replace(/^File:/, ''),
      license: lic + ' (Wikimedia Commons)',
      url: info.descriptionurl || info.url,
      author: artist
    };
  }
  return null;
}

(async function main() {
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); } catch (e) { manifest = {}; }
  const report = [];
  for (const a of ANIMALS) {
    let got = null, how = '';
    // 1) direct candidates
    for (const [prefix, icon] of (a.candidates || [])) {
      got = await fromIconify(prefix, icon);
      if (got) { how = 'candidate ' + prefix + ':' + icon; break; }
    }
    // reject face-only picks for animals that must be full-body (allow frog-face as frog is face-only in emoji)
    // 2) iconify search over colored sets
    if (!got && a.search) {
      for (const term of a.search) {
        const icons = await iconifySearch(term);
        const bad = /-face|-head|cute|round/i;
        const ranked = icons.filter(i => COLORED_PREFIXES.includes(i.split(':')[0]) && !bad.test(i));
        for (const full of ranked) {
          const [prefix, icon] = full.split(':');
          if (!icon.includes(term.split(' ')[0])) continue;
          got = await fromIconify(prefix, icon);
          if (got) { how = 'search ' + full; break; }
        }
        if (got) break;
      }
    }
    // 3) Wikimedia Commons
    if (!got && a.commons) {
      got = await fromCommons(a.commons);
      if (got) how = 'commons "' + a.commons + '"';
    }
    // 4) game-icons baked with the animal color
    if (!got && a.color) {
      got = await fromIconify('game-icons', a.name.replace(/[^a-z-]/gi, '') , a.color);
      if (got) how = 'game-icons:' + a.name;
    }
    if (got) {
      fs.writeFileSync(path.join(OUT, a.qid + '.svg'), got.svg);
      manifest[a.qid] = { animalRef: a.name, source: got.source, license: got.license, url: got.url, author: got.author };
      report.push(a.qid + ' ' + a.name.padEnd(13) + ' OK  <- ' + how);
    } else {
      report.push(a.qid + ' ' + a.name.padEnd(13) + ' MISSING');
      delete manifest[a.qid];
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(report.join('\n'));
  const missing = report.filter(r => r.includes('MISSING')).length;
  console.log('\n' + (40 - missing) + '/40 downloaded, ' + missing + ' missing');
})();
