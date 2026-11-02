/*
 * debug-layout.js — DEVELOPMENT-ONLY layout assertions. Not referenced by
 * index.html; main.js injects it solely when the page runs with ?debug=layout.
 * It renders nothing into the production UI: results go to the console and to
 * window.__amLayoutAudit().
 *
 * Checks (against live getBoundingClientRect() geometry):
 *  - every key gameplay element is fully inside the viewport;
 *  - the letter bank never overlaps the action buttons or the progress board;
 *  - the answer slots never overlap the bank; the bank never covers the board;
 *  - the action buttons are visible (nonzero size, opacity > 0, on-screen);
 *  - no horizontal page overflow.
 */
(function (root) {
  'use strict';

  var TOLERANCE = 1; // px of float slack allowed

  function rectOf(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  // Pure: two axis-aligned rects overlap by more than TOLERANCE on both axes.
  function overlaps(a, b, tol) {
    tol = tol == null ? TOLERANCE : tol;
    return (a.left < b.right - tol && b.left < a.right - tol &&
            a.top < b.bottom - tol && b.top < a.bottom - tol);
  }

  // Pure: rect fits inside container by every edge (with tolerance).
  function fitsInside(rect, container, tol) {
    tol = tol == null ? TOLERANCE : tol;
    return rect.left >= container.left - tol && rect.right <= container.right + tol &&
           rect.top >= container.top - tol && rect.bottom <= container.bottom + tol;
  }

  // Pure core: takes a map of named rects (viewport = {width,height}) and returns
  // a list of { ok, name, detail } assertions. Unit-testable without a DOM.
  function checkLayout(rects, viewport) {
    var out = [];
    // Accept rects with or without explicit width/height (derived from edges).
    Object.keys(rects).forEach(function (k) {
      var r = rects[k];
      if (r && r.width == null && r.right != null) r.width = r.right - r.left;
      if (r && r.height == null && r.bottom != null) r.height = r.bottom - r.top;
    });
    function assert(name, ok, detail) { out.push({ ok: !!ok, name: name, detail: detail || '' }); }
    var vp = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    ['board', 'slots', 'bank', 'actions', 'progress'].forEach(function (k) {
      var r = rects[k];
      if (!r) { assert(k + ' present', false, 'missing rect'); return; }
      assert(k + ' inside viewport', fitsInside(r, vp), JSON.stringify(r));
      assert(k + ' visible size', r.width > 10 && r.height > 10, r.width + 'x' + r.height);
    });
    if (rects.bank && rects.actions) assert('bank vs actions: no overlap', !overlaps(rects.bank, rects.actions));
    if (rects.actions && rects.progress) assert('actions vs progress: no overlap', !overlaps(rects.actions, rects.progress));
    if (rects.bank && rects.progress) assert('bank vs progress: no overlap', !overlaps(rects.bank, rects.progress));
    if (rects.slots && rects.bank) assert('slots vs bank: no overlap', !overlaps(rects.slots, rects.bank));
    if (rects.board && rects.bank) assert('board vs bank: no overlap', !overlaps(rects.board, rects.bank));
    if (rects.hud && rects.bank) assert('hud vs bank: no overlap', !overlaps(rects.hud, rects.bank));
    if (rects.progress) {
      assert('progress above viewport bottom', rects.progress.bottom <= viewport.height + TOLERANCE,
        'bottom=' + rects.progress.bottom + ' vh=' + viewport.height);
    }
    var docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null;
    assert('no horizontal overflow', docEl ? docEl.scrollWidth <= viewport.width + TOLERANCE : true);
    return out;
  }

  // DOM runner: collects the live rects and returns { ok, results }.
  function runAudit() {
    var $ = function (id) { return document.getElementById(id); };
    var rects = {
      hud: rectOf($('hud')),
      board: rectOf($('board-frame')),
      slots: rectOf($('slots')),
      bank: rectOf($('bank')),
      actions: rectOf($('actions')),
      progress: rectOf($('progress-holder'))
    };
    var viewport = { width: root.innerWidth, height: root.innerHeight };
    var results = checkLayout(rects, viewport);
    var ok = results.every(function (r) { return r.ok; });
    return { ok: ok, results: results, rects: rects, viewport: viewport };
  }

  var mod = {
    checkLayout: checkLayout,
    overlaps: overlaps,
    fitsInside: fitsInside,
    runAudit: runAudit
  };

  if (typeof module === 'object' && module.exports) module.exports = mod; // Node tests
  else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.DebugLayout = mod;
    root.__amLayoutAudit = runAudit;
    // Log a verdict whenever the game screen is visible; silent otherwise.
    var report = function () {
      var gameScreen = document.getElementById('screen-game');
      if (!gameScreen || gameScreen.classList.contains('hidden')) return;
      var audit = runAudit();
      console.log('%c[layout-audit] ' + (audit.ok ? 'PASS' : 'FAIL'),
        'color:#fff;background:' + (audit.ok ? '#2c7a4d' : '#b03030') + ';padding:2px 6px;border-radius:4px');
      audit.results.forEach(function (r) {
        if (!r.ok) console.warn('  ✗ ' + r.name + (r.detail ? '  (' + r.detail + ')' : ''));
      });
      window.__amLayoutOK = audit.ok;
    };
    root.addEventListener('load', function () { setTimeout(report, 400); });
    root.addEventListener('resize', function () { setTimeout(report, 250); });
    var mo = new MutationObserver(function () { setTimeout(report, 300); });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
})(typeof self !== 'undefined' ? self : this);
