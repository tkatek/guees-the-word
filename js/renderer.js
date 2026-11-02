/*
 * renderer.js — paints the game from AnimalGame.getPublicState() snapshots.
 * Pure DOM: keyed tiles/slots, arcade HUD badges, sprite answer slots,
 * glossy letter tiles, numbered progress markers, modals.
 * The animal illustration mount (#animal-mount) stays EMPTY until real
 * animal artwork is integrated — no drawn/fallback creatures, no image
 * requests that could 404. NEVER reads engine internals; the answer/animal
 * never exist in the DOM before the engine reports success.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnimalMystery = root.AnimalMystery || {};
    root.AnimalMystery.Renderer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var Letters = (typeof AnimalMystery !== 'undefined' && AnimalMystery.Letters) || null;
  var HEART = '♥';
  var STAR_LIT = '★';
  var STAR_OFF = '☆';

  function $(id) { return document.getElementById(id); }

  function Renderer(assets) {
    this.assets = assets;
    this.el = {
      screens: {
        loading: $('screen-loading'), error: $('screen-error'),
        home: $('screen-home'), levels: $('screen-levels'), game: $('screen-game')
      },
      hud: {
        level: $('hud-level'), question: $('hud-question'), hearts: $('hud-hearts'),
        timer: $('hud-timer'), timerText: $('timer-text'), score: $('hud-score'),
        practice: $('hud-practice')
      },
      boardFrame: $('board-frame'), animalMount: $('animal-mount'),
      bubble: $('bubble'), slots: $('slots'), bank: $('bank'),
      stage: $('stage'),
      btnHint: $('btn-hint'), levelGrid: $('level-grid'),
      progressTitle: $('progress-title'), progressMarkers: $('progress-markers'),
      overlay: $('modal-overlay'), modal: $('modal'), app: $('app'),
      boardZone: $('board-zone')
    };
    this._lastTiles = null;
    this._lastSlots = null;
    this._step = -1;
    this._bubbleTimer = null;
    this._toastTimer = null;
  }

  Renderer.prototype.showScreen = function (name) {
    var s = this.el.screens;
    Object.keys(s).forEach(function (k) { s[k].classList.toggle('hidden', k !== name); });
  };

  Renderer.prototype.showError = function (message) {
    $('error-msg').textContent = message;
    this.showScreen('error');
  };

  Renderer.prototype.setSound = function (on) {
    // every sound button carries .btn-sound (home corner, levels header, settings modal)
    var btns = document.querySelectorAll('.btn-sound');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-off', !on);
      b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // live label inside the settings dialog, when it is open
    var state = document.getElementById('settings-sound-state');
    if (state) state.textContent = on ? 'On' : 'Off';
  };

  /* ---------------- level select ---------------- */

  var LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg>';
  var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.2v13.6L19.5 12 8 5.2z"/></svg>';

  // All ten cards share ONE blank wooden-and-leaf artwork (assets/art/level-card-ui.png,
  // the padding-cropped 768px build-time copy of level-card.png). Dynamic text is
  // layered on top and aligned to the artwork's own plaque/cream geometry via CSS
  // percentages (see tools/optimize-level-card.js for the measured geometry).
  Renderer.prototype.renderLevels = function (levels, store, currentLevelId) {
    var grid = this.el.levelGrid;
    grid.innerHTML = '';
    levels.forEach(function (lvl, i) {
      var unlocked = store.isUnlocked(lvl.id);
      var stars = store.getBestStars(lvl.id);
      var best = store.getBestScore(lvl.id);
      var isCurrent = lvl.id === currentLevelId;
      var count = (lvl.questionIds || []).length;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'level-card' + (unlocked ? '' : ' locked') + (isCurrent ? ' current' : '');
      card.setAttribute('data-action', unlocked ? 'start-level' : 'locked-level');
      card.setAttribute('data-level', lvl.id);
      card.setAttribute('aria-label', unlocked
        ? 'Level ' + (i + 1) + ' ' + lvl.name + ', ' + count + ' animals, ' +
          stars + ' of 3 stars' + (best ? ', best ' + best + ' points' : '') +
          (isCurrent ? ', next level' : '')
        : 'Level ' + (i + 1) + ' ' + lvl.name + ' locked. Complete Level ' + i + ' first.');
      var starsHtml = '';
      for (var s = 1; s <= 3; s++) {
        starsHtml += '<span class="' + (s <= stars ? 'lit' : 'off') + '" aria-hidden="true">' + STAR_LIT + '</span>';
      }
      card.innerHTML =
        '<img class="lv-art" src="assets/art/level-card-ui.png" alt="" draggable="false">' +
        '<span class="lv-plaque">Level ' + (i + 1) + '</span>' +
        '<span class="lv-name">' + lvl.name + '</span>' +
        '<span class="lv-animals">' + count + ' animals</span>' +
        '<span class="lv-stars">' + starsHtml + '</span>' +
        (unlocked
          ? (isCurrent ? '<span class="lv-play">' + PLAY_ICON + '</span>' : '')
          : '<span class="lv-lock">' + LOCK_ICON + '</span>');
      grid.appendChild(card);
    });
  };

  // Small wooden toast pinned under the level-screen header (locked-card feedback).
  Renderer.prototype.showLevelsToast = function (text) {
    var screen = this.el.screens.levels;
    if (!screen) return;
    var toast = screen.querySelector('.levels-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'levels-toast';
      screen.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth; // restart the entrance animation
    toast.classList.add('show');
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
    var t = toast;
    this._toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  };

  /* ---------------- gameplay ---------------- */

  Renderer.prototype.renderQuestion = function (state) {
    var e = this.el;
    var wordLength = state.slots.length;
    // Two real layout modes, chosen from QUESTION CONTENT (not the level number):
    // advanced = long answer or a big letter bank; CSS picks side-panel vs stack by viewport.
    e.stage.classList.toggle('game--advanced', wordLength >= 8 || state.tiles.length >= 12);
    e.hud.level.textContent = 'LEVEL ' + (state.levelIndex + 1);
    e.hud.question.textContent = 'Q ' + (state.questionIndex + 1) + '/' + state.questionCount;
    e.hud.timer.classList.toggle('hidden', !state.timer);
    e.hud.practice.classList.toggle('hidden', !!state.timer);
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderAnimalMount(state);
    this._renderSlots(state.slots, true);
    this._renderBank(state.tiles, true);
    this._renderActions(state);
    this.hideBubble();
    this._scheduleFitCheck();
  };

  /*
   * Real-space check for the centered stack: if the stage content is taller than
   * the reserved stage box (would collide with the bottom progress board), add
   * .game--tight so CSS compresses decorative gaps/sizes first. Runs after every
   * question render and on resize (see main.js). Cheap and idempotent.
   */
  Renderer.prototype.checkLayoutFit = function () {
    var stage = this.el.stage;
    if (!stage || stage.classList.contains('hidden')) return false;
    var tight = stage.scrollHeight > stage.clientHeight + 2;
    stage.classList.toggle('game--tight', tight);
    return tight;
  };

  // One measurement can race font swaps / image decode / late style settles,
  // so re-check a few beats after the question paints.
  Renderer.prototype._scheduleFitCheck = function () {
    var self = this;
    requestAnimationFrame(function () { self.checkLayoutFit(); });
    setTimeout(function () { self.checkLayoutFit(); }, 300);
    setTimeout(function () { self.checkLayoutFit(); }, 900);
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { self.checkLayoutFit(); });
    }
  };

  // Neutral, id-driven animal stage: two perfectly aligned copies of the SAME
  // local illustration — a brightness(0) black layer on top of the full-color
  // layer. Success crossfades them (CSS), so silhouette and color shapes match
  // by construction. Files stay neutral (qNNN.svg); nothing about the animal
  // leaks through markup. Missing files leave the board empty, never broken.
  Renderer.prototype._renderAnimalMount = function (state) {
    var mount = this.el.animalMount;
    var qid = state.questionId ||
      (state.silhouetteAsset || '').split('/').pop().replace('.svg', '');
    if (!qid) return;
    mount.setAttribute('aria-label', 'Mystery animal ' + (state.questionIndex + 1) + ' of ' + state.questionCount);

    if (!this._animalStage) {
      var color = document.createElement('img');
      color.className = 'animal-color';
      color.alt = '';
      color.draggable = false;
      var black = document.createElement('img');
      black.className = 'animal-black';
      black.alt = '';
      black.draggable = false;
      mount.appendChild(color);
      mount.appendChild(black);
      this._animalStage = { color: color, black: black };
      var self = this;
      [color, black].forEach(function (img) {
        img.addEventListener('error', function () {
          img.classList.add('failed');
          mount.dataset.failed = 'true';
        });
        img.addEventListener('load', function () {
          img.classList.remove('failed');
          delete mount.dataset.failed;
        });
      });
    }

    // Only touch the DOM when the question actually changes.
    if (this._animalQid !== qid) {
      this._animalQid = qid;
      mount.dataset.qid = qid;
      var url = this.assets.animalUrl(qid);
      if (this._animalStage.color.getAttribute('src') !== url) {
        this._animalStage.color.src = url;
        this._animalStage.black.src = url;
      }
      mount.classList.remove('revealed'); // every new question starts black
    } else {
      mount.classList.remove('revealed');
    }
  };

  // Warm the next animal's file so advancing questions never flashes empty.
  Renderer.prototype.preloadSilhouette = function (questionAssetPath) {
    var qid = (questionAssetPath || '').split('/').pop().replace('.svg', '');
    if (!qid || !this.assets.animalUrl) return;
    var img = new Image();
    img.src = this.assets.animalUrl(qid);
  };

  // Called only from the engine's 'correct' event: black -> color crossfade.
  Renderer.prototype.revealAnimal = function () {
    this.el.animalMount.classList.add('revealed');
  };

  Renderer.prototype._renderHearts = function (hearts, max) {
    var html = '';
    for (var i = 0; i < max; i++) {
      html += i < hearts ? HEART : '<span class="off">' + HEART + '</span>';
    }
    this.el.hud.hearts.innerHTML = html;
  };

  Renderer.prototype._renderSlots = function (slots, rebuild) {
    var box = this.el.slots;
    var needRebuild = rebuild || this._lastSlots === null || box.children.length !== slots.length;
    if (needRebuild) {
      box.innerHTML = '';
      var cols = slots.length <= 8 ? slots.length : Math.ceil(slots.length / 2);
      box.style.setProperty('--slot-cols', String(cols));
      slots.forEach(function (s, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.setAttribute('data-action', 'slot');
        b.setAttribute('data-slot', String(i));
        b.setAttribute('aria-label', 'Answer slot ' + (i + 1) +
          (s.letter ? ', letter ' + s.letter + ', tap to remove' : ', empty'));
        b.innerHTML = '<span class="art" aria-hidden="true"></span><span class="glyph" aria-hidden="true"></span>';
        box.appendChild(b);
      });
      this._lastSlots = slots.length;
    }
    Array.prototype.forEach.call(box.children, function (b, i) {
      var s = slots[i];
      var glyph = b.querySelector('.glyph');
      var had = glyph.textContent;
      glyph.textContent = s.letter || '';
      if (s.letter && s.letter !== had) {
        glyph.classList.remove('pop');
        void glyph.offsetWidth;
        glyph.classList.add('pop');
      }
      b.classList.toggle('locked', !!s.locked);
      b.disabled = !s.letter || s.locked;
      b.setAttribute('aria-label', 'Answer slot ' + (i + 1) +
        (s.letter ? (s.locked ? ', letter ' + s.letter + ' revealed by hint' : ', letter ' + s.letter + ', tap to remove') : ', empty'));
    });
  };

  Renderer.prototype._renderBank = function (tiles, rebuild) {
    var box = this.el.bank;
    var ids = tiles.map(function (t) { return t.id; }).join(',');
    if (rebuild || this._lastTiles !== ids) {
      box.innerHTML = '';
      var count = tiles.length;
      // desktop: one centered row up to 9 tiles, two balanced rows above that
      var colsWide = count <= 9 ? count : Math.ceil(count / 2);
      // phone (reference layout): 3 equal columns x 3 rows for 9 tiles,
      // balanced 4 columns for 10-16 tile banks
      var colsNarrow = Letters.gridColumns(count);
      box.style.setProperty('--cols-wide', String(colsWide));
      box.style.setProperty('--cols-narrow', String(colsNarrow));
      tiles.forEach(function (t, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile';
        b.textContent = t.letter;
        b.setAttribute('data-action', 'tile');
        b.setAttribute('data-tile', t.id);
        b.setAttribute('aria-label', 'Letter ' + t.letter);
        b.style.animationDelay = (i * 26) + 'ms';
        box.appendChild(b);
      });
      this._lastTiles = ids;
    }
    Array.prototype.forEach.call(box.children, function (b) {
      var tile = null;
      for (var i = 0; i < tiles.length; i++) if (tiles[i].id === b.getAttribute('data-tile')) { tile = tiles[i]; break; }
      if (tile) b.classList.toggle('used', tile.used);
    });
  };

  Renderer.prototype._renderActions = function (state) {
    var btn = this.el.btnHint;
    var allRevealed = !state.hintUnsolved;
    // Disabled ONLY when nothing is left to reveal: an unaffordable hint stays
    // tappable so the engine can answer with the friendly "Need 50 stars" message.
    btn.disabled = allRevealed;
    btn.classList.toggle('low-stars', !!state.hintUnaffordable);
    btn.setAttribute('aria-label', allRevealed
      ? 'Hint: all letters revealed'
      : state.hintUnaffordable
        ? 'Hint: reveal one letter — need 50 stars, you have ' + state.starBalance
        : 'Hint: reveal one letter, costs 50 stars');
    btn.title = allRevealed ? 'All letters revealed'
      : state.hintUnaffordable ? 'Need 50 stars for a hint (you have ' + state.starBalance + ')'
      : 'Reveal one letter — 50 ★';
  };

  // Full snapshot sync (safe to call after every engine event).
  Renderer.prototype.syncGame = function (state) {
    this._renderSlots(state.slots);
    this._renderBank(state.tiles);
    this._renderHearts(state.hearts, state.heartsMax);
    this._renderActions(state);
    // The HUD star counter is the SPENDABLE wallet (hints pay from it);
    // level score still appears in the success/results dialogs.
    this.el.hud.score.setAttribute('aria-label', 'Star points: ' + state.starBalance + ' (hints cost 50)');
    this.el.hud.score.querySelector('b').textContent = state.starBalance;
    if (state.timer) {
      this.el.hud.timerText.textContent = String(Math.ceil(state.timer.remainingMs / 1000));
      this.el.hud.timer.classList.toggle('low', state.timer.remainingMs <= 10500);
    }
  };

  // Small "-50 ★" pulse anchored to the HUD star badge after each paid hint.
  Renderer.prototype.starFloat = function (text) {
    var badge = this.el.hud.score;
    var d = document.createElement('span');
    d.className = 'star-float';
    d.textContent = text;
    badge.appendChild(d);
    setTimeout(function () { d.remove(); }, 1200);
  };

  // One-time, non-intrusive welcome-credit note on the home screen.
  Renderer.prototype.showStarterToast = function (text) {
    var home = this.el.screens.home;
    if (!home) return;
    var t = home.querySelector('.starter-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'starter-toast';
      home.appendChild(t);
    }
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    if (this._starterTimer) { clearTimeout(this._starterTimer); this._starterTimer = null; }
    var el = t;
    this._starterTimer = setTimeout(function () { el.classList.remove('show'); }, 5200);
  };

  // step = solved count (0..4); markers show done / current / upcoming states.
  Renderer.prototype.renderProgress = function (solvedCount) {
    if (solvedCount === this._step) return;
    var box = this.el.progressMarkers;
    if (box.children.length !== 4) {
      box.innerHTML = '';
      for (var i = 0; i < 4; i++) {
        var m = document.createElement('span');
        m.className = 'marker';
        m.textContent = String(i + 1);
        m.setAttribute('aria-label', 'Question ' + (i + 1));
        box.appendChild(m);
      }
    }
    for (var j = 0; j < 4; j++) {
      var el = box.children[j];
      var isDone = j < solvedCount;
      var isCurrent = j === solvedCount;
      var was = el.className;
      el.className = 'marker' + (isDone ? ' done' : isCurrent ? ' current' : '');
      if (isDone && was.indexOf('done') === -1) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      el.setAttribute('aria-label', 'Question ' + (j + 1) + (isDone ? ', solved' : isCurrent ? ', current' : ', upcoming'));
    }
    this._step = solvedCount;
  };

  /* ---------------- feedback ---------------- */

  Renderer.prototype.showBubble = function (text, mood, sticky) {
    var b = this.el.bubble;
    b.textContent = text;
    b.className = 'bubble ' + (mood || '');
    b.classList.remove('hidden');
    if (this._bubbleTimer) { clearTimeout(this._bubbleTimer); this._bubbleTimer = null; }
    if (!sticky) {
      this._bubbleTimer = setTimeout(function () { b.classList.add('hidden'); }, 2200);
    }
  };

  Renderer.prototype.hideBubble = function () {
    if (this._bubbleTimer) { clearTimeout(this._bubbleTimer); this._bubbleTimer = null; }
    this.el.bubble.classList.add('hidden');
  };

  Renderer.prototype.shakeSlots = function () {
    var s = this.el.slots;
    s.classList.remove('shake');
    void s.offsetWidth;
    s.classList.add('shake');
  };

  Renderer.prototype.rewardFloat = function (points) {
    var d = document.createElement('div');
    d.className = 'reward-float';
    d.textContent = '+' + points;
    this.el.boardZone.appendChild(d);
    setTimeout(function () { d.remove(); }, 1400);
  };

  Renderer.prototype.revealSuccess = function (payload) {
    this.revealAnimal(); // black silhouette -> full color, ~550ms crossfade
    this.rewardFloat(payload.reward);
    var zone = this.el.boardFrame;
    var sp = zone.querySelector('.sparkles');
    if (!sp) {
      sp = document.createElement('div');
      sp.className = 'sparkles';
      zone.appendChild(sp);
    }
    sp.classList.remove('go');
    sp.innerHTML = '';
    for (var i = 0; i < 10; i++) {
      var s = document.createElement('span');
      s.style.left = (10 + Math.random() * 80) + '%';
      s.style.top = (10 + Math.random() * 70) + '%';
      s.style.animationDelay = (Math.random() * 350) + 'ms';
      sp.appendChild(s);
    }
    void sp.offsetWidth;
    sp.classList.add('go');
  };

  /* ---------------- modals ---------------- */

  // kind 'menu' marks dialogs the player may dismiss themselves (help,
  // settings); engine dialogs (pause / correct / results / game-over) keep
  // their own flow and are not Escape-closable.
  Renderer.prototype.openModal = function (html, kind) {
    this._modalKind = kind || '';
    this.el.modal.innerHTML = html;
    this.el.overlay.classList.remove('hidden');
    var first = this.el.modal.querySelector('button');
    if (first) first.focus();
  };

  Renderer.prototype.closeModal = function () {
    this._modalKind = '';
    this.el.overlay.classList.add('hidden');
    this.el.modal.innerHTML = '';
  };

  Renderer.prototype.isModalOpen = function () {
    return !this.el.overlay.classList.contains('hidden');
  };

  Renderer.prototype.getModalKind = function () {
    return this._modalKind || '';
  };

  // "How to play": silhouette -> spell the name (small help panel).
  Renderer.prototype.showHelp = function () {
    this.openModal(
      '<h2>How to Play</h2>' +
      '<div class="fact">1&nbsp;·&nbsp;Look at the black <b>animal silhouette</b> on the classroom board and guess who it is.</div>' +
      '<div class="fact">2&nbsp;·&nbsp;Spell the animal\u2019s name: tap the <b>letter buttons</b> to fill the empty slots. Tap a letter in the answer to take it back.</div>' +
      '<div class="fact">3&nbsp;·&nbsp;Stuck? The <b>hint</b> button reveals one letter for 50&nbsp;\u2605. Solve all 4 animals to finish a level!</div>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="play">\u25B6 Play now</button>' +
      '<button class="btn btn-blue" data-action="close-modal">Got it</button>' +
      '</div>'
    , 'menu');
  };

  // Compact settings dialog for the settings the game already supports.
  Renderer.prototype.showSettings = function (soundOn) {
    this.openModal(
      '<h2>Settings</h2>' +
      '<div class="set-row">' +
      '<span>Sound effects</span>' +
      '<span class="set-ctrl"><b id="settings-sound-state">' + (soundOn ? 'On' : 'Off') + '</b>' +
      '<button type="button" class="btn btn-blue icon btn-sound" data-action="sound" aria-label="' +
        (soundOn ? 'Turn sound off' : 'Turn sound on') + '" aria-pressed="' + soundOn + '">' +
        '<svg class="snd-on" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 9v6h4l5 4.5v-15L7 9H3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/></svg>' +
        '<svg class="snd-off" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 9v6h4l5 4.5v-15L7 9H3z"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m15.5 9.5 5 5m0-5-5 5"/></svg>' +
      '</button></span>' +
      '</div>' +
      '<p class="m-sub">Levels, stars and your star wallet are saved automatically on this device.</p>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="close-modal">Done</button>' +
      '</div>'
    , 'menu');
  };

  Renderer.prototype.showPause = function () {
    this.openModal(
      '<h2>Paused</h2><p class="m-sub">Take a little breather!</p>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="resume">▶ Resume</button>' +
      '<button class="btn btn-blue" data-action="restart">↻ Restart level</button>' +
      '<button class="btn btn-red" data-action="quit">✖ Level map</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showCorrect = function (payload, onContinueLabel) {
    // The animal name is safe here: the engine emits 'correct' only after success.
    this.openModal(
      '<h2>' + payload.animal + '!</h2>' +
      '<div class="score-line">+' + payload.reward + ' points</div>' +
      '<div class="fact">💡 ' + payload.fact + '</div>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="continue">▶ ' + (onContinueLabel || 'Continue') + '</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showResults = function (payload, levelName, isLast) {
    var stars = '';
    for (var i = 1; i <= 3; i++) {
      stars += i <= payload.stars ? '<span class="lit" style="animation-delay:' + ((i - 1) * 180) + 'ms">' + STAR_LIT + '</span>'
                                  : STAR_OFF;
    }
    this.openModal(
      '<h2>Level Complete!</h2>' +
      '<p class="m-sub">' + levelName + '</p>' +
      '<div class="stars-row">' + stars + '</div>' +
      '<div class="score-line">Score: ' + payload.score + '</div>' +
      '<div class="best-line">Best: ' + (payload.best ? payload.best.bestScore : payload.score) + ' points · ' +
        (payload.best ? payload.best.bestStars : payload.stars) + '★</div>' +
      '<div class="m-buttons">' +
      (isLast
        ? '<button class="btn btn-green big" data-action="levels">🏆 Finish</button>'
        : '<button class="btn btn-green big" data-action="levels">▶ Level map</button>') +
      '<button class="btn btn-blue" data-action="replay">↻ Replay</button>' +
      '</div>'
    );
  };

  Renderer.prototype.showGameOver = function (levelName) {
    this.openModal(
      '<h2>Out of Hearts!</h2>' +
      '<p class="m-sub">' + levelName + '</p>' +
      '<div class="fact">Every expert guesses wrong sometimes — give it another try!</div>' +
      '<div class="m-buttons">' +
      '<button class="btn btn-green big" data-action="retry">↻ Retry level</button>' +
      '<button class="btn btn-blue" data-action="levels">🗺 Level map</button>' +
      '</div>'
    );
  };

  return { Renderer: Renderer };
});
