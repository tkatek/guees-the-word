/*
 * controls.js — input wiring: taps/clicks on [data-action] elements,
 * keyboard (letters, Backspace, Escape), with listeners registered once.
 * Every action is delegated to the engine through main.js's action handler.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Controls = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function Controls(documentRef) {
    var doc = documentRef || document;
    this._doc = doc;
    this._handlers = [];
    this._keydown = null;
  }

  // Single delegated click listener for every [data-action] element.
  Controls.prototype.bindActions = function (onAction) {
    var self = this;
    var click = function (ev) {
      var target = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!target) return;
      // no zoom-on-double-tap surprises on touch
      if (ev.cancelable) ev.preventDefault();
      onAction(target.getAttribute('data-action'), {
        tileId: target.getAttribute('data-tile'),
        slotIndex: target.getAttribute('data-slot'),
        levelId: target.getAttribute('data-level')
      }, target);
    };
    this._doc.addEventListener('click', click);
    this._handlers.push(['click', click]);
    // pointerup fallback for touch devices where click may lag behind pointer state
    var pointer = function (ev) {
      if (ev.pointerType === 'mouse') return;
      var target = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!target) return;
      if (ev.cancelable) ev.preventDefault();
      onAction(target.getAttribute('data-action'), {
        tileId: target.getAttribute('data-tile'),
        slotIndex: target.getAttribute('data-slot'),
        levelId: target.getAttribute('data-level')
      }, target);
    };
    this._doc.addEventListener('pointerup', pointer);
    this._handlers.push(['pointerup', pointer]);
  };

  Controls.prototype.bindKeyboard = function (onKey) {
    var self = this;
    this._keydown = function (ev) {
      // stop the page from scrolling on keys the game consumes
      var k = ev.key;
      var consumed = false;
      if (k === 'Backspace' || k === 'Escape' || k === ' ') consumed = true;
      else if (k.length === 1 && k.toUpperCase() >= 'A' && k.toUpperCase() <= 'Z') consumed = true;
      var result = onKey(k, ev);
      if (result && consumed) {
        ev.preventDefault();
      }
      return result;
    };
    this._doc.addEventListener('keydown', this._keydown);
    // release transient pointer/keyboard state when the window loses focus
    this._blur = function () { self._doc.activeElement && self._doc.activeElement.blur && self._doc.activeElement.blur(); };
    window.addEventListener('blur', this._blur);
  };

  Controls.prototype.destroy = function () {
    var self = this;
    this._handlers.forEach(function (pair) { self._doc.removeEventListener(pair[0], pair[1]); });
    this._handlers = [];
    if (this._keydown) this._doc.removeEventListener('keydown', this._keydown);
    if (this._blur) window.removeEventListener('blur', this._blur);
  };

  return { Controls: Controls };
});
