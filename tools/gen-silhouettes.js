/*
 * gen-silhouettes.js — BUILD-TIME generator for the 40 animal silhouette SVGs.
 * Writes assets/silhouettes/q001.svg ... q040.svg (neutral ids, no animal names).
 * Style: cohesive chunky cartoon silhouettes on a 200x150 canvas, ground ~y138.
 * Every animal is distinct (pose + defining feature) and stays a solid black
 * silhouette until the CSS reveal recolors .body -> var(--c1), .acc -> var(--c2).
 * Run:  node tools/gen-silhouettes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'silhouettes');
fs.mkdirSync(OUT, { recursive: true });

// ---------- shape helpers ----------
function ellipse(cx, cy, rx, ry, rot) {
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"' +
    (rot ? ' transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"' : '') + '/>';
}
function circle(cx, cy, r) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; }
function rect(x, y, w, h, r, rot) {
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '"' +
    (rot ? ' transform="rotate(' + rot + ' ' + (x + w / 2) + ' ' + (y + h / 2) + ')"' : '') + '/>';
}
function p(d, extra) { return '<path d="' + d + '"' + (extra || '') + '/>'; }
function stroke(d, w, cap) {
  return '<path d="' + d + '" fill="none" stroke-width="' + w + '" stroke-linecap="' + (cap || 'round') + '"/>';
}
// mane/spike star polygon around cx,cy
function star(cx, cy, rOut, rIn, n, rotDeg) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rotDeg || 0) + i * 180 / n) * Math.PI / 180;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
  }
  return '<polygon points="' + pts.join(' ') + '"/>';
}
// fluffy cloud ring of overlapping circles
function fluff(cx, cy, rx, ry, n, r) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * i / n;
    s += circle(cx + rx * Math.cos(a), cy + ry * Math.sin(a), r);
  }
  return s + ellipse(cx, cy, rx * 0.92, ry * 0.92);
}

const leg = (x, h, w) => rect(x, 138 - h, w || 9, h + 2, (w || 9) / 2.2);

// ---------- the 40 animals (order = question order q001..q040) ----------
const A = [];
A.push({ // q001 CAT — sitting, pointed ears, curled tail
  body: [
    ellipse(92, 104, 40, 32),
    circle(126, 56, 21),
    p('M110 42 L103 16 L123 32 Z'), p('M130 30 L145 12 L148 38 Z'),
    rect(112, 112, 11, 28, 5), rect(131, 112, 11, 28, 5),
    p('M58 120 Q22 132 18 108 Q16 92 30 93 Q24 107 35 113 Q48 119 60 113 Z')
  ],
  acc: [ellipse(126, 62, 8, 5)]
});
A.push({ // q002 DOG — sitting, floppy ears, upcurved tail
  body: [
    ellipse(92, 104, 38, 30),
    circle(126, 58, 20),
    ellipse(108, 54, 8, 17, 18), ellipse(144, 54, 8, 17, -18),
    ellipse(141, 70, 11, 7),
    rect(112, 112, 11, 28, 5), rect(130, 112, 11, 28, 5),
    p('M60 98 Q38 78 42 56 Q52 68 62 72 Q56 90 74 102 Z')
  ],
  acc: [circle(134, 52, 3)]
});
A.push({ // q003 PIG — side, snout, curly tail
  body: [
    ellipse(98, 98, 46, 27),
    circle(146, 92, 17),
    ellipse(163, 94, 7, 9),
    p('M136 76 L130 58 L146 68 Z'),
    leg(72, 30, 10), leg(88, 32, 10), leg(112, 30, 10), leg(126, 32, 10),
    p('M52 92 q-16 -12 -5 -19 q11 -5 9 6 q-2 9 -11 7 Z')
  ],
  acc: [circle(157, 90, 2)]
});
A.push({ // q004 COW — humped shoulder, horns, udder
  body: [
    p('M50 100 Q56 66 92 64 Q150 62 158 84 L158 110 Q100 124 50 110 Z'),
    circle(154, 70, 15),
    ellipse(170, 76, 8, 6),
    p('M146 56 Q140 40 148 34 Q152 44 154 52 Z'), p('M160 56 Q170 42 166 32 Q158 40 156 50 Z'),
    ellipse(100, 116, 13, 10),
    leg(64, 30, 10), leg(82, 32, 10), leg(112, 30, 10), leg(130, 32, 10),
    stroke('M50 96 Q34 108 38 128', 5)
  ],
  acc: [circle(160, 66, 2), ellipse(100, 118, 5, 5)]
});
A.push({ // q005 DUCK — floating, flat bill, tail flick
  body: [
    ellipse(98, 104, 42, 21),
    p('M62 96 Q40 88 38 76 Q54 82 66 84 Z'),
    stroke('M136 100 Q152 82 148 62', 16),
    circle(146, 54, 13),
    rect(154, 50, 16, 8, 4)
  ],
  acc: [circle(150, 50, 2.5)]
});
A.push({ // q006 FROG — squatting, bulgy eyes
  body: [
    ellipse(100, 104, 44, 27),
    ellipse(100, 78, 34, 20),
    circle(78, 56, 11), circle(122, 56, 11),
    ellipse(55, 122, 18, 9), ellipse(145, 122, 18, 9)
  ],
  acc: [circle(78, 56, 4), circle(122, 56, 4)]
});
A.push({ // q007 FISH — body, tail fin, dorsal fin
  body: [
    ellipse(102, 82, 40, 23),
    p('M136 82 L176 58 L170 82 L176 106 Z'),
    p('M84 61 L98 36 L118 60 Z'),
    p('M96 96 Q108 112 92 122 Q88 108 90 98 Z')
  ],
  acc: [circle(122, 76, 3.5)]
});
A.push({ // q008 HEN — comb, beak, wattles, tail fan
  body: [
    ellipse(92, 98, 38, 28),
    p('M58 86 Q30 68 40 44 Q50 62 60 66 Q50 44 58 28 Q68 48 76 60 Z'),
    stroke('M124 92 Q140 76 138 60', 14),
    circle(136, 54, 12),
    p('M128 42 q3 -9 9 -9 q-1 6 -4 9 Z'),
    p('M137 40 q2 -10 10 -10 q-2 7 -6 10 Z'),
    p('M147 50 L164 54 L147 60 Z'),
    ellipse(133, 68, 5, 7),
    leg(88, 26, 5), leg(104, 26, 5),
    rect(80, 136, 16, 5, 2), rect(96, 136, 16, 5, 2)
  ],
  acc: [circle(140, 50, 2.5)]
});
A.push({ // q009 LION — mane star, tufted tail
  body: [
    ellipse(88, 106, 42, 26),
    leg(58, 30, 10), leg(76, 32, 10), leg(100, 30, 10), leg(116, 32, 10),
    stroke('M48 108 Q16 100 22 74', 6), circle(23, 70, 7),
    star(134, 62, 33, 22, 11, 0),
    circle(136, 62, 15),
    ellipse(148, 70, 9, 6),
    p('M124 50 L120 36 L132 44 Z')
  ],
  acc: [circle(141, 58, 2.5)]
});
A.push({ // q010 BEAR — bulky, round ears
  body: [
    ellipse(92, 102, 48, 32),
    circle(146, 66, 22),
    circle(132, 46, 9), circle(160, 46, 9),
    ellipse(160, 76, 10, 7),
    leg(60, 32, 13), leg(80, 34, 13), leg(104, 32, 13), leg(124, 34, 13)
  ],
  acc: [circle(152, 60, 3)]
});
A.push({ // q011 GOAT — back-swept horn, beard
  body: [
    ellipse(94, 100, 42, 25),
    circle(148, 76, 14),
    ellipse(163, 82, 7, 5),
    p('M142 64 Q146 44 158 40 Q150 56 152 66 Z'),
    p('M156 88 q8 12 0 18 q-8 -6 -2 -18 Z'),
    leg(66, 32, 7), leg(82, 34, 7), leg(106, 32, 7), leg(120, 34, 7),
    p('M54 92 q-8 -10 0 -14 q7 4 3 14 Z')
  ],
  acc: [circle(156, 72, 2)]
});
A.push({ // q012 DEER — branched antlers, slim legs
  body: [
    ellipse(94, 102, 40, 23),
    p('M120 96 Q134 70 138 54 L148 58 Q142 76 134 96 Z'),
    circle(146, 52, 11),
    ellipse(158, 58, 8, 5),
    p('M138 44 Q132 24 142 14 Q144 26 148 36 Q150 24 158 18 Q154 32 152 44 Z'),
    p('M150 44 Q158 30 168 26 Q162 38 158 48 Z'),
    leg(68, 34, 5), leg(84, 36, 5), leg(104, 34, 5), leg(118, 36, 5),
    p('M56 96 q-10 -2 -10 -10 q8 0 10 8 Z')
  ],
  acc: [circle(150, 49, 2)]
});
A.push({ // q013 HORSE — mane, long tail
  body: [
    ellipse(90, 96, 46, 26),
    p('M126 100 Q146 62 158 46 L172 56 Q162 70 152 104 Z'),
    ellipse(168, 52, 16, 9, -20),
    p('M158 40 L162 24 L170 40 Z'),
    p('M148 48 L152 60 L140 56 L144 44 Z'),
    leg(54, 40, 9), leg(72, 44, 9), leg(102, 40, 9), leg(120, 44, 9),
    p('M46 88 Q28 108 32 136 Q44 120 54 100 Z')
  ],
  acc: [stroke('M150 52 Q160 68 154 100', 4)]
});
A.push({ // q014 SHEEP — wool cloud, dark head
  body: [
    fluff(94, 100, 42, 26, 12, 16),
    circle(148, 92, 13),
    ellipse(158, 88, 7, 10, -20),
    leg(72, 34, 7), leg(90, 36, 7), leg(110, 34, 7), leg(126, 36, 7)
  ],
  acc: [circle(154, 89, 2)]
});
A.push({ // q015 SNAKE — thick S body, tongue
  body: [
    stroke('M34 120 Q66 74 96 104 Q126 134 156 88 Q168 68 160 54', 17),
    ellipse(160, 50, 12, 10, 30),
    stroke('M170 46 L182 42 M182 42 L188 38 M182 42 L188 46', 2.5)
  ],
  acc: [circle(163, 47, 2.5)]
});
A.push({ // q016 MOUSE — big ears, thin tail
  body: [
    ellipse(112, 108, 30, 21),
    circle(140, 98, 13),
    ellipse(153, 104, 6, 4),
    circle(88, 80, 14), circle(116, 74, 16),
    leg(100, 22, 6), leg(120, 22, 6),
    stroke('M84 118 Q40 130 22 106', 4)
  ],
  acc: [circle(147, 96, 2)]
});
A.push({ // q017 TIGER — long low cat, heavy head
  body: [
    ellipse(88, 102, 46, 25),
    leg(56, 36, 10), leg(74, 38, 10), leg(98, 36, 10), leg(114, 38, 10),
    circle(140, 62, 18),
    ellipse(154, 72, 10, 6),
    p('M128 48 L124 32 L136 42 Z'), p('M146 42 L158 28 L158 46 Z'),
    stroke('M46 100 Q18 96 26 76', 7)
  ],
  acc: [circle(146, 58, 2.5)]
});
A.push({ // q018 ZEBRA — upright mane, tufted tail
  body: [
    ellipse(90, 98, 42, 25),
    p('M124 100 Q140 66 154 48 L166 58 Q154 74 148 104 Z'),
    ellipse(163, 54, 14, 8, -20),
    p('M152 44 L156 26 L164 40 Z'),
    p('M142 50 L150 46 L150 66 L142 64 Z M150 44 L158 40 L158 60 L150 58 Z M158 46 L164 44 L164 62 L158 60 Z'),
    leg(56, 40, 8), leg(74, 44, 8), leg(100, 40, 8), leg(118, 44, 8),
    p('M50 92 Q36 104 38 124 Q46 116 56 102 Z')
  ],
  acc: [circle(168, 51, 2.5)]
});
A.push({ // q019 PANDA — sitting, round ears, bamboo stalk
  body: [
    circle(100, 102, 42),
    circle(100, 56, 26),
    circle(78, 36, 11), circle(122, 36, 11),
    rect(148, 46, 8, 96, 4, 8),
    p('M148 52 Q170 40 178 46 Q168 56 150 60 Z'),
    p('M148 78 Q166 68 174 74 Q164 84 148 86 Z'),
    ellipse(84, 108, 14, 30, 24)
  ],
  acc: [ellipse(100, 62, 8, 6), ellipse(100, 104, 24, 28)]
});
A.push({ // q020 KOALA — hugging a branch
  body: [
    rect(58, 6, 24, 136, 8),
    rect(74, 16, 46, 13, 6, -18),
    ellipse(104, 98, 26, 30),
    circle(110, 56, 20),
    circle(88, 42, 13), circle(132, 46, 13),
    ellipse(112, 60, 7, 9),
    ellipse(90, 84, 9, 22, 24)
  ],
  acc: [circle(114, 52, 2.5), ellipse(102, 106, 12, 20)]
});
A.push({ // q021 RABBIT — long ears, round tail
  body: [
    ellipse(102, 104, 34, 32),
    circle(102, 62, 22),
    ellipse(88, 26, 9, 24, -8), ellipse(114, 26, 9, 24, 8),
    rect(94, 112, 10, 28, 5), rect(112, 112, 10, 28, 5),
    circle(66, 112, 9)
  ],
  acc: [ellipse(88, 26, 4, 15, -8), ellipse(114, 26, 4, 15, 8), circle(102, 70, 4)]
});
A.push({ // q022 MONKEY — curled tail, side ears
  body: [
    ellipse(100, 104, 32, 30),
    circle(100, 60, 20),
    circle(76, 58, 9), circle(124, 58, 9),
    ellipse(100, 70, 11, 8),
    stroke('M130 106 Q170 112 168 80 Q166 60 150 64', 8),
    rect(78, 108, 9, 32, 4), rect(114, 108, 9, 32, 4)
  ],
  acc: [circle(92, 54, 2.5), circle(108, 54, 2.5)]
});
A.push({ // q023 TURTLE — domed shell
  body: [
    p('M52 102 A50 44 0 0 1 152 102 Z'),
    rect(50, 96, 104, 12, 6),
    ellipse(166, 98, 13, 9),
    ellipse(38, 112, 10, 7, 30),
    leg(66, 24, 9), leg(86, 26, 9), leg(112, 24, 9), leg(132, 26, 9)
  ],
  acc: [stroke('M76 66 Q100 52 124 66', 3), stroke('M64 84 Q100 70 138 84', 3), stroke('M92 52 Q100 46 108 52', 3)]
});
A.push({ // q024 CAMEL — single hump, curved neck
  body: [
    ellipse(94, 102, 38, 23),
    circle(96, 82, 19),
    p('M128 104 Q150 76 146 50 L158 50 Q158 78 142 106 Z'),
    ellipse(153, 46, 10, 7, -18),
    p('M148 40 L152 28 L158 38 Z'),
    leg(64, 36, 7), leg(80, 38, 7), leg(104, 36, 7), leg(118, 38, 7),
    p('M58 96 q-8 -4 -8 -12 q6 0 8 10 Z')
  ],
  acc: [circle(157, 44, 2)]
});
A.push({ // q025 PENGUIN — upright, flippers
  body: [
    ellipse(100, 84, 33, 50),
    circle(100, 34, 20),
    p('M118 38 L140 46 L118 52 Z'),
    ellipse(66, 88, 9, 26, 18), ellipse(134, 88, 9, 26, -18),
    ellipse(84, 136, 16, 7), ellipse(116, 136, 16, 7)
  ],
  acc: [ellipse(100, 92, 22, 36), circle(92, 32, 3), circle(108, 32, 3)]
});
A.push({ // q026 GIRAFFE — long neck, ossicones
  body: [
    ellipse(84, 106, 38, 24),
    p('M112 104 Q130 64 138 42 L152 48 Q144 74 132 108 Z'),
    ellipse(146, 40, 11, 8, -15),
    stroke('M142 34 L136 18', 3.5), circle(136, 17, 4),
    stroke('M150 36 L156 20', 3.5), circle(156, 19, 4),
    p('M156 40 q10 -4 14 2 q-8 2 -12 4 Z'),
    leg(52, 34, 7), leg(68, 36, 7), leg(94, 34, 7), leg(108, 36, 7),
    p('M48 100 q-8 -2 -10 -10 q8 -1 11 8 Z')
  ],
  acc: [circle(72, 100, 5), circle(90, 110, 6), circle(66, 88, 4), circle(88, 94, 4), circle(104, 104, 4), circle(137, 58, 4), circle(131, 78, 4), circle(145, 44, 2)]
});
A.push({ // q027 DOLPHIN — arcing leap
  body: [
    p('M22 116 Q60 66 110 62 Q150 60 172 74 Q150 96 118 96 Q70 96 40 122 Q30 124 22 116 Z'),
    p('M96 62 Q108 34 126 30 Q118 48 116 62 Z'),
    p('M168 70 Q188 62 196 46 Q198 66 178 80 Z'),
    ellipse(180, 78, 8, 5, 30)
  ],
  acc: [circle(160, 68, 3)]
});
A.push({ // q028 PARROT — hooked beak, long tail
  body: [
    ellipse(104, 88, 24, 32),
    circle(112, 48, 15),
    p('M124 42 Q146 46 134 64 Q128 56 122 54 Z'),
    p('M112 34 Q118 24 126 28 Q122 36 118 40 Z'),
    ellipse(104, 92, 12, 24, 12),
    p('M96 118 L64 138 L70 140 L100 126 Z M100 124 L72 142 L80 143 L104 132 Z'),
    rect(94, 120, 5, 12, 2), rect(106, 120, 5, 12, 2)
  ],
  acc: [circle(115, 45, 3)]
});
A.push({ // q029 ELEPHANT — trunk, big ear
  body: [
    ellipse(86, 96, 46, 33),
    circle(142, 76, 22),
    ellipse(124, 68, 17, 20, 10),
    stroke('M160 84 Q166 110 154 130', 13),
    ellipse(154, 132, 9, 6, 20),
    p('M152 92 Q158 100 152 104 Q146 98 148 92 Z'),
    leg(56, 40, 14), leg(78, 44, 14), leg(102, 40, 14), leg(122, 44, 14),
    p('M42 84 q-8 -2 -10 -8 q6 -2 10 6 Z')
  ],
  acc: [circle(150, 70, 3)]
});
A.push({ // q030 KANGAROO — big tail, large feet
  body: [
    p('M84 112 Q40 120 16 138 Q48 136 74 124 Z'),
    ellipse(100, 94, 29, 33),
    circle(128, 48, 14),
    ellipse(142, 54, 9, 6, -20),
    p('M124 36 L120 20 L134 30 Z'),
    p('M118 78 Q134 74 138 86 Q126 88 120 88 Z'),
    ellipse(112, 128, 27, 9),
    ellipse(104, 130, 9, 8)
  ],
  acc: [circle(132, 45, 2.5)]
});
A.push({ // q031 FLAMINGO — one leg, S-neck
  body: [
    ellipse(100, 92, 27, 19),
    stroke('M120 86 Q142 78 134 60 Q128 44 114 48', 9),
    circle(110, 46, 10),
    p('M102 48 Q90 52 94 60 Q102 58 106 54 Z'),
    ellipse(96, 92, 14, 10, 20),
    stroke('M100 110 L100 136', 5),
    p('M92 136 L110 136', 5)
  ],
  acc: [circle(112, 44, 2.5)]
});
A.push({ // q032 OCTOPUS — dome + eight curled arms
  body: (function () {
    let s = p('M64 74 A38 40 0 0 1 140 74 Q100 92 64 74 Z') + ellipse(102, 66, 38, 36);
    const arms = [
      'M70 84 Q46 96 40 118 Q38 132 52 130',
      'M82 92 Q68 108 70 126 Q72 138 84 132',
      'M96 96 Q92 114 100 130 Q106 138 112 130',
      'M112 94 Q114 112 124 126 Q132 134 136 126',
      'M126 86 Q140 98 146 116 Q150 130 160 124',
      'M64 80 Q40 84 30 100',
      'M134 78 Q156 80 164 94',
      'M104 98 Q104 118 96 134'
    ];
    arms.forEach(function (d) { s += stroke(d, 8); });
    return [s];
  })(),
  acc: [circle(88, 56, 5), circle(116, 56, 5)]
});
A.push({ // q033 RHINOCEROS — nose horn
  body: [
    ellipse(88, 98, 48, 29),
    circle(148, 90, 18),
    ellipse(166, 96, 8, 6),
    p('M160 84 Q170 48 178 44 Q172 72 168 86 Z'),
    p('M152 78 Q156 60 162 56 Q158 72 156 82 Z'),
    p('M138 74 L134 60 L146 70 Z'),
    leg(56, 38, 14), leg(76, 42, 14), leg(102, 38, 14), leg(122, 42, 14),
    stroke('M42 92 Q34 104 36 120', 5)
  ],
  acc: [circle(156, 86, 2.5)]
});
A.push({ // q034 CHAMELEON — crest, turret eye, curled tail
  body: [
    ellipse(96, 96, 36, 19),
    circle(138, 90, 14),
    ellipse(152, 94, 7, 5),
    p('M130 80 L126 66 L136 76 Z'),
    circle(140, 80, 6),
    stroke('M64 100 Q34 100 28 82 Q26 70 38 72 Q30 82 40 90 Q52 96 66 92', 8),
    leg(84, 40, 6), leg(104, 42, 6), leg(78, 30, 6), leg(112, 30, 6)
  ],
  acc: [circle(141, 80, 2.5), p('M78 82 L84 74 L90 82 Z M94 80 L100 72 L106 80 Z M110 80 L116 73 L122 81 Z')]
});
A.push({ // q035 PORCUPINE — long quills fan
  body: (function () {
    let s = ellipse(98, 106, 40, 21) + circle(146, 104, 14) + ellipse(160, 108, 7, 5);
    for (let i = 0; i < 9; i++) {
      const a = (-150 + i * 18) * Math.PI / 180;
      const tipX = 112 + Math.cos(a) * 62;
      const tipY = 104 + Math.sin(a) * 62;
      s += p('M112 100 L' + tipX.toFixed(0) + ' ' + tipY.toFixed(0) + ' L120 110 Z');
    }
    return [s + leg(78, 30, 8) + leg(120, 30, 8)];
  })(),
  acc: [circle(154, 102, 2)]
});
A.push({ // q036 ARMADILLO — domed banded body, tapering tail
  body: [
    p('M44 132 Q56 62 104 56 Q150 52 162 118 Q150 130 128 132 Z'),
    circle(160, 118, 11),
    p('M172 120 Q186 124 194 134 Q182 134 170 128 Z'),
    ellipse(158, 104, 5, 7),
    p('M148 108 q-6 10 0 16'),
    leg(84, 24, 7), leg(112, 22, 7)
  ],
  acc: [stroke('M66 100 Q100 70 140 98', 3), stroke('M58 116 Q100 82 148 112', 3)]
});
A.push({ // q037 HIPPOPOTAMUS — huge mouth gap (cut-out), bulky
  body: [
    p('M46 118 Q46 76 88 70 L150 70 Q170 74 174 92 L174 100 Q172 108 160 108 L158 118 Q150 126 138 126 L74 126 Q46 126 46 118 Z', 'fill-rule="evenodd"'),
    ellipse(94, 62, 14, 10),
    ellipse(118, 58, 12, 9),
    leg(60, 30, 15), leg(82, 32, 15), leg(112, 30, 15), leg(134, 32, 15),
    p('M40 88 q-10 -4 -12 -12 q8 -2 13 10 Z')
  ],
  acc: [circle(160, 80, 3)]
});
A.push({ // q038 WOODPECKER — clinging to trunk, chisel beak, crest
  body: [
    rect(126, 6, 30, 138, 10),
    ellipse(92, 88, 19, 32),
    circle(92, 46, 14),
    p('M78 40 Q62 34 68 46 Q76 50 82 48 Z'),
    p('M104 46 L130 52 L104 58 Z'),
    ellipse(92, 92, 11, 24, 10),
    rect(84, 116, 10, 26, 4, -22),
    rect(78, 126, 8, 8, 2), rect(96, 126, 8, 8, 2)
  ],
  acc: [circle(96, 44, 2.5), p('M148 30 L160 44 M148 60 L160 72 M148 92 L160 104', 'fill="none" stroke-width="4"')]
});
A.push({ // q039 HUMMINGBIRD — needle beak, swept wings
  body: [
    ellipse(102, 92, 26, 13),
    circle(126, 84, 10),
    p('M134 82 L172 74 L134 88 Z'),
    p('M96 86 Q64 46 34 44 Q58 66 88 94 Z'),
    p('M100 90 Q80 72 66 70 Q82 88 98 98 Z'),
    p('M80 96 L60 108 L66 110 L84 102 Z')
  ],
  acc: [circle(128, 82, 2)]
});
A.push({ // q040 ORANGUTAN — long reaching arm, cheek flanges
  body: [
    ellipse(98, 106, 34, 31),
    circle(102, 60, 19),
    circle(85, 63, 9), circle(119, 63, 9),
    p('M120 76 Q146 56 156 30 L166 34 Q158 62 132 84 Z'),
    circle(162, 30, 8),
    p('M76 84 Q60 98 58 118 L68 120 Q72 102 82 92 Z'),
    ellipse(84, 128, 18, 10), ellipse(116, 128, 18, 10)
  ],
  acc: [circle(96, 58, 3), circle(108, 58, 3)]
});

// ---------- write files ----------
if (A.length !== 40) throw new Error('expected 40 animals, got ' + A.length);
A.forEach(function (a, i) {
  const id = 'q' + String(i + 1).padStart(3, '0');
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" aria-label="Mystery animal silhouette">' +
    '<g class="sil"><g class="body">' + a.body.join('') + '</g>' +
    (a.acc && a.acc.length ? '<g class="acc">' + a.acc.join('') + '</g>' : '') + '</g></svg>';
  fs.writeFileSync(path.join(OUT, id + '.svg'), svg);
});
console.log('wrote 40 silhouettes to assets/silhouettes/');
