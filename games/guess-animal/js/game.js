/*
 * game.js — core game logic / round state machine for "Guess the Word: Animal Mystery".
 * UI-free on purpose: the future renderer subscribes to events and reads getPublicState().
 * The host loop calls tick(now) regularly (e.g. from requestAnimationFrame or setInterval);
 * the timer only advances while phase === 'solving' and the game is not paused/hidden,
 * so pause/resume restores the precise remaining time and feedback pauses the clock.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./letters.js'), require('./storage.js'));
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Game = factory(root.AnimalMystery.Letters, root.AnimalMystery.Storage);
  }
})(typeof self !== 'undefined' ? self : this, function (Letters, Storage) {
  'use strict';

  var HEARTS_DEFAULT = 3;
  var HINT_LIMIT_DEFAULT = 1;      // one optional hint per question
  var SCORE_BASE = 100;
  var HINT_PENALTY = 25;           // per hint, reward can never drop below 0
  var NO_HINT_BONUS = 20;
  var STREAK_STEP = 10;            // +10 per consecutive correct answer after the first
  var STREAK_CAP = 40;

  function AnimalGame(opts) {
    opts = opts || {};
    this._lettersModule = opts.letters || Letters;
    this._now = opts.now || function () { return Date.now(); };
    this._hintLimit = opts.hintLimit != null ? opts.hintLimit : HINT_LIMIT_DEFAULT;
    this._store = opts.store || null;

    this._levels = (opts.levels && opts.levels.levels) || opts.levels || [];
    this._questionsById = {};
    ((opts.questions && opts.questions.questions) || opts.questions || []).forEach(function (q) {
      this._questionsById[q.id] = q;
    }, this);

    this._listeners = {};
    this._levelAttempts = {};      // levelId -> attempt counter (seed salt for banks)
    this._resetRunState();
    this.phase = 'idle';           // idle | solving | correct | wrong | level-complete | level-failed
    this.paused = false;
    this.hidden = false;
    this.streak = 0;               // session-wide, resets only on wrong submission or timeout
    this.totalScore = 0;           // sum of levelScores of completed levels this session
    this._lastNow = undefined;
  }

  AnimalGame.prototype._resetRunState = function () {
    this.level = null;
    this.levelIndex = -1;
    this.questionOrder = [];
    this.questionIndex = -1;
    this.question = null;
    this._answer = '';
    this._seed = '';
    this.tiles = [];               // [{ id, letter, used }]
    this.slots = [];               // [{ letter, locked, tileId, order }]
    this.hintsUsed = 0;
    this._placementCounter = 0;
    this.timer = null;             // { totalMs, remainingMs, running }
    this.hearts = 0;
    this.levelScore = 0;
  };

  // --- events ----------------------------------------------------------------

  AnimalGame.prototype.on = function (event, cb) {
    (this._listeners[event] || (this._listeners[event] = [])).push(cb);
    var game = this;
    return function () {
      var list = game._listeners[event] || [];
      var idx = list.indexOf(cb);
      if (idx !== -1) list.splice(idx, 1);
    };
  };

  AnimalGame.prototype._emit = function (event, payload) {
    (this._listeners[event] || []).slice().forEach(function (cb) { cb(payload); });
  };

  // --- level flow ------------------------------------------------------------

  AnimalGame.prototype.startLevel = function (levelId) {
    var idx = -1;
    for (var i = 0; i < this._levels.length; i++) {
      if (this._levels[i].id === levelId) { idx = i; break; }
    }
    if (idx < 0) throw new Error('Unknown level: ' + levelId);

    this._resetRunState();
    this.levelIndex = idx;
    this.level = this._levels[idx];
    this._attempt = (this._levelAttempts[levelId] || 0) + 1;
    this._levelAttempts[levelId] = this._attempt;
    this.hearts = this.level.hearts != null ? this.level.hearts : HEARTS_DEFAULT;
    this.levelScore = 0;
    this.paused = false;
    this.questionOrder = this._buildQuestionOrder(this.level, this._attempt);
    this._emit('level-start', { levelId: levelId, attempt: this._attempt, hearts: this.hearts });
    this._loadQuestion(0);
  };

  // First playthrough keeps the stated order; replays get a reproducible shuffle.
  AnimalGame.prototype._buildQuestionOrder = function (level, attempt) {
    var ids = level.questionIds.slice();
    if (attempt > 1) {
      var rng = this._lettersModule.createRng(this._lettersModule.hashString(level.id + '#replay#' + attempt));
      this._lettersModule.shuffle(ids, rng);
    }
    return ids;
  };

  AnimalGame.prototype._loadQuestion = function (index) {
    this.questionIndex = index;
    this.question = this._questionsById[this.questionOrder[index]];
    this._answer = String(this.question.answer).toUpperCase();
    this._seed = this.question.id + '#attempt#' + this._attempt; // deterministic per level attempt
    this.tiles = this._lettersModule.buildBank(this._answer, this.level.bank, this._seed);
    this.slots = this._answer.split('').map(function () {
      return { letter: null, locked: false, tileId: null, order: 0 };
    });
    this.hintsUsed = 0;
    this._placementCounter = 0;
    var ms = this.level.timerSeconds ? this.level.timerSeconds * 1000 : 0;
    this.timer = ms > 0 ? { totalMs: ms, remainingMs: ms, running: true } : null;
    this._lastNow = this._now();
    this.phase = 'solving';
    this.paused = false;
    this._emit('question', this.getPublicState());
  };

  // --- timer -----------------------------------------------------------------

  AnimalGame.prototype.tick = function (now) {
    if (now === undefined) now = this._now();
    if (this._lastNow === undefined) { this._lastNow = now; return; }
    var dt = now - this._lastNow;
    this._lastNow = now;
    if (this.paused || this.hidden) return;         // tab hidden / pause menu: clock frozen
    if (this.phase !== 'solving' || !this.timer) return; // feedback/celebration: clock frozen
    this.timer.remainingMs = Math.max(0, this.timer.remainingMs - dt);
    if (this.timer.remainingMs <= 0) this._onTimeout();
  };

  AnimalGame.prototype._onTimeout = function () {
    if (this.phase !== 'solving' || !this.timer) return; // fires exactly once per timeout
    this.streak = 0;
    this.hearts -= 1;
    this._emit('timeout', { levelId: this.level.id, hearts: this.hearts });
    if (this.hearts <= 0) { this._failLevel(); return; }
    // Same question, same deterministic bank, fresh timer, cleared attempt.
    this._clearPlacements();
    this.timer.remainingMs = this.timer.totalMs;
    this._lastNow = this._now();
    this._emit('question-restarted', this.getPublicState());
  };

  // --- player input ------------------------------------------------------------

  AnimalGame.prototype.selectTile = function (tileId) {
    if (this.phase !== 'solving' || this.paused || this.hidden) return false;
    var tile = null;
    for (var i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].id === tileId) { tile = this.tiles[i]; break; }
    }
    if (!tile || tile.used) return false;
    var slot = null, slotIndex = -1;
    for (var s = 0; s < this.slots.length; s++) {
      if (!this.slots[s].locked && this.slots[s].letter === null) { slot = this.slots[s]; slotIndex = s; break; }
    }
    if (!slot) return false;
    tile.used = true;
    slot.letter = tile.letter;
    slot.tileId = tile.id;
    slot.order = ++this._placementCounter;
    this._emit('place', { tileId: tile.id, slotIndex: slotIndex, letter: tile.letter });
    if (this._isBoardFull()) this._submit();
    return true;
  };

  // Keyboard path: press a letter key -> first unused matching tile.
  AnimalGame.prototype.selectLetter = function (letter) {
    var l = String(letter).toUpperCase();
    for (var i = 0; i < this.tiles.length; i++) {
      if (!this.tiles[i].used && this.tiles[i].letter === l) return this.selectTile(this.tiles[i].id);
    }
    return false;
  };

  AnimalGame.prototype.undoSlot = function (index) {
    if (this.phase !== 'solving' || this.paused) return false;
    var slot = this.slots[index];
    if (!slot || slot.locked || slot.letter === null) return false;
    this._freeSlot(slot);
    this._emit('undo', { slotIndex: index });
    return true;
  };

  // Backspace: remove the most recently entered letter.
  AnimalGame.prototype.undoRecent = function () {
    var bestOrder = -1, bestIdx = -1;
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (!s.locked && s.letter !== null && s.order > bestOrder) { bestOrder = s.order; bestIdx = i; }
    }
    return bestIdx >= 0 ? this.undoSlot(bestIdx) : false;
  };

  AnimalGame.prototype.clearAll = function () {
    if (this.phase !== 'solving' || this.paused) return false;
    var any = false;
    for (var i = 0; i < this.slots.length; i++) {
      if (!this.slots[i].locked && this.slots[i].letter !== null) {
        this._freeSlot(this.slots[i]);
        any = true;
      }
    }
    if (any) this._emit('clear', {});
    return any;
  };

  /*
   * One optional hint per question: reveal the correct letter in the first available
   * blank, consume its unused tile and lock that slot. If the last copy of the needed
   * letter sits in a player-filled wrong slot, free that copy first so the layout
   * always stays winnable.
   */
  AnimalGame.prototype.useHint = function () {
    if (this.phase !== 'solving' || this.paused || this.hidden) return false;
    if (this.hintsUsed >= this._hintLimit) return false;
    var idx = -1;
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i].letter === null) { idx = i; break; }
    }
    if (idx < 0) return false;

    var needed = this._answer[idx];
    var tile = this._findUnusedTile(needed);
    if (!tile) {
      var bestOrder = -1, bestIdx = -1;
      for (var s = 0; s < this.slots.length; s++) {
        var slot = this.slots[s];
        if (!slot.locked && slot.letter === needed && slot.order > bestOrder) { bestOrder = slot.order; bestIdx = s; }
      }
      if (bestIdx < 0) return false; // impossible with a valid bank
      this._freeSlot(this.slots[bestIdx]);
      tile = this._findUnusedTile(needed);
      if (!tile) return false;
    }

    tile.used = true;
    var target = this.slots[idx];
    target.letter = needed;
    target.locked = true;
    target.tileId = tile.id;
    target.order = 0;
    this.hintsUsed += 1;
    this._emit('hint', { slotIndex: idx, letter: needed });
    if (this._isBoardFull()) this._submit();
    return true;
  };

  // --- submission ----------------------------------------------------------------

  AnimalGame.prototype._isBoardFull = function () {
    for (var i = 0; i < this.slots.length; i++) {
      if (this.slots[i].letter === null) return false;
    }
    return true;
  };

  AnimalGame.prototype._submit = function () {
    if (this.phase !== 'solving') return; // no double submission / rapid taps during feedback
    var guess = '';
    for (var i = 0; i < this.slots.length; i++) guess += this.slots[i].letter || '';
    if (guess.toUpperCase() === this._answer) this._onCorrect();
    else this._onWrong();
  };

  AnimalGame.prototype._onCorrect = function () {
    this.phase = 'correct'; // locks input until the host calls advanceAfterSuccess()
    this.streak += 1;
    var noHint = this.hintsUsed === 0;
    var base = Math.max(0, SCORE_BASE - HINT_PENALTY * this.hintsUsed);
    var bonus = noHint ? NO_HINT_BONUS : 0;
    var streakBonus = this.streak > 1 ? Math.min(STREAK_CAP, STREAK_STEP * (this.streak - 1)) : 0;
    var reward = base + bonus + streakBonus;
    this.levelScore += reward;
    this._emit('correct', {
      reward: reward, base: base, bonus: bonus, streakBonus: streakBonus,
      streak: this.streak, levelScore: this.levelScore,
      animal: this.question.animal, fact: this.question.fact
    });
  };

  // Called by the host after the (skippable) celebration to move on.
  AnimalGame.prototype.advanceAfterSuccess = function () {
    if (this.phase !== 'correct') return false;
    if (this.questionIndex + 1 < this.questionOrder.length) {
      this._loadQuestion(this.questionIndex + 1);
      return true;
    }
    this._completeLevel();
    return true;
  };

  AnimalGame.prototype._onWrong = function () {
    this.phase = 'wrong'; // locks input; heart deducted exactly once per wrong word
    this.streak = 0;
    this.hearts -= 1;
    this._emit('wrong', { hearts: this.hearts, message: 'Try again!' });
    if (this.hearts <= 0) this._failLevel();
  };

  // Called by the host after the shake animation: clear the attempt, keep the same bank.
  AnimalGame.prototype.resolveWrong = function () {
    if (this.phase !== 'wrong') return false;
    this._clearPlacements();
    this.phase = 'solving';
    this._lastNow = this._now();
    this._emit('resume-solving', this.getPublicState());
    return true;
  };

  AnimalGame.prototype._completeLevel = function () {
    this.phase = 'level-complete';
    var stars = Math.max(1, Math.min(3, this.hearts)); // passing always leaves >= 1 heart
    this.totalScore += this.levelScore;
    var best = null;
    if (this._store) best = this._store.recordLevelResult(this.level.id, stars, this.levelScore);
    if (this._store && this.levelIndex + 1 < this._levels.length) {
      this._store.unlockLevel(this._levels[this.levelIndex + 1].id);
    }
    this._emit('level-complete', {
      levelId: this.level.id, stars: stars, score: this.levelScore,
      totalScore: this.totalScore, best: best
    });
  };

  AnimalGame.prototype._failLevel = function () {
    this.phase = 'level-failed';
    this._emit('level-failed', { levelId: this.level.id, score: this.levelScore });
  };

  // Hearts reset and a new deterministic seed salt; stored bests are never touched.
  AnimalGame.prototype.retryLevel = function () {
    if (this.phase !== 'level-failed') return false;
    this.startLevel(this.level.id);
    return true;
  };

  // --- pause / visibility -----------------------------------------------------

  AnimalGame.prototype.pause = function () {
    if (this.paused) return false;
    this.paused = true;
    this._emit('pause', {});
    return true;
  };

  AnimalGame.prototype.resume = function () {
    if (!this.paused) return false;
    this.paused = false;
    this._lastNow = this._now(); // resume with the exact remaining time, no jump
    this._emit('resume', {});
    return true;
  };

  AnimalGame.prototype.setHidden = function (hidden) {
    var h = !!hidden;
    if (this.hidden === h) return;
    this.hidden = h;
    this._emit('visibility', { hidden: h });
  };

  // --- keyboard ----------------------------------------------------------------

  AnimalGame.prototype.handleKey = function (key) {
    if (typeof key !== 'string' || key === '') return false;
    if (key.length === 1) {
      var c = key.toUpperCase();
      if (c >= 'A' && c <= 'Z') return this.selectLetter(c);
      return false;
    }
    if (key === 'Backspace' || key === 'Delete') return this.undoRecent();
    if (key === 'Escape') return this.paused ? this.resume() : this.pause();
    return false;
  };

  // --- internals ------------------------------------------------------------------

  AnimalGame.prototype._findUnusedTile = function (letter) {
    for (var i = 0; i < this.tiles.length; i++) {
      if (!this.tiles[i].used && this.tiles[i].letter === letter) return this.tiles[i];
    }
    return null;
  };

  AnimalGame.prototype._freeSlot = function (slot) {
    for (var i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].id === slot.tileId) { this.tiles[i].used = false; break; }
    }
    slot.letter = null;
    slot.tileId = null;
    slot.order = 0;
  };

  AnimalGame.prototype._clearPlacements = function () {
    for (var i = 0; i < this.slots.length; i++) {
      if (!this.slots[i].locked && this.slots[i].letter !== null) this._freeSlot(this.slots[i]);
    }
  };

  // Snapshot for the renderer. NEVER contains the answer, and the animal name/fact
  // only appear after success has resolved.
  AnimalGame.prototype.getPublicState = function () {
    var revealed = null;
    if ((this.phase === 'correct' || this.phase === 'level-complete') && this.question) {
      revealed = { animal: this.question.animal, fact: this.question.fact };
    }
    return {
      phase: this.phase,
      paused: this.paused,
      hidden: this.hidden,
      levelId: this.level ? this.level.id : null,
      levelName: this.level ? this.level.name : null,
      levelIndex: this.levelIndex,
      questionIndex: this.questionIndex,
      questionCount: this.questionOrder.length,
      hearts: this.hearts,
      heartsMax: this.level && this.level.hearts != null ? this.level.hearts : HEARTS_DEFAULT,
      levelScore: this.levelScore,
      totalScore: this.totalScore,
      streak: this.streak,
      hintsUsed: this.hintsUsed,
      hintLimit: this._hintLimit,
      hintAvailable: this.hintsUsed < this._hintLimit && this.phase === 'solving',
      timer: this.timer ? {
        totalMs: this.timer.totalMs,
        remainingMs: this.timer.remainingMs,
        running: this.timer.running && this.phase === 'solving' && !this.paused && !this.hidden
      } : null,
      slots: this.slots.map(function (s) { return { letter: s.letter, locked: s.locked }; }),
      tiles: this.tiles.map(function (t) { return { id: t.id, letter: t.letter, used: t.used }; }),
      hint: this.question ? this.question.hint : null,
      silhouetteAsset: this.question ? this.question.silhouetteAsset : null,
      revealed: revealed
    };
  };

  return { AnimalGame: AnimalGame };
});
