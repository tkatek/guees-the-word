/*
 * storage.js — progress persistence for "Guess the Word: Animal Mystery".
 * Best stars / best score per level are never downgraded; unlocking is forward-only.
 * The spendable star wallet (starBalance) is separate from best scores/trophies:
 * spending hints never touches level ratings or unlock state.
 * Falls back to in-memory storage when localStorage is unavailable (private mode, tests).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Storage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'animal-mystery-progress-v1';
  var STARTER_STARS = 100;        // one-time welcome credit for a brand-new wallet

  function MemoryStorage() {
    this._data = {};
  }
  MemoryStorage.prototype.getItem = function (k) {
    return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null;
  };
  MemoryStorage.prototype.setItem = function (k, v) { this._data[k] = String(v); };
  MemoryStorage.prototype.removeItem = function (k) { delete this._data[k]; };

  function defaultData() {
    return {
      version: 1,
      soundOn: true,
      levels: {
        L01: { unlocked: true, bestStars: 0, bestScore: 0 }
      }
    };
  }

  function ProgressStore(storageImpl) {
    this._storage = storageImpl || ProgressStore.detectLocalStorage() || new MemoryStorage();
  }

  ProgressStore.detectLocalStorage = function () {
    var candidates = [];
    try { if (typeof root !== 'undefined' && root.localStorage) candidates.push(root.localStorage); } catch (e) { /* access may throw in some webviews */ }
    try { if (typeof localStorage !== 'undefined' && localStorage) candidates.push(localStorage); } catch (e) { /* ignore */ }
    for (var i = 0; i < candidates.length; i++) {
      try {
        candidates[i].setItem('__am_probe__', '1');
        candidates[i].removeItem('__am_probe__');
        return candidates[i];
      } catch (e) { /* private mode etc. */ }
    }
    return null;
  };

  ProgressStore.prototype._read = function () {
    try {
      var raw = this._storage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.levels) return defaultData();
      return parsed;
    } catch (e) {
      return defaultData(); // corrupted data must never break the game
    }
  };

  ProgressStore.prototype._write = function (data) {
    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage full / unavailable: keep playing in memory */ }
  };

  ProgressStore.prototype.getData = function () {
    var data = defaultData();
    var stored = this._read();
    data.soundOn = stored.soundOn !== false;
    // Wallet: absent only on legacy saves (pre-wallet) or brand-new profiles —
    // resolved once by ensureWallet(), which also grants the one-time starter stars.
    if (typeof stored.starBalance === 'number' && stored.starBalance >= 0) {
      data.starBalance = Math.floor(stored.starBalance);
    }
    if (stored.starterStarsGranted === true) data.starterStarsGranted = true;
    Object.keys(stored.levels || {}).forEach(function (id) {
      var s = stored.levels[id];
      if (!s || typeof s !== 'object') return;
      var entry = data.levels[id] || (data.levels[id] = { unlocked: false, bestStars: 0, bestScore: 0 });
      entry.unlocked = entry.unlocked || s.unlocked === true;
      entry.bestStars = Math.max(entry.bestStars, s.bestStars || 0);
      entry.bestScore = Math.max(entry.bestScore, s.bestScore || 0);
    });
    data.levels.L01.unlocked = true;
    return data;
  };

  ProgressStore.prototype.isUnlocked = function (levelId) {
    var entry = this.getData().levels[levelId];
    return !!entry && entry.unlocked === true;
  };

  ProgressStore.prototype.getBestStars = function (levelId) {
    var entry = this.getData().levels[levelId];
    return entry ? entry.bestStars || 0 : 0;
  };

  ProgressStore.prototype.getBestScore = function (levelId) {
    var entry = this.getData().levels[levelId];
    return entry ? entry.bestScore || 0 : 0;
  };

  ProgressStore.prototype.unlockLevel = function (levelId) {
    var data = this.getData();
    var entry = data.levels[levelId] || (data.levels[levelId] = { unlocked: false, bestStars: 0, bestScore: 0 });
    if (entry.unlocked) return false; // forward-only
    entry.unlocked = true;
    this._write(data);
    return true;
  };

  // Records a finished level. Bests are kept as maximums, so a retry can never
  // overwrite prior best progress.
  ProgressStore.prototype.recordLevelResult = function (levelId, stars, score) {
    var data = this.getData();
    var entry = data.levels[levelId] || (data.levels[levelId] = { unlocked: true, bestStars: 0, bestScore: 0 });
    var improvedStars = Math.max(0, Math.min(3, stars)) > entry.bestStars;
    var improvedScore = Math.max(0, score | 0) > entry.bestScore;
    entry.bestStars = Math.max(entry.bestStars, Math.max(0, Math.min(3, stars)));
    entry.bestScore = Math.max(entry.bestScore, Math.max(0, score | 0));
    this._write(data);
    return { bestStars: entry.bestStars, bestScore: entry.bestScore, improvedStars: improvedStars, improvedScore: improvedScore };
  };

  /* ---------------- spendable star wallet ----------------
   * Separate from bestStars/bestScore on purpose: the wallet pays for hints,
   * trophies are never spendable. All writes persist immediately so a reload
   * can never refund a spent hint or re-grant the starter credit. */

  // Brings a (possibly legacy / brand-new) save up to the wallet schema exactly
  // once: legacy players keep their progress and receive the same one-time
  // starter credit (they never had a wallet to double-dip from).
  ProgressStore.prototype.ensureWallet = function () {
    var data = this.getData();
    if (typeof data.starBalance === 'number') return false;
    data.starBalance = data.starterStarsGranted === true ? 0 : STARTER_STARS;
    data.starterStarsGranted = true;
    this._write(data);
    return true; // wallet was created this call (starter credit included)
  };

  ProgressStore.prototype.getStarBalance = function () {
    this.ensureWallet();
    return this.getData().starBalance;
  };

  ProgressStore.prototype.addStars = function (amount) {
    this.ensureWallet();
    var data = this.getData();
    var add = Math.max(0, amount | 0);
    data.starBalance = Math.min(999999, data.starBalance + add);
    this._write(data);
    return data.starBalance;
  };

  // Returns { ok, balance }: ok=false leaves the balance untouched (never negative).
  ProgressStore.prototype.spendStars = function (amount) {
    this.ensureWallet();
    var data = this.getData();
    var cost = Math.max(0, amount | 0);
    if (data.starBalance < cost) return { ok: false, balance: data.starBalance };
    data.starBalance -= cost;
    this._write(data);
    return { ok: true, balance: data.starBalance };
  };

  ProgressStore.prototype.getSoundOn = function () {
    return this.getData().soundOn !== false;
  };

  ProgressStore.prototype.setSoundOn = function (on) {
    var data = this.getData();
    data.soundOn = on !== false;
    this._write(data);
    return data.soundOn;
  };

  ProgressStore.prototype.reset = function () {
    try { this._storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  };

  return { ProgressStore: ProgressStore, MemoryStorage: MemoryStorage, STORAGE_KEY: STORAGE_KEY, STARTER_STARS: STARTER_STARS };
});
