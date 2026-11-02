/*
 * letters.js — deterministic letter-bank generation for "Guess the Word: Animal Mystery".
 * Browser: attaches AnimalMystery.Letters.  Node (tests): module.exports.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Letters = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Weighted pool of plausible English/animal-name letters (vowels appear more often).
  var DISTRACTOR_POOL = 'AAEEIIOOUUBCDGGHKLMNPRSTWY';

  // xmur3 string hash -> 32-bit seed, so a seed can be derived from e.g. "q021#attempt#1".
  function hashString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // mulberry32 seeded RNG: same seed -> same sequence, everywhere.
  function createRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fisher–Yates shuffle, in place.
  function shuffle(array, rng) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  // Bank size rule: clamp(answerLength + extra, min, max). L01–L03 use min=max=9 -> always 9.
  function computeBankSize(rule, answerLength) {
    var target = answerLength + (rule.extra || 0);
    return Math.min(rule.max, Math.max(rule.min, target));
  }

  function requiredLetterCounts(word) {
    var counts = {};
    for (var i = 0; i < word.length; i++) {
      counts[word[i]] = (counts[word[i]] || 0) + 1;
    }
    return counts;
  }

  // The bank must always contain at least the exact multiset of the answer's letters.
  function bankContainsAnswer(tiles, answer) {
    var need = requiredLetterCounts(answer);
    for (var i = 0; i < tiles.length; i++) {
      var letter = tiles[i].letter;
      if (need[letter] !== undefined) {
        need[letter] -= 1;
      }
    }
    return Object.keys(need).every(function (k) { return need[k] <= 0; });
  }

  function spellsAnswerAtHead(tiles, answer) {
    if (tiles.length < answer.length) return false;
    for (var i = 0; i < answer.length; i++) {
      if (tiles[i].letter !== answer[i]) return false;
    }
    return true;
  }

  /*
   * Build a shuffled bank of tiles for one question.
   * - starts from the EXACT multiset of answer letters (repeats included),
   * - fills the rest with distractors,
   * - Fisher–Yates shuffles with the given seed (string) so undo/retry never
   *   regenerates a different bank mid-round,
   * - never leaves the answer spelled in order at the head of the bank.
   */
  function buildBank(answer, bankRule, seed) {
    var word = String(answer).toUpperCase();
    var answerLetters = word.split('');
    var size = computeBankSize(bankRule, answerLetters.length);
    var rng = createRng(hashString(String(seed)));

    var distractors = [];
    for (var d = 0; d < size - answerLetters.length; d++) {
      distractors.push(DISTRACTOR_POOL[Math.floor(rng() * DISTRACTOR_POOL.length)]);
    }

    var tiles = answerLetters.concat(distractors).map(function (letter, i) {
      return { id: 't' + i, letter: letter, used: false };
    });

    var guard = 0;
    do {
      shuffle(tiles, rng);
      guard += 1;
    } while (spellsAnswerAtHead(tiles, word) && guard < 10);

    return tiles;
  }

  // Grid layout helper for the renderer's PHONE stack: 9 tiles -> the approved
  // 3x3; 10-12 -> 6 columns (two keyboard-like rows, banks are capped at 12);
  // anything larger -> 4 columns (defensive; the data contract never exceeds 12).
  function gridColumns(tileCount) {
    return tileCount <= 9 ? 3 : tileCount <= 12 ? 6 : 4;
  }

  return {
    DISTRACTOR_POOL: DISTRACTOR_POOL,
    hashString: hashString,
    createRng: createRng,
    shuffle: shuffle,
    computeBankSize: computeBankSize,
    requiredLetterCounts: requiredLetterCounts,
    bankContainsAnswer: bankContainsAnswer,
    buildBank: buildBank,
    gridColumns: gridColumns
  };
});
