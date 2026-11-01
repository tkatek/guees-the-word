/*
 * asset-map.js — neutral per-question asset metadata for the renderer.
 * c1 = body color, c2 = accent color used when the silhouette is revealed.
 * Keys are neutral question ids; no animal names appear here.
 * Browser: window.AnimalMystery.Assets. Node (tests): module.exports.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Assets = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ART = {
    board: 'assets/art/board.png',
    progress: 'assets/art/progress.png'
  };

  var ANIMALS_BASE = 'assets/animals/';

  // Neutral qid -> local illustration URL (q001.svg … q040.svg).
  function animalUrl(questionId) {
    return ANIMALS_BASE + questionId + '.svg';
  }

  var COLORS = {
    q001: { c1: '#F2A65A', c2: '#FBE3C5' },
    q002: { c1: '#C89B6B', c2: '#8A5A2B' },
    q003: { c1: '#F7A8B8', c2: '#E56A8A' },
    q004: { c1: '#F5F1E8', c2: '#4A4A4A' },
    q005: { c1: '#FFE066', c2: '#F9A825' },
    q006: { c1: '#7BC96F', c2: '#4E9B47' },
    q007: { c1: '#5BB8E8', c2: '#2E7FB8' },
    q008: { c1: '#EDE6DA', c2: '#D64545' },
    q009: { c1: '#E5A33B', c2: '#8A5A2B' },
    q010: { c1: '#8A5A33', c2: '#5C3A1E' },
    q011: { c1: '#D9CBB6', c2: '#8A7A5F' },
    q012: { c1: '#C89B6B', c2: '#F5EFE0' },
    q013: { c1: '#9C6B3F', c2: '#6E4526' },
    q014: { c1: '#F2EDE4', c2: '#3B3B3B' },
    q015: { c1: '#6FBF73', c2: '#3F8F4A' },
    q016: { c1: '#C6C1B8', c2: '#F7C6D0' },
    q017: { c1: '#F28C28', c2: '#2B2B2B' },
    q018: { c1: '#F5F5F0', c2: '#2B2B2B' },
    q019: { c1: '#F5F5F0', c2: '#1A1A1A' },
    q020: { c1: '#A8B5B0', c2: '#6E7F78' },
    q021: { c1: '#EDE1D6', c2: '#F5C1CB' },
    q022: { c1: '#A9814F', c2: '#7A5C36' },
    q023: { c1: '#6DA544', c2: '#4E7F2E' },
    q024: { c1: '#D9A45B', c2: '#B57F3B' },
    q025: { c1: '#2E3440', c2: '#F5F5F0' },
    q026: { c1: '#F0B429', c2: '#B06F22' },
    q027: { c1: '#6FB8E8', c2: '#3E8FC0' },
    q028: { c1: '#E64980', c2: '#F4A63B' },
    q029: { c1: '#9AA5B1', c2: '#76818C' },
    q030: { c1: '#C9995F', c2: '#A87A42' },
    q031: { c1: '#F477AB', c2: '#E85D93' },
    q032: { c1: '#B06FD4', c2: '#8A4FB0' },
    q033: { c1: '#9AA0A6', c2: '#6E747A' },
    q034: { c1: '#7ED957', c2: '#4FB32F' },
    q035: { c1: '#8A6F4D', c2: '#5C4632' },
    q036: { c1: '#D9B489', c2: '#B08D5F' },
    q037: { c1: '#9AA5B1', c2: '#76818C' },
    q038: { c1: '#2E3440', c2: '#E64980' },
    q039: { c1: '#57C7A8', c2: '#2E9B7F' },
    q040: { c1: '#C4622D', c2: '#96471F' }
  };

  function colorsFor(questionId) {
    return COLORS[questionId] || { c1: '#E5A33B', c2: '#8A5A2B' };
  }

  // Preload an image without showing it (returns a promise).
  function preload(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(false);
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  return { ART: ART, ANIMALS_BASE: ANIMALS_BASE, animalUrl: animalUrl, COLORS: COLORS, colorsFor: colorsFor, preload: preload };
});
